import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { collectPlayableEdges, filterEdgeRange } from './model-edges.js';
import { LiveAudioEngine } from './live-audio.js';
import { studySegments, SAMPLE_MODELS } from './samples.js';
import { axisNames, swapAssignment, parseDuration, frequency, eventFor, scanEvents,
    defaultPitch, changePitch, parsePitch, pitchName } from './mapping.js';

const $ = id => document.getElementById(id);
const status = text => $('status').textContent = text;
let selectedSample='rooftop';
const previewCache=new Map();
let axes = ['TIME', 'PITCH', 'UNUSED'];
let preset = 'pluck', mode = 'auto';
let edgeLower = 5, edgeUpper = 95;
let sourceEdges=[],selectedLayers=new Set(),modelUnits='units';
let rhinoWorker;
let duration = 60, pitch = defaultPitch(1), customPitch = false;
let edges = [], box = new THREE.Box3(), events = [];
let playing = false, offset = 0, started = 0, ctx, master, engine, analyser, audioTimer;
const meterSamples = new Float32Array(2048);
let edgeLines, activeLines, plane, loadGeneration = 0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111);
const camera = new THREE.PerspectiveCamera(45, 1, .01, 10000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
$('view').append(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;
renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
const visual = new THREE.Group();
scene.add(visual);
const loader = new GLTFLoader();

function dispose(root) {
    root.traverse(o => {
        o.geometry?.dispose();
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of materials) {
            if (!m) continue;
            for (const value of Object.values(m)) if (value?.isTexture) value.dispose();
            m.dispose();
        }
    });
}

function fit() {
    const size = box.getSize(new THREE.Vector3()).length() || 1;
    controls.target.set(0, 0, 0);
    camera.position.set(size * .85, size * .6, size * .95);
    camera.near = Math.max(size / 10000, .000001);
    camera.far = size * 100;
    camera.updateProjectionMatrix();
    controls.update();
}

function pitchSpan() {
    const k = axisNames[axes.indexOf('PITCH')];
    return box.max[k] - box.min[k];
}

function syncPitch(except) {
    for (const key of ['half', 'low', 'high']) {
        if (key !== except) $(key).value = Number(pitch[key].toPrecision(8));
    }
    $('lowNote').textContent = pitchName(pitch.low);
    $('highNote').textContent = pitchName(pitch.high);
    const center = Math.sqrt(pitch.low * pitch.high);
    $('center').textContent = `Midpoint: ${pitchName(center)} / ${center.toFixed(3)} Hz`;
    $('range').value=Number((12*Math.log2(pitch.high/pitch.low)).toFixed(4));
    $('halfUnits').textContent=modelUnits;
}

function makePlane() {
    if (plane) { visual.remove(plane); dispose(plane); }
    const k = axisNames[axes.indexOf('TIME')];
    const [u, v] = axisNames.filter(a => a !== k);
    const size = box.getSize(new THREE.Vector3());
    const w = Math.max(size[u] * 1.2, size.length() * .1);
    const h = Math.max(size[v] * 1.2, size.length() * .1);
    const corners = [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y]) => {
        const p = new THREE.Vector3(); p[u] = x*w/2; p[v] = y*h/2; return p;
    });
    const geometry = new THREE.BufferGeometry().setFromPoints(corners);
    geometry.setIndex([0,1,2,0,2,3]);
    plane = new THREE.Group();
    plane.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: .055,
        side: THREE.DoubleSide, depthWrite: false
    })));
    plane.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry),
        new THREE.LineBasicMaterial({ color: 0xaaaaaa, transparent: true, opacity: .65 })));
    visual.add(plane);
}

