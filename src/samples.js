// Abstract studies, not reconstructions of named buildings.
export function studySegments(kind){
    const segments=[];
    const line=(a,b)=>segments.push({a,b});
    const rectangle=(x,y,w,h,z)=>{
        const p=[[x,y,z],[x+w,y,z],[x+w,y+h,z],[x,y+h,z]];
        p.forEach((a,i)=>line(a,p[(i+1)%4]));
    };
    if(kind==='windows'){
        for(let row=0;row<4;row++)for(let col=0;col<12;col++)rectangle(col*1.2,row*1.1,.65,.65,0);
    }else if(kind==='steps'){
        for(let voice=0;voice<3;voice++)for(let i=0;i<16;i++){
            const y=voice*2+Math.floor(i%8/2)*.45;
            line([i,y,voice*.3],[i+.8,y,voice*.3]);
        }
    }else if(kind==='curves'){
        for(let voice=0;voice<3;voice++)for(let i=0;i<160;i++){
            const p=t=>[t,voice*1.8+Math.sin(t*.65+voice)*.65,voice*.3];
            line(p(i/10),p((i+1)/10));
        }
    }else throw Error('Unknown study.');
    return segments;
}
