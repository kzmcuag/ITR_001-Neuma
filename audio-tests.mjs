import {strict as assert} from 'node:assert';
import {LiveAudioEngine} from './src/live-audio.js';
let nodes=0,starts=0;
const parameter=()=>({value:0,cancelScheduledValues(){},setTargetAtTime(value){this.value=value;}});
const node=()=>{nodes++;return {gain:parameter(),frequency:parameter(),connect(target){return target;},start(){starts++;}};};
const context={currentTime:0,sampleRate:48000,createGain:node,createOscillator:node};
const engine=new LiveAudioEngine(context,{},64);
assert.equal(nodes,320);assert.equal(starts,128);
const initialNodes=nodes;
for(let tick=0;tick<1000;tick++){
    context.currentTime=tick*.02;
    engine.update(Array.from({length:782},(_,id)=>({id:tick*1000+id,frequency:73+id,timbre:id/782})));
    assert.equal(engine.active,64);assert.equal(engine.limited,718);
    assert.equal(nodes,initialNodes);
}
const frequencies=engine.pool.map(v=>v.sine.frequency.value);
assert.ok(frequencies.includes(73));assert.ok(frequencies.includes(854));
assert.ok(engine.pool.every(v=>v.gain.gain.value>0));
engine.update([{id:1,frequency:440,timbre:0},{id:2,frequency:880,timbre:1},{id:3,frequency:30000,timbre:1}]);
assert.equal(engine.active,2);assert.equal(engine.outOfRange,1);assert.equal(engine.limited,0);
engine.silence();assert.equal(engine.active,0);assert.ok(engine.pool.every(v=>v.gain.gain.value===0));
engine.update([{id:4,frequency:294,timbre:.5}]);assert.equal(engine.active,1);assert.equal(nodes,initialNodes);
console.log('Audio pool remains bounded through 1,000 dense updates, spans pitch range, and resumes after silence.');