function rebuild(resume=false) {
    const wasPlaying=resume&&playing;
    stop(false);
    if(!edgeLines)return;
    const ranged=filterEdgeRange(edges,edgeLower,edgeUpper);
    events=ranged.map((e,id)=>{const event=eventFor(e,axes,box,duration);return event?{...event,id}:null;}).filter(Boolean);
    const center=box.getCenter(new THREE.Vector3());
    edgeLines.geometry.dispose();
    edgeLines.geometry=new THREE.BufferGeometry().setFromPoints(ranged.flatMap(e=>[e.a.clone().sub(center),e.b.clone().sub(center)]));
    $('stats').textContent=events.length.toLocaleString()+' / '+edges.length.toLocaleString()+' playable edges';
    $('edgeRangeValue').textContent=edgeLower+'–'+edgeUpper+'%';
    let lowest=ranged.length?Infinity:0,highest=0;
    for(const edge of ranged){lowest=Math.min(lowest,edge.length);highest=Math.max(highest,edge.length);}
    $('edgeLengthValue').textContent=lowest.toPrecision(4)+'–'+highest.toPrecision(4)+' '+modelUnits+' · '+(ranged.length-events.length)+' parallel ignored';
    document.querySelectorAll('[data-role]').forEach(s => s.value = String(axes.indexOf(s.dataset.role)));
    $('axesnote').textContent = axes.flatMap((role,i) => role==='UNUSED'?[]:[`${axisNames[i].toUpperCase()} / ${role}`]).join('\n');
    syncPitch();
    makePlane();
    status(events.length?'Ready':'No playable edges. Adjust axes or Edge range.');
    if(wasPlaying){started=ctx.currentTime;playing=true;schedule(offset);syncTransport();}
}

function setModel(root, name) {
    root.updateMatrixWorld(true);
    const extracted = collectPlayableEdges(root).segments;
    const bounds = new THREE.Box3().setFromObject(root);
    dispose(root);
    if (!extracted.length || bounds.isEmpty()) throw Error('No playable mesh edges.');
    if (extracted.length > 100000) throw Error('More than 100,000 edges. Simplify the model.');
    for (const e of extracted) for (const p of [e.a,e.b]) {
        if (![p.x,p.y,p.z].every(Number.isFinite)) throw Error('Invalid model coordinates.');
    }
    installSegments(extracted,bounds,name);
    $('importInfo').textContent='GLB · source coordinate units';
}

function installSegments(extracted,bounds,name,{units='units',layers=[],rhino=false}={}){
    if(!extracted.length||bounds.isEmpty())throw Error('No usable line segments.');
    stop();
    dispose(visual); visual.clear(); plane = null;
    box.copy(bounds); sourceEdges=extracted;modelUnits=units;
    const preferred=layers.filter(l=>l.visible&&/(^|::)neuma$/i.test(l.name));
    selectedLayers=new Set((preferred.length?preferred:layers.filter(l=>l.visible)).map(l=>l.index));
    edges=layers.length?sourceEdges.filter(e=>selectedLayers.has(e.layer)):sourceEdges;
    if(rhino){axes=['TIME','UNUSED','PITCH'];}
    else axes=['TIME','PITCH','UNUSED'];
    const center = box.getCenter(new THREE.Vector3());
    const points = edges.flatMap(e => [e.a.clone().sub(center),e.b.clone().sub(center)]);
    edgeLines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color: 0xaaaaaa, transparent: true, opacity: .85 }));
    visual.add(edgeLines);
    const activeGeometry = new THREE.BufferGeometry();
    activeGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sourceEdges.length*6),3));
    activeGeometry.setDrawRange(0,0);
    activeLines = new THREE.LineSegments(activeGeometry, new THREE.LineBasicMaterial({ color: 0x00ff00 }));
    activeLines.frustumCulled = false;
    visual.add(activeLines);
    customPitch = false; pitch = defaultPitch(pitchSpan());
    $('model').textContent = `Model: ${name}`;
    $('stats').textContent = `${edges.length.toLocaleString()} edges`;
    $('layerControls').hidden=!layers.length;
    const list=$('layers');list.replaceChildren();
    for(const layer of layers){
        const label=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span');
        input.type='checkbox';input.checked=selectedLayers.has(layer.index);
        text.textContent=layer.name+' · '+layer.count;
        input.onchange=()=>{
            if(input.checked)selectedLayers.add(layer.index);else selectedLayers.delete(layer.index);
            edges=sourceEdges.filter(e=>selectedLayers.has(e.layer));rebuild(true);
        };
        label.append(input,text);list.append(label);
    }
    const size=box.getSize(new THREE.Vector3());
    $('modelInfo').textContent=`${units} · ${size.toArray().map(n=>Number(n.toPrecision(5))).join(' × ')} (X / Y / Z)`;
    rebuild(); fit();
}

function rawSegments(data){
    return data.map(e=>{const a=new THREE.Vector3(...e.a),b=new THREE.Vector3(...e.b);return {...e,a,b,length:a.distanceTo(b)};});
}
function boundsFor(segments){return new THREE.Box3().setFromPoints(segments.flatMap(e=>[e.a,e.b]));}

