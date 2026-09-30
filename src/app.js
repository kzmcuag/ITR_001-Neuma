import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { collectPlayableEdges } from './model-edges.js';
import { axisNames, swapAssignment, parseDuration, frequency, eventFor,
    defaultPitch, changePitch, parsePitch, pitchName } from './mapping.js';

const $ = id => document.getElementById(id);
const status = text => $('status').textContent = text;
const sampleURL = new URL('models/test_plasticNumber.glb', window.location.href);
let axes = ['TIME', 'PITCH', 'TIMBRE'];
let duration = 60, pitch = defaultPitch(1), customPitch = false;
let edges = [], box = new THREE.Box3(), events = [];
let playing = false, offset = 0, started = 0, ctx, master, voices = [];
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

function rebuild() {
    stop(false);
    events = edges.map(e => eventFor(e, axes, box, duration));
    document.querySelectorAll('[data-axis]').forEach(s => s.value = axes[+s.dataset.axis]);
    $('axesnote').textContent = axes.map((role,i) => `${axisNames[i].toUpperCase()} / ${role}`).join('\n');
    syncPitch();
    makePlane();
    status(pitchSpan() > 0 ? 'Ready' : 'Pitch axis has zero length. All edges use minimum pitch.');
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

function time() { return playing ? Math.min(duration, offset + ctx.currentTime - started) : offset; }
function silence() {
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const v of voices) {
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setTargetAtTime(0, now, .005);
        for (const o of v.osc) { try { o.stop(now + .03); } catch {} }
    }
    voices = [];
}
function stop(reset = true) {
    offset = reset ? 0 : time(); playing = false; silence();
    $('play').textContent = 'Play'; $('play').classList.remove('active');
}
async function audio() {
    if (!ctx) {
        ctx = new AudioContext(); master = ctx.createGain();
        const compressor = ctx.createDynamicsCompressor();
        master.connect(compressor); compressor.connect(ctx.destination);
    }
    await ctx.resume(); master.gain.value = +$('volume').value;
}
function schedule(from) {
    silence();
    const now = ctx.currentTime;
    const pk = axisNames[axes.indexOf('PITCH')], ck = axisNames[axes.indexOf('TIMBRE')];
    const cspan = box.max[ck] - box.min[ck], limit = ctx.sampleRate * .45;
    let skipped = 0, occupied = [];
    for (const e of [...events].sort((a,b) => a.start-b.start)) {
        if (e.end <= from) continue;
        const begin = Math.max(from,e.start), u = (begin-e.start)/(e.end-e.start);
        const coord = e.a[e.p] + (e.b[e.p]-e.a[e.p])*u;
        const f0 = frequency(coord,box.min[pk],pitch.half,pitch.low);
        const f1 = frequency(e.b[e.p],box.min[pk],pitch.half,pitch.low);
        if (!Number.isFinite(f0) || !Number.isFinite(f1) || Math.min(f0,f1) >= limit) { skipped++; continue; }
        occupied = occupied.filter(t => t > begin);
        if (occupied.length >= 64) { skipped++; continue; }
        occupied.push(e.end);
        const t0 = now+begin-from+.02, t1 = now+e.end-from+.02;
        const gain = ctx.createGain(), sine = ctx.createOscillator(), rich = ctx.createOscillator();
        const sg = ctx.createGain(), rg = ctx.createGain();
        sine.type = 'sine'; rich.type = 'sawtooth';
        const c0 = cspan > 0 ? (e.a[e.c]+(e.b[e.c]-e.a[e.c])*u-box.min[ck])/cspan : 0;
        const c1 = cspan > 0 ? (e.b[e.c]-box.min[ck])/cspan : 0;
        for (const o of [sine,rich]) {
            o.frequency.setValueAtTime(Math.min(limit,f0),t0);
            o.frequency.exponentialRampToValueAtTime(Math.min(limit,f1),t1);
            o.start(t0); o.stop(t1+.025);
        }
        sg.gain.setValueAtTime(1-c0,t0); sg.gain.linearRampToValueAtTime(1-c1,t1);
        rg.gain.setValueAtTime(c0*.35,t0); rg.gain.linearRampToValueAtTime(c1*.35,t1);
        sine.connect(sg).connect(gain); rich.connect(rg).connect(gain); gain.connect(master);
        gain.gain.setValueAtTime(0,t0);
        gain.gain.linearRampToValueAtTime(.06,t0+Math.min(.008,(t1-t0)/3));
        gain.gain.setValueAtTime(.06,Math.max(t0+.008,t1-.012));
        gain.gain.linearRampToValueAtTime(0,t1+.02);
        const voice = { gain, osc: [sine,rich] }; voices.push(voice);
        rich.onended = () => {
            for (const node of [gain,sine,rich,sg,rg]) node.disconnect();
            voices = voices.filter(v => v !== voice);
        };
    }
    status(skipped ? `Playing · ${skipped} edges skipped (frequency / 64 voices).` : 'Playing');
}

$('play').onclick = async () => {
    if (playing) { stop(false); status('Paused'); return; }
    if (!edges.length) return;
    try {
        await audio(); if (offset >= duration) offset = 0;
        started = ctx.currentTime; schedule(offset); playing = true;
        $('play').textContent = 'Pause'; $('play').classList.add('active');
    } catch (e) { status(`Audio error: ${e.message}`); }
};
$('stop').onclick = () => { stop(); status('Ready'); };
$('volume').oninput = () => { if (master) master.gain.setTargetAtTime(+$('volume').value,ctx.currentTime,.02); };
$('seek').oninput = () => {
    const was = playing; stop(false); offset = +$('seek').value * duration;
    if (was) { started = ctx.currentTime; schedule(offset); playing = true;
        $('play').textContent = 'Pause'; $('play').classList.add('active'); }
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
document.querySelectorAll('[data-axis]').forEach(s => {
    for (const role of axes) s.add(new Option(role,role));
    s.onchange = () => {
        const previousAxes = axes;
        axes = swapAssignment(axes,+s.dataset.axis,s.value);
        try {
            if (customPitch) pitch = changePitch(pitch,pitchSpan(),'half',pitch.half);
            else pitch = defaultPitch(pitchSpan());
            rebuild();
        } catch (e) {
            axes = previousAxes;
            document.querySelectorAll('[data-axis]').forEach(s => s.value = axes[+s.dataset.axis]);
            status(e.message);
        }
    };
});
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
    if (playing && t >= duration) { stop(false); status('Finished'); }
    if (plane) {
        const k = axisNames[axes.indexOf('TIME')], center = box.getCenter(new THREE.Vector3());
        plane.position.set(0,0,0);
        plane.position[k] = box.min[k]+(box.max[k]-box.min[k])*t/duration-center[k];
        const active = playing ? events.filter(e => t >= e.start && t < e.end) : [];
        const positions = activeLines.geometry.attributes.position;
        let index = 0;
        for (const e of active) for (const p of [e.a,e.b]) positions.setXYZ(index++,p.x-center.x,p.y-center.y,p.z-center.z);
        activeLines.geometry.setDrawRange(0,index); positions.needsUpdate = true;
        $('voices').textContent = `${active.length} edges`;
    }
    if (document.activeElement !== $('seek')) $('seek').value = t/duration;
    $('clock').textContent = `${format(t)} / ${format(duration)}`;
    controls.update(); renderer.render(scene,camera);
}
sample(); animate();
