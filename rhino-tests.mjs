import assert from 'node:assert/strict';
import fs from 'node:fs';
import rhino3dm from 'rhino3dm';
import {readRhinoLines} from './src/rhino-model.js';
try {
    const r=await rhino3dm(),doc=new r.File3dm();
    doc.settings().modelUnitSystem=r.UnitSystem.Millimeters;
    const addLayer=(name,visible=true)=>{const l=new r.Layer();l.name=name;l.visible=visible;const i=doc.layers().add(l);l.delete();return i;};
    const main=addLayer('NEUMA'),other=addLayer('Context',false);
    const attributes=layer=>{const a=new r.ObjectAttributes();a.layerIndex=layer;return a;};
    const line=new r.LineCurve([0,0,1000],[2000,0,1000]);doc.objects().add(line,attributes(main));
    const pts=new r.Point3dList(5);
    for(const p of [[0,0,0],[1000,0,0],[1000,0,2000],[0,0,2000],[0,0,0]])pts.add(...p);
    doc.objects().add(new r.PolylineCurve(pts),attributes(other));
    doc.objects().add(new r.Point([1,2,3]),attributes(main));
    const bytes=doc.toByteArray(),result=readRhinoLines(r,bytes.buffer);
    assert.equal(result.units,'mm');assert.equal(result.segments.length,5);
    assert.equal(result.segments[0].b[0],2000);assert.equal(result.segments[0].a[2],1000);
    assert.equal(result.layers.find(l=>l.name==='NEUMA').count,1);
    assert.equal(result.layers.find(l=>l.name==='Context').visible,false);
    assert.equal(result.skipped,1);
    assert.throws(()=>readRhinoLines(r,new Uint8Array([1,2,3]).buffer));
    fs.mkdirSync('.analysis',{recursive:true});fs.writeFileSync('.analysis/test-lines.3dm',bytes);
    doc.delete();
    const solidDoc=new r.File3dm(),layer=new r.Layer();layer.name='Architecture';
    const index=solidDoc.layers().add(layer),attr=attributes(index);
    const meshFrom=(points,faces)=>{
        const m=new r.Mesh();for(const p of points)m.vertices().add(...p);
        for(const f of faces)f.length===3?m.faces().addTriFace(...f):m.faces().addQuadFace(...f);
        return m;
    };
    const solid=r.Brep.createFromBoundingBox(new r.BoundingBox([0,0,0],[1000,1000,1000]));
    const corners=[[0,0,0],[1000,0,0],[1000,1000,0],[0,1000,0],[0,0,1000],[1000,0,1000],[1000,1000,1000],[0,1000,1000]];
    const quads=[[0,1,2,3],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]];
    for(let i=0;i<6;i++){
        const face=solid.faces().get(i),mesh=meshFrom(quads[i].map(j=>corners[j]),[[0,1,2],[0,2,3]]);
        assert.equal(face.setMesh(mesh,r.MeshType.Render),true);mesh.delete();face.delete();
    }
    solidDoc.objects().add(solid,attr);
    const plane=meshFrom([[2000,0,0],[3000,0,0],[3000,1000,0],[2000,1000,0]],[[0,1,2],[0,2,3]]);
    solidDoc.objects().add(plane,attr);
    solidDoc.objects().add(new r.LineCurve([1000,0,0],[0,0,0]),attr); // same as a cube edge
    const uncached=r.Brep.createFromBoundingBox(new r.BoundingBox([4000,0,0],[5000,1000,1000]));
    solidDoc.objects().add(uncached,attr);
    const solidBytes=solidDoc.toByteArray(),extracted=readRhinoLines(r,solidBytes.buffer);
    assert.equal(extracted.segments.length,16); // twelve cube edges + four plane edges
    assert.equal(extracted.meshObjects,1);assert.equal(extracted.surfaceObjects,1);
    assert.equal(extracted.missingMeshes,6);assert.equal(extracted.duplicates,1);
    assert.equal(extracted.layers[0].count,16);assert.equal(extracted.units,'mm');
    fs.writeFileSync('.analysis/test-surfaces.3dm',solidBytes);
    const emptyDoc=new r.File3dm();emptyDoc.objects().add(uncached,null);
    assert.throws(()=>readRhinoLines(r,emptyDoc.toByteArray().buffer),/no saved display meshes/);
    emptyDoc.delete();solidDoc.delete();
    const profilePoints=new r.Point3dList(5);
    for(const p of [[0,0,0],[1000,0,0],[1000,1000,0],[0,1000,0],[0,0,0]])profilePoints.add(...p);
    const extrusion=r.Extrusion.create(new r.PolylineCurve(profilePoints),1000,true);
    const extrusionDoc=new r.File3dm(),fullMesh=meshFrom(corners,quads);
    assert.equal(extrusion.setMesh(fullMesh,r.MeshType.Render),true);
    extrusionDoc.objects().add(extrusion,null);
    const extrusionResult=readRhinoLines(r,extrusionDoc.toByteArray().buffer);
    assert.equal(extrusionResult.surfaceObjects,1);assert.equal(extrusionResult.segments.length,12);
    extrusionDoc.delete();
    console.log('3DM lines/polylines, native units/axes, layer visibility, unsupported-object reporting and invalid-file tests passed.');
    console.log('Saved BRep meshes and mesh objects extract exactly the structural edges; missing meshes and duplicates are reported.');
} catch(e){console.error(e.message);process.exitCode=1;}