function decodeRhino(buffer){
    // Terminating an obsolete import also releases its WASM heap.
    rhinoWorker?.terminate();
    const worker=new Worker(new URL('rhino-worker.js',window.location.href));rhinoWorker=worker;
    return new Promise((resolve,reject)=>{
        const timeout=setTimeout(()=>{worker.terminate();reject(Error('3DM decoding timed out. Simplify the file.'));},60000);
        const finish=()=>{clearTimeout(timeout);worker.terminate();if(rhinoWorker===worker)rhinoWorker=null;};
        worker.onmessage=({data})=>{finish();data.error?reject(Error(data.error)):resolve(data.model);};
        worker.onerror=()=>{finish();reject(Error('Could not decode 3DM. Try a smaller file.'));};
        worker.postMessage(buffer,[buffer]);
    });
}

async function load(file) {
    if (!file || !/\.(glb|3dm)$/i.test(file.name)) {
        status('Choose a .glb or .3dm file.'); return;
    }
    const generation = ++loadGeneration;
    stop(false); status('Loading model…');
    try {
        if (file.size > 100*1024*1024) throw Error('Choose a model smaller than 100 MB.');
        const buffer=await file.arrayBuffer();
        if(/\.3dm$/i.test(file.name)){
            const model=await decodeRhino(buffer);
            if(generation!==loadGeneration)return;
            const segments=rawSegments(model.segments);
            installSegments(segments,boundsFor(segments),file.name,{...model,rhino:true});
            $('importInfo').textContent=`3DM lines / polylines · ${model.skipped} unsupported objects skipped · ${model.hidden} hidden / definition objects skipped`;
            setSource('upload');
            return;
        }
        const gltf = await loader.parseAsync(buffer, '');
        if (generation !== loadGeneration) { dispose(gltf.scene); return; }
        setModel(gltf.scene, file.name);
        setSource('upload');
    } catch (e) {
        if (generation === loadGeneration) status(`Load error: ${e.message}`);
    }
}

async function sample() {
    const generation = ++loadGeneration;
    stop(false); status('Loading sample…');
    try {
        const kind=selectedSample,definition=SAMPLE_MODELS.find(s=>s.id===kind);
        if(!definition.file){
            const segments=rawSegments(studySegments(kind));
            const name={windows:'Window study',steps:'Stepped study',curves:'Curve study'}[kind];
            installSegments(segments,boundsFor(segments),name);
            $('importInfo').textContent='Abstract geometry study';previewCache.set(kind,Promise.resolve(segments));setSource('sample');return;
        }
        const response = await fetch(new URL('models/'+definition.file,window.location.href));
        if (!response.ok) throw Error(`HTTP ${response.status}`);
        const gltf = await loader.parseAsync(await response.arrayBuffer(), '');
        if (generation !== loadGeneration) { dispose(gltf.scene); return; }
        setModel(gltf.scene, definition.file);
        $('importInfo').textContent='Sample GLB · source coordinate units';
        previewCache.set(kind,Promise.resolve(sourceEdges));
        setSource('sample');
    } catch (e) {
        if (generation === loadGeneration) status(`Sample load error: ${e.message}`);
    }
}

function time() { return playing && mode === 'auto' ? Math.min(duration, offset + ctx.currentTime - started) : offset; }
function silence() {
    clearInterval(audioTimer); audioTimer = undefined;
    engine?.silence();
}
function stop(reset = true) {
    offset = reset ? 0 : time(); playing = false; silence();
    syncTransport();
}
async function audio() {
    if (!ctx) {
        ctx = new AudioContext(); master = ctx.createGain();
        const compressor = ctx.createDynamicsCompressor();
        analyser = ctx.createAnalyser(); analyser.fftSize = 2048;
        master.connect(compressor); compressor.connect(analyser); analyser.connect(ctx.destination);
        engine = new LiveAudioEngine(ctx,master,256);
        engine.setPreset(preset);
    }
    await ctx.resume(); master.gain.value = +$('volume').value;
}
function schedule(from) {
    silence();
    const pk = axisNames[axes.indexOf('PITCH')];
    let previous=from;
    function tick() {
        const t = mode==='manual'?offset:Math.min(duration,from+ctx.currentTime-started);
        if (mode==='auto'&&t >= duration) { stop(false); status('Finished'); return; }
        const candidates = [];
        for (const {event:e,u} of scanEvents(events,t,previous,mode==='manual',preset==='pluck')) {
            const coordinate = e.a[e.p]+(e.b[e.p]-e.a[e.p])*u;
            candidates.push({ id:e.id, frequency:frequency(coordinate,box.min[pk],pitch.half,pitch.low) });
        }
        engine.update(candidates);
        previous=t;
        status((mode==='manual'?'Holding':'Playing')+' · '+engine.represented+' edges voiced'+(engine.merged ? ' · '+engine.merged+' combined' : '')+
            (engine.outOfRange ? ' · '+engine.outOfRange+' out of frequency range' : ''));
    }
    tick();
    audioTimer = setInterval(tick,20);
}

