import {strict as assert} from 'node:assert';
import {LiveAudioEngine,groupPitches} from './src/live-audio.js';
let nodes=0,starts=0;
const parameter=()=>({value:0,constant:0,cancelScheduledValues(){},setTargetAtTime(value,time,constant){this.value=value;this.constant=constant;}});
const node=()=>{nodes++;return {gain:parameter(),frequency:parameter(),connect(target){return target;},start(){starts++;}};};
const context={currentTime:0,sampleRate:48000,createGain:node,createOscillator:node};
const engine=new LiveAudioEngine(context,{},64);
assert.equal(nodes,128);assert.equal(starts,64);
const initialNodes=nodes;
for(let tick=0;tick<100;tick++){
    context.currentTime=tick*.02;
    engine.update(Array.from({length:782},(_,id)=>({id:tick*1000+id,frequency:73+id})));
    assert.ok(engine.active<=64);assert.equal(engine.represented,782);assert.equal(nodes,initialNodes);
}
engine.silence();context.currentTime=10;
const scene=Array.from({length:80},(_,id)=>({id,frequency:330})).concat({id:81,frequency:1174});
engine.update(scene);
assert.equal(engine.active,2);assert.equal(engine.merged,79);
const middle=engine.pool.find(v=>v.members.has(0));
const top=engine.pool.find(v=>v.members.has(81));
assert.ok(middle.gain.gain.value>top.gain.gain.value);
const initial=middle.gain.gain.value;
engine.update([{id:0,frequency:330},{id:81,frequency:1174}]);
assert.ok(Math.abs(middle.gain.gain.value-initial)<1e-12);
context.currentTime+=.28;engine.update([{id:0,frequency:331},{id:81,frequency:1174}]);
assert.equal(middle.onset,10); // changing pitch bins does not retrigger the pluck
assert.ok(middle.gain.gain.value<initial*.38&&middle.gain.gain.value>initial*.35);
context.currentTime+=.28;engine.update([{id:100,frequency:331},{id:81,frequency:1174}]);
assert.ok(engine.pool.find(v=>v.members.has(100)).gain.gain.value>initial*.9); // new source edge attacks again
engine.silence();context.currentTime=20;engine.update([{id:1,frequency:440}]);
context.currentTime=20.1;engine.update([]);
assert.ok(engine.pool.some(v=>v.gain.gain.value>0)); // a short edge can ring out
engine.silence();assert.ok(engine.pool.every(v=>v.gain.gain.value===0));
engine.setPreset('pad');engine.update([{id:5,frequency:294}]);
const pad=engine.pool.find(v=>v.members.has(5)),padLevel=pad.gain.gain.value;
assert.equal(pad.gain.gain.constant,.09);
context.currentTime+=2;engine.update([{id:5,frequency:294}]);assert.equal(pad.gain.gain.value,padLevel);
engine.update([]);assert.equal(pad.gain.gain.constant,.18);
assert.ok(engine.pool.every(v=>v.oscillator.type==='sine'));
assert.throws(()=>engine.setPreset('sawtooth'));
const groups=groupPitches(Array.from({length:5000},(_,id)=>({id,frequency:73*2**(id/5000*4)})),256);
assert.ok(groups.groups.length<=256);assert.equal(groups.groups.reduce((n,g)=>n+g.count,0),5000);
engine.update([{id:1,frequency:440},{id:2,frequency:30000}]);assert.equal(engine.outOfRange,1);
assert.equal(nodes,initialNodes);engine.silence();
console.log('Sine-only Pluck decay/retrigger/glissando/tails, Pad sustain/release, duplicate invariance and bounded audio pool passed.');
