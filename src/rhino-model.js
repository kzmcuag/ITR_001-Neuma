// Keep native Rhino units and axes. This first importer deliberately reads only
// explicit straight lines/polylines, not tessellated surfaces or curved NURBS.
export function readRhinoLines(rhino, buffer) {
    const doc=rhino.File3dm.fromByteArray(new Uint8Array(buffer));
    if(!doc)throw Error('Invalid or unsupported 3DM file.');
    try {
        const unit=doc.settings().modelUnitSystem;
        const names={Millimeters:'mm',Centimeters:'cm',Meters:'m',Inches:'in',Feet:'ft',None:'units'};
        const unitKey=Object.keys(rhino.UnitSystem).find(k=>rhino.UnitSystem[k]?.value===unit.value)||'Unknown';
        const layers=[],table=doc.layers(),objects=doc.objects(),segments=[];
        const byId=new Map();
        for(let i=0;i<table.count;i++){
            const l=table.get(i);
            const entry={index:l.index??i,id:l.id,parent:l.parentLayerId,name:l.fullPath||l.name||'Layer '+i,visible:l.visible!==false,count:0};
            layers.push(entry);byId.set(entry.id,entry);l.delete();
        }
        const visible=l=>{const seen=new Set();while(l){if(!l.visible)return false;if(seen.has(l.id))return false;seen.add(l.id);l=byId.get(l.parent);}return true;};
        for(const layer of layers)layer.visible=visible(layer);
        const byIndex=new Map(layers.map(l=>[l.index,l]));
        let skipped=0,hidden=0;
        for(let i=0;i<objects.count;i++){
            const object=objects.get(i),attributes=object.attributes(),geometry=object.geometry();
            try {
                if(attributes.isInstanceDefinitionObject||attributes.visible===false){hidden++;continue;}
                let polyline;
                if(geometry instanceof rhino.Curve && geometry.isPolyline())polyline=geometry.tryGetPolyline();
                if(!polyline){skipped++;continue;}
                try {
                    const layer=attributes.layerIndex;
                    for(let j=1;j<polyline.count;j++){
                        const a=polyline.get(j-1),b=polyline.get(j);
                        if(![...a,...b].every(Number.isFinite))throw Error('Invalid 3DM coordinates.');
                        if(Math.hypot(...a.map((v,k)=>v-b[k]))<=Number.EPSILON)continue;
                        segments.push({a,b,layer});
                        if(segments.length>100000)throw Error('More than 100,000 line segments. Simplify the model.');
                        const entry=byIndex.get(layer);if(entry)entry.count++;
                    }
                } finally {polyline.delete();}
            } finally {geometry.delete();attributes.delete();object.delete();}
        }
        if(!segments.length)throw Error('No lines or polylines. Export explicit curves from Rhino; meshes, surfaces, blocks and curved NURBS are not supported yet.');
        return {segments,layers:layers.filter(l=>l.count),units:names[unitKey]||unitKey,skipped,hidden};
    } finally {doc.delete();}
}
