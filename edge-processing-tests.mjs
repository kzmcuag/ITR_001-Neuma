import assert from 'node:assert/strict';
import {meshFeatureEdges,cleanSegments} from './src/edge-processing.js';
const square={vertices:[[0,0,0],[1,0,0],[1,1,0],[0,1,0]],faces:[[0,1,2],[0,2,3]]};
assert.equal(meshFeatureEdges([square],0).length,4); // no triangulation diagonal
assert.equal(meshFeatureEdges([square,square],0).length,4); // duplicated faces are harmless
const right={vertices:[[1,0,0],[2,0,0],[2,1,0],[1,1,0]],faces:[[0,1,2,3]]};
const joined=cleanSegments(meshFeatureEdges([square,right],0));
assert.equal(joined.segments.length,4);assert.equal(joined.merged,2); // smooth BRep seam gone, straight outline joined
const wall={vertices:[[0,0,0],[1,0,0],[1,0,1],[0,0,1]],faces:[[0,1,2,3]]};
assert.equal(meshFeatureEdges([square,wall],0).length,7); // a 90 degree crease remains
const shallow={vertices:[[0,0,0],[1,0,0],[1,-1,Math.tan(10*Math.PI/180)],[0,-1,Math.tan(10*Math.PI/180)]],faces:[[0,1,2,3]]};
assert.equal(meshFeatureEdges([square,shallow],0).length,6); // a 10 degree join is smooth at the 15 degree threshold
const frame={vertices:[[0,0,0],[4,0,0],[4,4,0],[0,4,0],[1,1,0],[3,1,0],[3,3,0],[1,3,0]],faces:[[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]]};
assert.equal(cleanSegments(meshFeatureEdges([frame],0)).segments.length,8); // keep both the outer rim and the window opening
const reverse={...square,faces:[[2,1,0],[3,2,0]]};
assert.equal(meshFeatureEdges([reverse],0).length,4);
const segment=(a,b,layer=0)=>({a,b,layer});
assert.equal(cleanSegments([segment([0,0,0],[1,0,0]),segment([1,0,0],[0,0,0])]).duplicates,1);
assert.equal(cleanSegments([segment([0,0,0],[1,0,0]),segment([1,0,0],[0,0,0],1)]).segments.length,2); // independent layers retained
const chain=[0,1,2].map(i=>segment([i,0,0],[i+1,0,0]));
assert.equal(cleanSegments(chain).segments.length,1);
assert.equal(cleanSegments([...chain,segment([1,0,0],[1,1,0])]).segments.length,3); // keep branch junction
assert.equal(cleanSegments([segment([0,0,0],[1,0,0]),segment([1,0,0],[2,.00001,0])]).segments.length,2); // don't flatten a curve
for(const scale of [.001,1000]){
    const part={vertices:square.vertices.map(p=>p.map(n=>n*scale)),faces:square.faces};
    assert.equal(cleanSegments(meshFeatureEdges([part],0)).segments.length,4);
}
assert.throws(()=>cleanSegments([segment([0,0,0],[1,0,0]),segment([0,0,0],[0,1,0]),segment([0,0,0],[0,0,1])],2));
assert.throws(()=>meshFeatureEdges([{vertices:[[NaN,0,0]],faces:[]}],0));
assert.deepEqual(cleanSegments([]).segments,[]);
console.log('Mesh boundaries/creases, smooth seams, duplicate/reversed faces, collinear joins, junctions, curve preservation, units and output limits passed.');
