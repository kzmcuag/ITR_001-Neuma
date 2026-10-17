import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { collectPlayableEdges, filterEdgeRange } from './model-edges.js';
import { LiveAudioEngine } from './live-audio.js';
import { axisNames, swapAssignment, parseDuration, frequency, eventFor,
    defaultPitch, changePitch, parsePitch, pitchName } from './mapping.js';

const $ = id => document.getElementById(id);
const status = text => $('status').textContent = text;
const sampleURL = new URL('models/test_plasticNumber.glb', window.location.href);
let axes = ['TIME', 'PITCH', 'UNUSED'];
let waveform = 'sine', mode = 'auto';
let edgeLower = 5, edgeUpper = 100;
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
    if(!edges.length)return;
    const ranged=filterEdgeRange(edges,edgeLower,edgeUpper);
    events=ranged.map((e,id)=>{const event=eventFor(e,axes,box,duration);return event?{...event,id}:null;}).filter(Boolean);
    const center=box.getCenter(new THREE.Vector3());
    edgeLines.geometry.dispose();
    edgeLines.geometry=new THREE.BufferGeometry().setFromPoints(ranged.flatMap(e=>[e.a.clone().sub(center),e.b.clone().sub(center)]));
    $('stats').textContent=events.length.toLocaleString()+' / '+edges.length.toLocaleString()+' playable edges';
    $('edgeRangeValue').textContent=edgeLower+'–'+edgeUpper+'%';
    let lowest=ranged.length?Infinity:0,highest=0;
    for(const edge of ranged){lowest=Math.min(lowest,edge.length);highest=Math.max(highest,edge.length);}
    $('edgeLengthValue').textContent=lowest.toPrecision(4)+'–'+highest.toPrecision(4)+' units · '+(ranged.length-events.length)+' parallel ignored';
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
    stop();
    dispose(visual); visual.clear(); plane = null;
    box.copy(bounds); edges = extracted;
    const center = box.getCenter(new THREE.Vector3());
    const points = edges.flatMap(e => [e.a.clone().sub(center),e.b.clone().sub(center)]);
    edgeLines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color: 0xaaaaaa, transparent: true, opacity: .85 }));
    visual.add(edgeLines);
    const activeGeometry = new THREE.BufferGeometry();
    activeGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(edges.length*6),3));
    activeGeometry.setDrawRange(0,0);
    activeLines = new THREE.LineSegments(activeGeometry, new THREE.LineBasicMaterial({ color: 0x00ff00 }));
    activeLines.frustumCulled = false;
    visual.add(activeLines);
    customPitch = false; pitch = defaultPitch(pitchSpan());
    $('model').textContent = `Model: ${name}`;
    $('stats').textContent = `${edges.length.toLocaleString()} edges`;
    rebuild(); fit();
}

async function load(file) {
    if (!file || !file.name.toLowerCase().endsWith('.glb')) {
        status('Choose a .glb file.'); return;
    }
    const generation = ++loadGeneration;
    stop(false); status('Loading model…');
    try {
        if (file.size > 100*1024*1024) throw Error('Choose a model smaller than 100 MB.');
        const gltf = await loader.parseAsync(await file.arrayBuffer(), '');
        if (generation !== loadGeneration) { dispose(gltf.scene); return; }
        setModel(gltf.scene, file.name);
    } catch (e) {
        if (generation === loadGeneration) status(`Load error: ${e.message} Use an embedded, uncompressed GLB.`);
    }
}

async function sample() {
    const generation = ++loadGeneration;
    stop(false); status('Loading sample…');
    try {
        const response = await fetch(sampleURL);
        if (!response.ok) throw Error(`HTTP ${response.status}`);
        const gltf = await loader.parseAsync(await response.arrayBuffer(), '');
        if (generation !== loadGeneration) { dispose(gltf.scene); return; }
        setModel(gltf.scene, 'test_plasticNumber.glb');
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
        engine.setWaveform(waveform);
    }
    await ctx.resume(); master.gain.value = +$('volume').value;
}
function schedule(from) {
    silence();
    const pk = axisNames[axes.indexOf('PITCH')];
    function tick() {
        const t = mode==='manual'?offset:Math.min(duration,from+ctx.currentTime-started);
        if (mode==='auto'&&t >= duration) { stop(false); status('Finished'); return; }
        const candidates = [];
        for (const e of events) {
            if (t < e.start || (mode==='manual'?t>e.end:t>=e.end)) continue;
            const u = (t-e.start)/(e.end-e.start);
            const coordinate = e.a[e.p]+(e.b[e.p]-e.a[e.p])*u;
            candidates.push({ id:e.id, frequency:frequency(coordinate,box.min[pk],pitch.half,pitch.low) });
        }
        engine.update(candidates);
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
for (const type of ['sine','sawtooth']) $(type+'Button').onclick = () => {
    waveform = type; engine?.setWaveform(type);
    for (const name of ['sine','sawtooth']) {
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
$('file').onchange = () => { load($('file').files[0]); $('file').value = ''; };
$('demo').onclick = sample; $('fit').onclick = fit;
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
