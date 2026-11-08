import {strict as assert} from 'node:assert';
import * as THREE from 'three';
import {swapAssignment,parseDuration,frequency,eventFor,defaultPitch,changePitch,parsePitch,pitchName,D4} from './src/mapping.js';
import {collectPlayableEdges,filterEdgeRange} from './src/model-edges.js';
assert.deepEqual(swapAssignment(['TIME','PITCH','TIMBRE'],0,'PITCH'),['PITCH','TIME','TIMBRE']);
assert.deepEqual(swapAssignment(['TIME','PITCH','UNUSED'],2,'TIME'),['UNUSED','PITCH','TIME']);
assert.deepEqual(swapAssignment(['TIME','PITCH','UNUSED'],1,'TIME'),['PITCH','TIME','UNUSED']);
assert.equal(parseDuration('1:00'),60);assert.equal(parseDuration('2:30'),150);assert.ok(Number.isNaN(parseDuration('1:99')));assert.ok(Number.isNaN(parseDuration('0')));
assert.equal(frequency(0,0,1),440);assert.equal(frequency(12,0,1),880);
const root=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(2,4,6));mesh.position.set(10,20,30);root.add(mesh);const result=collectPlayableEdges(root);assert.equal(result.segments.length,12);assert.equal(Math.min(...result.segments.flatMap(e=>[e.a.x,e.b.x])),9);
const box=new THREE.Box3(new THREE.Vector3(0,0,0),new THREE.Vector3(10,20,30));
const e=eventFor({a:new THREE.Vector3(10,20,30),b:new THREE.Vector3(0,0,0)},['TIME','PITCH','TIMBRE'],box,60);assert.equal(e.start,0);assert.equal(e.end,60);assert.equal(e.a.x,0);
const instant=eventFor({a:new THREE.Vector3(5,1,1),b:new THREE.Vector3(5,2,2)},['TIME','PITCH','UNUSED'],box,60);assert.equal(instant,null);
const degenerate=eventFor({a:new THREE.Vector3(0,1,1),b:new THREE.Vector3(0,2,2)},['TIME','PITCH','UNUSED'],new THREE.Box3(new THREE.Vector3(0,0,0),new THREE.Vector3(0,2,2)),60);assert.equal(degenerate,null);
const nearParallel=eventFor({a:new THREE.Vector3(5,1,1),b:new THREE.Vector3(5+1e-12,2,2)},['TIME','PITCH','UNUSED'],box,60);assert.equal(nearParallel,null);
const short=eventFor({a:new THREE.Vector3(5,1,1),b:new THREE.Vector3(5.01,2,2)},['TIME','PITCH','UNUSED'],box,60);assert.ok(Math.abs(short.end-short.start-.06)<1e-10);
const lengths=[1,2,3,4,10].map(length=>({length}));
assert.deepEqual(filterEdgeRange(lengths,0,75).map(e=>e.length),[1,2,3,4]);
assert.deepEqual(filterEdgeRange(lengths,25,75).map(e=>e.length),[2,3,4]);
assert.deepEqual(filterEdgeRange(lengths,0,100),lengths);
console.log('Mapping, axis swapping, durations, world-space edges and degenerate-axis tests passed.');
const approx=(actual,expected)=>assert.ok(Math.abs(actual-expected)<Math.abs(expected)*1e-10,`${actual} != ${expected}`);
const initial=defaultPitch(48);
approx(initial.half,1);approx(initial.low,parsePitch('D2'));approx(initial.high,parsePitch('D6'));approx(Math.sqrt(initial.low*initial.high),D4);
assert.equal(pitchName(D4),'D4');approx(parsePitch('A4'),440);approx(parsePitch('440 Hz'),440);
const lowChanged=changePitch(initial,48,'low',parsePitch('D3'));
approx(lowChanged.high,initial.high);approx(lowChanged.half,48/36);
const highChanged=changePitch(initial,48,'high',parsePitch('D5'));
approx(highChanged.low,initial.low);approx(highChanged.half,48/36);
const halfChanged=changePitch(initial,48,'half',2);
approx(halfChanged.low,parsePitch('D3'));approx(halfChanged.high,parsePitch('D5'));approx(Math.sqrt(halfChanged.low*halfChanged.high),D4);
approx(frequency(48,0,halfChanged.half,halfChanged.low),halfChanged.high);
assert.throws(()=>changePitch(initial,48,'low',initial.high));assert.throws(()=>changePitch(initial,48,'half',0));
console.log('48-semitone D4 defaults and linked low/high/half-tone edits passed.');

const {scanEvents}=await import('./src/mapping.js');
const tiny={start:.005,end:.009};
assert.equal(scanEvents([tiny],.02,0,false,true).length,1);
assert.equal(scanEvents([tiny],.04,.02,false,true).length,0);
assert.equal(scanEvents([tiny],.02,0,true,true).length,0);
assert.equal(scanEvents([tiny],.02,0,false,false).length,0);
assert.equal(scanEvents([tiny],.009,0,true,false)[0].u,1);
console.log('Sub-tick Pluck events are caught once; manual scans only play current intersections.');

const {fitModelCamera}=await import('./src/model-view.js');
const nativeBox=new THREE.Box3(new THREE.Vector3(0,0,0),new THREE.Vector3(2,1,8)),savedBox=nativeBox.clone();
const viewCamera=new THREE.PerspectiveCamera(45,1,.01,1000);
for(const zUp of [true,false,true]){
    fitModelCamera(viewCamera,nativeBox,zUp);
    const vertical=new THREE.Vector3(0,zUp?0:1,zUp?1:0).project(viewCamera);
    const origin=new THREE.Vector3().project(viewCamera);
    assert.ok(Math.abs(vertical.x-origin.x)<1e-10);assert.ok(vertical.y>origin.y);
    assert.deepEqual(viewCamera.up.toArray(),zUp?[0,0,1]:[0,1,0]);
    assert.ok(nativeBox.equals(savedBox));
}
console.log('Rhino Z-up and GLB Y-up project vertically across repeated switches without changing model bounds.');

const {durationFromBeat,beatFromDuration}=await import('./src/mapping.js');
assert.equal(durationFromBeat(120,2,60),60);
assert.equal(durationFromBeat(120,2,120),30);
assert.equal(durationFromBeat(120,4,60),30);
assert.equal(beatFromDuration(120,60,60),2);
for(const span of [.133,1000,3000]){const distance=beatFromDuration(span,60,60);assert.ok(Math.abs(durationFromBeat(span,distance,60)-60)<1e-10);}
assert.throws(()=>durationFromBeat(0,1,60));assert.throws(()=>durationFromBeat(1,0,60));
assert.throws(()=>durationFromBeat(1,1,0));assert.throws(()=>durationFromBeat(10000,.001,60));
console.log('Beat distance, BPM and duration conversions, native-unit spans and invalid inputs passed.');
