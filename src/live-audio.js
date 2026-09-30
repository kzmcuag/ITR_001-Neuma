// A bounded, reusable voice pool: no full-score AudioNode allocation.
export class LiveAudioEngine {
    constructor(context, output, capacity=64) {
        this.context=context; this.capacity=capacity; this.active=0; this.limited=0; this.outOfRange=0;
        this.pool=Array.from({length:capacity},()=>{
            const sine=context.createOscillator(), rich=context.createOscillator();
            const sineGain=context.createGain(),richGain=context.createGain(),gain=context.createGain();
            sine.type='sine';rich.type='sawtooth';gain.gain.value=0;
            sine.connect(sineGain).connect(gain);rich.connect(richGain).connect(gain);gain.connect(output);
            sine.start();rich.start();
            return {sine,rich,sineGain,richGain,gain,id:null};
        });
    }
    smooth(parameter,value,time,constant=.006){
        parameter.cancelScheduledValues(time);
        parameter.setTargetAtTime(value,time,constant);
    }
    update(candidates) {
        const time=this.context.currentTime,limit=this.context.sampleRate*.45;
        const valid=candidates.filter(c=>Number.isFinite(c.frequency)&&c.frequency>0&&c.frequency<limit);
        this.outOfRange=candidates.length-valid.length;
        // Sample the whole pitch distribution rather than taking model traversal order.
        valid.sort((a,b)=>a.frequency-b.frequency||a.id-b.id);
        const selected=valid.length<=this.capacity?valid:Array.from({length:this.capacity},(_,i)=>valid[Math.floor(i*(valid.length-1)/(this.capacity-1))]);
        this.active=selected.length;this.limited=valid.length-selected.length;
        const desired=new Set(selected.map(c=>c.id));
        for(const voice of this.pool)if(!desired.has(voice.id)){
            this.smooth(voice.gain.gain,0,time);voice.id=null;
        }
        const assigned=new Map(this.pool.filter(v=>v.id!==null).map(v=>[v.id,v]));
        const available=this.pool.filter(v=>v.id===null);
        for(const candidate of selected){
            const voice=assigned.get(candidate.id)||available.shift();
            const changed=voice.id!==candidate.id;voice.id=candidate.id;
            const timbre=Math.max(0,Math.min(1,candidate.timbre));
            for(const oscillator of [voice.sine,voice.rich]){
                this.smooth(oscillator.frequency,candidate.frequency,time,changed?.002:.008);
            }
            this.smooth(voice.sineGain.gain,1-timbre,time);
            this.smooth(voice.richGain.gain,timbre*.35,time);
            this.smooth(voice.gain.gain,.06,time,changed?.008:.006);
        }
    }
    silence(){
        for(const voice of this.pool){this.smooth(voice.gain.gain,0,this.context.currentTime,.004);voice.id=null;}
        this.active=0;this.limited=0;this.outOfRange=0;
    }
}