async function startSound() {
    if (!events.length) return;
    try {
        await audio(); if (mode==='auto'&&offset>=duration)offset=0;
        started = ctx.currentTime; schedule(offset); playing = true;
        syncTransport();
    } catch (e) { status(`Audio error: ${e.message}`); }
}
$('play').onclick = () => {
    if(playing&&mode==='auto')return;
    stop(false);mode='auto';scanDrag=null;startSound();
};
$('pause').onclick = () => { stop(false); status('Paused'); };
$('stop').onclick = () => { stop(); status('Ready'); };
$('volume').oninput = () => { if (master) master.gain.setTargetAtTime(+$('volume').value,ctx.currentTime,.02); };
$('seek').oninput = () => {
    if(mode==='manual'){offset=+$('seek').value*duration;return;}
    const was = playing; stop(false); offset = +$('seek').value * duration;
    if (was) { started = ctx.currentTime; schedule(offset); playing = true;
        syncTransport(); }
};
$('duration').oninput = () => {
    const d = parseDuration($('duration').value);
    if (Number.isFinite(d) && d <= 3600) { stop(); duration = d; rebuild(); }
};
$('duration').onchange = () => {
    const d = parseDuration($('duration').value);
    if (!Number.isFinite(d) || d > 3600) { status('Duration: use seconds or m:ss, up to 60 minutes.'); $('duration').value = format(duration); }
};

