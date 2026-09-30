export const axisNames=['x','y','z'];
export function swapAssignment(assignments,axis,role){const next=[...assignments],other=next.indexOf(role);next[other]=next[axis];next[axis]=role;return next;}
export function parseDuration(text){const s=String(text).trim();if(/^\d+:\d{2}$/.test(s)){const [m,sec]=s.split(':').map(Number);return sec<60&&m*60+sec>0?m*60+sec:NaN;}const n=Number(s);return Number.isFinite(n)&&n>0?n:NaN;}
export function frequency(coordinate,min,half){return 440*2**((coordinate-min)/half/12);}
export function eventFor(edge,axes,box,duration){let a=edge.a,b=edge.b;const t=axes.indexOf('TIME'),p=axes.indexOf('PITCH'),c=axes.indexOf('TIMBRE'),tk=axisNames[t];if(a[tk]>b[tk])[a,b]=[b,a];const length=box.max[tk]-box.min[tk];const start=length>0?(a[tk]-box.min[tk])/length*duration:0,end=length>0?(b[tk]-box.min[tk])/length*duration:0;return {start,end:Math.min(duration,Math.max(end,start+.045)),a,b,p:axisNames[p],c:axisNames[c]};}
