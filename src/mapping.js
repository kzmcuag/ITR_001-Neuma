export const axisNames=['x','y','z'];
export function durationFromBeat(span,beatUnits,bpm){
    if(!Number.isFinite(span)||span<=0)throw Error('The Time axis has zero length. Choose another axis.');
    if(!Number.isFinite(beatUnits)||beatUnits<=0||!Number.isFinite(bpm)||bpm<=0)throw Error('Enter positive Beat and BPM values.');
    const seconds=span/beatUnits*60/bpm;
    if(!Number.isFinite(seconds)||seconds<=0||seconds>3600)throw Error('Total duration must be within 60 minutes. Increase Beat or BPM.');
    return seconds;
}
export function beatFromDuration(span,seconds,bpm){
    if(![span,seconds,bpm].every(n=>Number.isFinite(n)&&n>0))throw Error('Enter positive Time span, duration and BPM.');
    return span*60/(seconds*bpm);
}
export function scanEvents(events,time,previous,manual=false,catchShort=false){
    const result=[];
    for(const event of events){
        const active=time>=event.start&&(manual?time<=event.end:time<event.end);
        const crossed=!manual&&catchShort&&event.start>=previous&&event.start<time&&event.end<=time;
        if(active||crossed)result.push({event,u:crossed?.5:(time-event.start)/(event.end-event.start)});
    }
    return result;
}
export function swapAssignment(assignments,axis,role){const next=[...assignments],other=next.indexOf(role);next[other]=next[axis];next[axis]=role;return next;}
export function parseDuration(text){const s=String(text).trim();if(/^\d+:\d{2}$/.test(s)){const [m,sec]=s.split(':').map(Number);return sec<60&&m*60+sec>0?m*60+sec:NaN;}const n=Number(s);return Number.isFinite(n)&&n>0?n:NaN;}
export function frequency(coordinate,min,half,base=440){return base*2**((coordinate-min)/half/12);}
export const D4=440*2**((62-69)/12);
export function defaultPitch(span){return span>0?{low:D4/4,high:D4*4,half:span/48}:{low:D4,high:D4,half:1};}
export function changePitch(state,span,field,value){
    if(!Number.isFinite(value)||value<=0)throw Error('Enter a positive number.');
    const next={...state};
    if(field==='half'){
        const center=Math.sqrt(state.low*state.high),semitones=span/value;
        next.low=center*2**(-semitones/24);next.high=center*2**(semitones/24);next.half=value;
    }else{
        next[field]=value;
        if(next.high<=next.low)throw Error('Maximum pitch must be above minimum pitch.');
        if(span<=0)throw Error('The pitch axis has zero length. Choose another axis.');
        next.half=span/(12*Math.log2(next.high/next.low));
    }
    if(next.low<.001||next.high>1e8||!Number.isFinite(next.half))throw Error('Pitch range is too wide. Increase Half tone.');
    return next;
}
export function parsePitch(value){
    const text=String(value).trim(),note=/^([A-Ga-g])([#b]?)(-?\d+)$/.exec(text);
    if(note){const n={C:0,D:2,E:4,F:5,G:7,A:9,B:11}[note[1].toUpperCase()]+(note[2]==='#'?1:note[2]==='b'?-1:0);return 440*2**(((Number(note[3])+1)*12+n-69)/12);}
    return Number(text.replace(/\s*Hz$/i,''));
}
export function pitchName(hz){const midi=69+12*Math.log2(hz/440),nearest=Math.round(midi),names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'],cents=Math.round((midi-nearest)*100);return names[((nearest%12)+12)%12]+(Math.floor(nearest/12)-1)+(cents?` ${cents>0?'+':''}${cents}c`:'');}
export function eventFor(edge,axes,box,duration){
    let a=edge.a,b=edge.b;
    const tk=axisNames[axes.indexOf('TIME')],pk=axisNames[axes.indexOf('PITCH')];
    const span=box.max[tk]-box.min[tk];
    const epsilon=Math.max(span*1e-9,Number.EPSILON*Math.max(1,Math.abs(box.min[tk]),Math.abs(box.max[tk]))*32);
    if(span<=epsilon||Math.abs(a[tk]-b[tk])<=epsilon)return null;
    if(a[tk]>b[tk])[a,b]=[b,a];
    return {start:(a[tk]-box.min[tk])/span*duration,end:(b[tk]-box.min[tk])/span*duration,a,b,p:pk};
}