function editPitch(field, final = false) {
    try {
        const value = field === 'half' ? +$('half').value : parsePitch($(field).value);
        pitch = changePitch(pitch,pitchSpan(),field,value);
        customPitch = true; stop(false); syncPitch(final ? undefined : field);
        status('Ready'); $(field).setAttribute('aria-invalid','false');
    } catch (e) {
        if (final) { status(e.message); syncPitch(); }
        $(field).setAttribute('aria-invalid','true');
    }
}
for (const field of ['half','low','high']) {
    $(field).oninput = () => editPitch(field);
    $(field).onchange = () => editPitch(field,true);
}
$('auto').onclick = () => { pitch = defaultPitch(pitchSpan()); customPitch = false; rebuild(); };
function editRange(final=false){
    const n=+$('range').value;
    if(!Number.isFinite(n)||n<1||n>96){if(final)syncPitch();return;}
    if(Math.abs(n-12*Math.log2(pitch.high/pitch.low))<1e-8)return;
    const midpoint=Math.sqrt(pitch.low*pitch.high);
    pitch={low:midpoint*2**(-n/24),high:midpoint*2**(n/24),half:pitchSpan()>0?pitchSpan()/n:1};
    customPitch=true;rebuild();
}
$('range').oninput=()=>editRange();
$('range').onchange=()=>editRange(true);
document.querySelectorAll('[data-role]').forEach(select => {
    axisNames.forEach((name,index) => select.add(new Option(name.toUpperCase(),String(index))));
    select.value = String(axes.indexOf(select.dataset.role));
    select.onchange = () => {
        const previous = axes;
        axes = swapAssignment(axes,+select.value,select.dataset.role);
        try {
            if (customPitch) pitch = changePitch(pitch,pitchSpan(),'half',pitch.half);
            else pitch = defaultPitch(pitchSpan());
            rebuild();
        } catch (e) {
            axes = previous;
            document.querySelectorAll('[data-role]').forEach(s => s.value=String(axes.indexOf(s.dataset.role)));
            status(e.message);
        }
    };
});
for (const type of ['pluck','pad']) $(type+'Button').onclick = () => {
    preset = type; engine?.setPreset(type);
    $('presetHint').textContent=type==='pluck'?'Sine · quick decay':'Sine · soft sustain';
    for (const name of ['pluck','pad']) {
        $(name+'Button').classList.toggle('active',name===type);
        $(name+'Button').setAttribute('aria-pressed',String(name===type));
    }
};
function syncTransport(){
    $('play').classList.toggle('active',playing&&mode==='auto');
    $('pause').disabled=!playing;
}
// Project the Time axis into the view so dragging follows its visible direction.
let scanDrag=null;
const scanCanvas=renderer.domElement;
scanCanvas.addEventListener('pointerdown',e=>{
    if(e.button!==0||!e.isPrimary||!events.length)return;
    stop(false);mode='manual';syncTransport();
    const k=axisNames[axes.indexOf('TIME')],center=box.getCenter(new THREE.Vector3());
    const a=new THREE.Vector3(),b=new THREE.Vector3();
    a[k]=box.min[k]-center[k];b[k]=box.max[k]-center[k];
    a.project(camera);b.project(camera);
    const rect=scanCanvas.getBoundingClientRect();
    const dx=(b.x-a.x)*rect.width/2,dy=-(b.y-a.y)*rect.height/2;
    // Looking straight along the Time axis: use horizontal dragging as a fallback.
    const fallback=dx*dx+dy*dy<400;
    scanDrag={id:e.pointerId,x:e.clientX,y:e.clientY,from:offset/duration,
        dx:fallback?rect.width*.6:dx,dy:fallback?0:dy};
    scanCanvas.setPointerCapture(e.pointerId);
    e.preventDefault();e.stopImmediatePropagation();
    startSound();
},true);
scanCanvas.addEventListener('pointermove',e=>{
    if(!scanDrag||e.pointerId!==scanDrag.id)return;
    const {x,y,from,dx,dy}=scanDrag;
    offset=Math.max(0,Math.min(1,from+((e.clientX-x)*dx+(e.clientY-y)*dy)/(dx*dx+dy*dy)))*duration;
    e.preventDefault();e.stopImmediatePropagation();
},true);
function endScanDrag(e){
    if(!scanDrag||e.pointerId!==scanDrag.id)return;
    scanDrag=null;
    if(scanCanvas.hasPointerCapture(e.pointerId))scanCanvas.releasePointerCapture(e.pointerId);
    e.stopImmediatePropagation();
}
scanCanvas.addEventListener('pointerup',endScanDrag,true);
scanCanvas.addEventListener('pointercancel',endScanDrag,true);
scanCanvas.addEventListener('lostpointercapture',()=>{scanDrag=null;});
for(const [id,field] of [['edgeLower','min'],['edgeUpper','max']])$(id).oninput=()=>{
    if(field==='min'){edgeLower=+$(id).value;edgeUpper=Math.max(edgeLower,edgeUpper);}
    else{edgeUpper=+$(id).value;edgeLower=Math.min(edgeLower,edgeUpper);}
    $('edgeLower').value=edgeLower;$('edgeUpper').value=edgeUpper;
    const range=$('edgeLower').parentElement;
    range.style.setProperty('--lower',edgeLower/100);range.style.setProperty('--upper',edgeUpper/100);
    rebuild(true);
};
$('load').onclick = () => $('file').click();
function setSource(source){
    for(const [id,value] of [['sampleButton','sample'],['load','upload']]){
        $(id).classList.toggle('active',source===value);
        $(id).setAttribute('aria-pressed',String(source===value));
    }
}
function previewSegments(definition){
    if(!previewCache.has(definition.id))previewCache.set(definition.id,(async()=>{
        if(!definition.file)return rawSegments(studySegments(definition.id));
        const response=await fetch(new URL('models/'+definition.file,window.location.href));
        if(!response.ok)throw Error('Preview unavailable.');
        const gltf=await loader.parseAsync(await response.arrayBuffer(),'');
        try{return collectPlayableEdges(gltf.scene).segments;}finally{dispose(gltf.scene);}
    })());
    return previewCache.get(definition.id);
}
function drawPreview(canvas,segments){
    const bounds=boundsFor(segments),center=bounds.getCenter(new THREE.Vector3());
    const points=segments.flatMap(e=>[e.a.clone().sub(center),e.b.clone().sub(center)]);
    const size=bounds.getSize(new THREE.Vector3()).length()||1;
    const eye=new THREE.PerspectiveCamera(45,1.7,size/10000,size*100);
    eye.position.set(size*.85,size*.6,size*.95);eye.lookAt(0,0,0);eye.updateMatrixWorld();
    const projected=points.map(p=>p.project(eye));
    const ext=new THREE.Box3().setFromPoints(projected),span=ext.getSize(new THREE.Vector3());
    const scale=Math.min((canvas.width-32)/(span.x||1),(canvas.height-24)/(span.y||1));
    const mid=ext.getCenter(new THREE.Vector3()),c=canvas.getContext('2d');
    c.clearRect(0,0,canvas.width,canvas.height);c.strokeStyle='#aaa';c.lineWidth=1;
    c.beginPath();
    for(let i=0;i<projected.length;i+=2){
        const a=projected[i],b=projected[i+1];
        c.moveTo(canvas.width/2+(a.x-mid.x)*scale,canvas.height/2-(a.y-mid.y)*scale);
        c.lineTo(canvas.width/2+(b.x-mid.x)*scale,canvas.height/2-(b.y-mid.y)*scale);
    }
    c.stroke();
}
for(const definition of SAMPLE_MODELS){
    const card=document.createElement('button'),canvas=document.createElement('canvas'),name=document.createElement('span'),description=document.createElement('span');
    card.className='sampleCard';card.type='button';card.setAttribute('aria-label',definition.name);
    canvas.width=340;canvas.height=200;canvas.setAttribute('aria-hidden','true');
    name.className='sampleName';name.textContent=definition.name;
    description.className='small';description.textContent=definition.description;
    card.append(canvas,name,description);$('sampleGrid').append(card);
    card.onclick=()=>{selectedSample=definition.id;$('sampleDialog').close();sample();};
}
$('sampleButton').onclick=()=>{
    stop(false);$('sampleDialog').showModal();
    const cards=[...$('sampleGrid').children];
    SAMPLE_MODELS.forEach((definition,i)=>{
        cards[i].classList.toggle('active',definition.id===selectedSample&&$('sampleButton').getAttribute('aria-pressed')==='true');
        previewSegments(definition).then(segments=>drawPreview(cards[i].querySelector('canvas'),segments)).catch(()=>{cards[i].querySelector('.small').textContent='Preview unavailable';previewCache.delete(definition.id);});
    });
};
$('closeSamples').onclick=()=>$('sampleDialog').close();
$('file').onchange = () => { load($('file').files[0]); $('file').value = ''; };
$('fit').onclick = fit;
$('settingsToggle').onclick = () => {
    const open = document.body.classList.toggle('settingsOpen');
    $('settingsToggle').setAttribute('aria-expanded',String(open));
};
for (const type of ['dragover','dragleave','drop']) document.addEventListener(type,e => {
    e.preventDefault(); document.body.classList.toggle('drag',type === 'dragover');
    if (type === 'drop') load(e.dataTransfer.files[0]);
});
document.addEventListener('visibilitychange', () => { if (document.hidden && playing) { stop(false); status('Paused'); } });
function format(t) { return `${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`; }
new ResizeObserver(() => {
    const { width,height } = $('view').getBoundingClientRect();
    renderer.setSize(width,height); camera.aspect = width/height; camera.updateProjectionMatrix();
}).observe($('view'));

