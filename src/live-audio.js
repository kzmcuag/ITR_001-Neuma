// Merge coincident pitches and preserve every valid edge's contribution.
export function groupPitches(candidates, capacity=256, limit=Infinity) {
    const valid=candidates.filter(c=>Number.isFinite(c.frequency)&&c.frequency>0&&c.frequency<limit)
        .map(c=>({...c,midi:69+12*Math.log2(c.frequency/440)}));
    const invalid=candidates.length-valid.length;
    if(!valid.length)return {groups:[],represented:0,invalid};
    const collect=(keyFor)=>{
        const map=new Map();
        for(const candidate of valid){
            const key=keyFor(candidate.midi);
            const group=map.get(key)||{id:key,count:0,midiSum:0};
            group.count++;group.midiSum+=candidate.midi;map.set(key,group);
        }
        return [...map.values()].map(g=>({id:g.id,count:g.count,frequency:440*2**((g.midiSum/g.count-69)/12)}));
    };
    let groups=collect(midi=>'cent:'+Math.round(midi*100));
    if(groups.length>capacity){
        let low=Infinity,high=-Infinity;
        for(const c of valid){low=Math.min(low,c.midi);high=Math.max(high,c.midi);}
        const step=(high-low)/Math.max(1,capacity-1);
        groups=collect(midi=>'band:'+Math.min(capacity-1,Math.floor((midi-low)/step)));
    }
    groups.sort((a,b)=>a.frequency-b.frequency);
    return {groups,represented:valid.length,invalid};
}

export class LiveAudioEngine {
    constructor(context,output,capacity=256){
        this.context=context;this.capacity=capacity;this.waveform='sine';
        this.active=0;this.represented=0;this.merged=0;this.outOfRange=0;
        this.pool=Array.from({length:capacity},()=>{
            const oscillator=context.createOscillator(),gain=context.createGain();
            oscillator.type='sine';gain.gain.value=0;
            oscillator.connect(gain).connect(output);oscillator.start();
            return {oscillator,gain,id:null};
        });
    }
    smooth(parameter,value,time,constant=.008){
        parameter.cancelScheduledValues(time);parameter.setTargetAtTime(value,time,constant);
    }
    setWaveform(waveform){
        if(!['sine','sawtooth'].includes(waveform))throw Error('Unsupported waveform');
        this.waveform=waveform;
        for(const voice of this.pool)voice.oscillator.type=waveform;
    }
    update(candidates){
        const time=this.context.currentTime;
        const {groups,represented,invalid}=groupPitches(candidates,this.capacity,this.context.sampleRate*.45);
        this.active=groups.length;this.represented=represented;
        this.merged=represented-groups.length;this.outOfRange=invalid;
        const desired=new Set(groups.map(g=>g.id));
        for(const voice of this.pool)if(!desired.has(voice.id)){
            this.smooth(voice.gain.gain,0,time);voice.id=null;
        }
        const assigned=new Map(this.pool.filter(v=>v.id!==null).map(v=>[v.id,v]));
        const available=this.pool.filter(v=>v.id===null);
        for(const group of groups){
            const voice=assigned.get(group.id)||available.shift();
            const changed=voice.id!==group.id;voice.id=group.id;
            this.smooth(voice.oscillator.frequency,group.frequency,time,changed?.003:.008);
            // Energy follows edge density; repeated windows outweigh a lone roof edge.
            const highBalance=Math.sqrt(440/Math.max(440,group.frequency));
            const amplitude=(this.waveform==='sine'?.25:.30)*Math.sqrt(group.count/represented)*highBalance;
            this.smooth(voice.gain.gain,amplitude,time,changed?.01:.008);
        }
    }
    silence(){
        for(const voice of this.pool){this.smooth(voice.gain.gain,0,this.context.currentTime,.004);voice.id=null;}
        this.active=0;this.represented=0;this.merged=0;this.outOfRange=0;
    }
}
