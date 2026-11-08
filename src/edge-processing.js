const subtract=(a,b)=>a.map((n,i)=>n-b[i]);
const dot=(a,b)=>a.reduce((s,n,i)=>s+n*b[i],0);
const magnitude=a=>Math.hypot(...a);
function coordinateGrid(points){
    const low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];
    let absolute=0;
    for(const p of points)for(let i=0;i<3;i++){
        if(!Number.isFinite(p[i]))throw Error('Invalid model coordinates.');
        low[i]=Math.min(low[i],p[i]);high[i]=Math.max(high[i],p[i]);absolute=Math.max(absolute,Math.abs(p[i]));
    }
    const tolerance=Math.max(magnitude(subtract(high,low))*1e-9,absolute*Number.EPSILON*32,Number.EPSILON);
    return {tolerance,key:p=>p.map((n,i)=>Math.round((n-low[i])/tolerance)).join(',')};
}

// Faces from all saved meshes of one BRep are considered together, so a smooth
// shared seam is not mistaken for the outside boundary of each separate face.
export function meshFeatureEdges(parts,layer,angle=15){
    const points=parts.flatMap(p=>p.vertices);if(!points.length)return [];
    const grid=coordinateGrid(points),buckets=new Map(),seenFaces=new Set();
    const cosine=Math.cos(angle*Math.PI/180);
    for(const {vertices,faces} of parts)for(const indices of faces){
        const face=indices.map(i=>vertices[i]);
        if(face.some(p=>!p))throw Error('Invalid mesh face indices.');
        const keys=face.map(grid.key),faceKey=[...keys].sort().join('|');
        if(seenFaces.has(faceKey))continue;seenFaces.add(faceKey);
        const a=subtract(face[1],face[0]),b=subtract(face[2],face[0]);
        let normal=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
        const length=magnitude(normal);if(length<=grid.tolerance*grid.tolerance)continue;
        normal=normal.map(n=>n/length);
        for(let i=0;i<face.length;i++){
            const j=(i+1)%face.length;if(keys[i]===keys[j])continue;
            const key=keys[i]<keys[j]?keys[i]+'|'+keys[j]:keys[j]+'|'+keys[i];
            let edge=buckets.get(key);
            if(!edge){edge={a:face[i],b:face[j],normal,count:0,sharp:false};buckets.set(key,edge);}
            edge.count++;if(Math.abs(dot(edge.normal,normal))<cosine-1e-10)edge.sharp=true;
        }
    }
    return [...buckets.values()].filter(e=>e.count!==2||e.sharp).map(({a,b})=>({a,b,layer}));
}

export function cleanSegments(segments,maxSegments=100000){
    if(!segments.length)return {segments:[],duplicates:0,merged:0};
    const grid=coordinateGrid(segments.flatMap(e=>[e.a,e.b])),nodes=new Map(),edges=[],pairs=new Map();
    let duplicates=0,merged=0;
    const node=(p,layer)=>{const key=layer+':'+grid.key(p);if(!nodes.has(key))nodes.set(key,{key,p,edges:new Set()});return nodes.get(key);};
    const pair=(u,v)=>u.key<v.key?u.key+'|'+v.key:v.key+'|'+u.key;
    const add=(u,v,layer)=>{
        if(u===v)return;
        const key=pair(u,v);if(pairs.has(key)){duplicates++;return;}
        const edge={u,v,layer,key,alive:true};edges.push(edge);pairs.set(key,edge);u.edges.add(edge);v.edges.add(edge);
    };
    const remove=e=>{e.alive=false;pairs.delete(e.key);e.u.edges.delete(e);e.v.edges.delete(e);};
    for(const {a,b,layer} of segments)add(node(a,layer),node(b,layer),layer);
    const queue=[...nodes.values()],cosine=Math.cos(.01*Math.PI/180);
    for(let i=0;i<queue.length;i++){
        const n=queue[i];if(n.edges.size!==2)continue;
        const [e,f]=n.edges,u=e.u===n?e.v:e.u,v=f.u===n?f.v:f.u;
        if(u===v)continue;
        const a=subtract(u.p,n.p),b=subtract(v.p,n.p),length=magnitude(a)*magnitude(b);
        if(length===0||dot(a,b)/length>-cosine)continue;
        const cross=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
        if(magnitude(cross)/magnitude(subtract(u.p,v.p))>grid.tolerance*2)continue;
        remove(e);remove(f);add(u,v,e.layer);merged++;queue.push(u,v);
    }
    const result=edges.filter(e=>e.alive).map(e=>({a:e.u.p,b:e.v.p,layer:e.layer}));
    if(result.length>maxSegments)throw Error('More than 100,000 extracted segments. Simplify or export fewer layers.');
    return {segments:result,duplicates,merged};
}
