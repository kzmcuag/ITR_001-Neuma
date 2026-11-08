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
            const group=map.get(key)||{id:key,count:0,midiSum:0,members:[]};
            group.count++;group.midiSum+=candidate.midi;group.members.push(candidate.id);map.set(key,group);
        }
        return [...map.values()].map(g=>({id:g.id,count:g.count,members:g.members,frequency:440*2**((g.midiSum/g.count-69)/12)}));
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
        this.context=context;this.capacity=capacity;this.preset='pluck';
        this.active=0;this.represented=0;this.merged=0;this.outOfRange=0;
        this.pool=Array.from({length:capacity},()=>{
            const oscillator=context.createOscillator(),gain=context.createGain();
            oscillator.type='sine';gain.gain.value=0;
            oscillator.connect(gain).connect(output);oscillator.start();
            return {oscillator,gain,id:null,members:new Set(),onset:-Infinity,level:0,used:false};
        });
    }
    smooth(parameter,value,time,constant=.008){
        parameter.cancelScheduledValues(time);parameter.setTargetAtTime(value,time,constant);
    }
    setPreset(preset){
        if(!['pluck','pad'].includes(preset))throw Error('Unsupported preset');
        if(this.preset===preset)return;
        this.preset=preset;
        for(const voice of this.pool)voice.onset=this.context.currentTime;
    }
    update(candidates){
        const time=this.context.currentTime;
        const {groups,represented,invalid}=groupPitches(candidates,this.capacity,this.context.sampleRate*.45);
        this.active=groups.length;this.represented=represented;
        this.merged=represented-groups.length;this.outOfRange=invalid;
        for(const v of this.pool)v.used=false;
        const desiredMembers=new Set(groups.flatMap(g=>g.members));
        // Follow source-edge identity across pitch bins: a glissando is one note.
        for(const group of groups){
            const continuing=v=>!v.used&&v.id!==null&&group.members.some(id=>v.members.has(id));
            let voice=this.pool.find(v=>v.id===group.id&&continuing(v))||this.pool.find(continuing);
            const fresh=!voice;
            if(!voice){
                const released=this.pool.filter(v=>!v.used&&v.id===null).sort((a,b)=>a.onset-b.onset);
                voice=released[0]||this.pool.find(v=>!v.used&&![...v.members].some(id=>desiredMembers.has(id)))||this.pool.find(v=>!v.used);
            }
            if(fresh)voice.onset=time;
            voice.used=true;voice.id=group.id;voice.members=new Set(group.members);
            this.smooth(voice.oscillator.frequency,group.frequency,time,fresh?.003:.008);
            const highBalance=Math.sqrt(440/Math.max(440,group.frequency));
            voice.level=.32/Math.sqrt(Math.max(1,groups.length))*highBalance;
            const decay=this.preset==='pluck'?Math.exp(-(time-voice.onset)/.28):1;
            this.smooth(voice.gain.gain,voice.level*decay,time,this.preset==='pluck'?.003:.09);
        }
        for(const voice of this.pool)if(!voice.used){
            if(this.preset==='pluck'){
                // Let a short geometric event ring out rather than chopping its decay.
                const level=voice.level*Math.exp(-(time-voice.onset)/.28);
                this.smooth(voice.gain.gain,level<.00001?0:level,time,.008);
            }else this.smooth(voice.gain.gain,0,time,.18);
            voice.id=null;voice.members.clear();
        }
    }
    silence(){
        for(const voice of this.pool){
            this.smooth(voice.gain.gain,0,this.context.currentTime,.004);
            voice.id=null;voice.members.clear();voice.onset=-Infinity;voice.level=0;
        }
        this.active=0;this.represented=0;this.merged=0;this.outOfRange=0;
    }
}
