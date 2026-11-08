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
    console.log('3DM lines/polylines, native units/axes, layer visibility, unsupported-object reporting and invalid-file tests passed.');
} catch(e){console.error(e.message);process.exitCode=1;}