function animate() {
    requestAnimationFrame(animate);
    const t = time();
    if (playing && mode==='auto' && t >= duration) { stop(false); status('Finished'); }
    if (plane) {
        const k = axisNames[axes.indexOf('TIME')], center = box.getCenter(new THREE.Vector3());
        plane.position.set(0,0,0);
        plane.position[k] = box.min[k]+(box.max[k]-box.min[k])*t/duration-center[k];
        const active=(playing||mode==='manual')?events.filter(e=>t>=e.start&&(mode==='manual'?t<=e.end:t<e.end)):[];
        const positions = activeLines.geometry.attributes.position;
        let index = 0;
        for (const e of active) for (const p of [e.a,e.b]) positions.setXYZ(index++,p.x-center.x,p.y-center.y,p.z-center.z);
        activeLines.geometry.setDrawRange(0,index); positions.needsUpdate = true;
        $('voices').textContent = `${engine?.active || 0} voices`;
        $('intersections').textContent = `${active.length} intersecting edges`;
    }
    if (document.activeElement !== $('seek')) $('seek').value = t/duration;
    $('clock').textContent = `${format(t)} / ${format(duration)}`;
    $('positionValue').textContent=(t/duration*100).toFixed(1)+'%';
    if (analyser) {
        analyser.getFloatTimeDomainData(meterSamples);
        const rms = Math.sqrt(meterSamples.reduce((sum,x)=>sum+x*x,0)/meterSamples.length);
        $('audioLevel').textContent = rms>0.00001 ? 'Output: '+(20*Math.log10(rms)).toFixed(1)+' dB' : 'Output: silent';
    }
    controls.update(); renderer.render(scene,camera);
}
sample(); animate();
