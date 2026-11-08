import {meshFeatureEdges,cleanSegments} from './edge-processing.js';

// Extract once in the import worker. Preserve native Rhino units and XYZ axes.
export function readRhinoLines(rhino,buffer){
    const doc=rhino.File3dm.fromByteArray(new Uint8Array(buffer));
    if(!doc)throw Error('Invalid or unsupported 3DM file.');
    try {
        const unit=doc.settings().modelUnitSystem;
        const names={Millimeters:'mm',Centimeters:'cm',Meters:'m',Inches:'in',Feet:'ft',None:'units'};
        const unitKey=Object.keys(rhino.UnitSystem).find(k=>rhino.UnitSystem[k]?.value===unit.value)||'Unknown';
        const layers=[],table=doc.layers(),objects=doc.objects(),segments=[],byId=new Map();
        for(let i=0;i<table.count;i++){
            const l=table.get(i);
            const entry={index:l.index??i,id:l.id,parent:l.parentLayerId,name:l.fullPath||l.name||'Layer '+i,visible:l.visible!==false,count:0};
            layers.push(entry);byId.set(entry.id,entry);l.delete();
        }
        const visible=l=>{const seen=new Set();while(l){if(!l.visible||seen.has(l.id))return false;seen.add(l.id);l=byId.get(l.parent);}return true;};
        for(const layer of layers)layer.visible=visible(layer);
        let skipped=0,hidden=0,missingMeshes=0,meshObjects=0,surfaceObjects=0,curveObjects=0,faceCount=0,vertexCount=0;
        const meshData=mesh=>{
            const vertices=mesh.vertices(),faces=mesh.faces(),part={vertices:[],faces:[]};
            try {
                faceCount+=faces.count;vertexCount+=vertices.count;
                if(faceCount>200000||vertexCount>400000)throw Error('3DM exceeds 200,000 mesh faces or 400,000 vertices. Save a coarser mesh or export fewer objects.');
                for(let i=0;i<vertices.count;i++)part.vertices.push(vertices.get(i));
                for(let i=0;i<faces.count;i++){
                    const f=faces.get(i);part.faces.push(f[2]===f[3]?f.slice(0,3):f);
                }
            }finally{vertices.delete();faces.delete();}
            return part;
        };
        const savedMesh=object=>object.getMesh(rhino.MeshType.Render)||object.getMesh(rhino.MeshType.Preview);
        const append=items=>{
            for(const item of items)segments.push(item);
            if(segments.length>300000)throw Error('Too many raw edges. Simplify the model or export fewer objects.');
        };
        for(let i=0;i<objects.count;i++){
            const object=objects.get(i),attributes=object.attributes(),geometry=object.geometry(),layer=attributes.layerIndex;
            try {
                if(attributes.isInstanceDefinitionObject||attributes.visible===false){hidden++;continue;}
                if(geometry instanceof rhino.Curve&&geometry.isPolyline()){
                    const polyline=geometry.tryGetPolyline();
                    if(!polyline){skipped++;continue;}
                    try {
                        curveObjects++;
                        for(let j=1;j<polyline.count;j++)append([{a:polyline.get(j-1),b:polyline.get(j),layer}]);
                    }finally{polyline.delete();}
                }else if(geometry instanceof rhino.Mesh){
                    append(meshFeatureEdges([meshData(geometry)],layer));meshObjects++;
                }else if(geometry instanceof rhino.Brep){
                    const faces=geometry.faces(),parts=[];
                    try {
                        for(let j=0;j<faces.count;j++){
                            const face=faces.get(j);let mesh;
                            try {mesh=savedMesh(face);if(mesh)parts.push(meshData(mesh));else missingMeshes++;}
                            finally{mesh?.delete();face.delete();}
                        }
                    }finally{faces.delete();}
                    if(parts.length){append(meshFeatureEdges(parts,layer));surfaceObjects++;}
                }else if(geometry instanceof rhino.Extrusion){
                    const mesh=savedMesh(geometry);
                    if(mesh){try{append(meshFeatureEdges([meshData(mesh)],layer));surfaceObjects++;}finally{mesh.delete();}}
                    else missingMeshes++;
                }else if(geometry instanceof rhino.Surface){
                    missingMeshes++;
                }else skipped++;
            }finally{geometry.delete();attributes.delete();object.delete();}
        }
        const cleaned=cleanSegments(segments);
        if(!cleaned.segments.length)throw Error(missingMeshes?
            'No edges: surfaces have no saved display meshes. In Rhino, show the model in Shaded mode and save with render meshes, or use Mesh and save the mesh objects.':
            'No usable edges. Use lines, polylines, meshes, or surfaces with saved display meshes. Blocks and curved standalone NURBS are not supported.');
        const byIndex=new Map(layers.map(l=>[l.index,l]));
        for(const edge of cleaned.segments){const l=byIndex.get(edge.layer);if(l)l.count++;}
        return {...cleaned,layers:layers.filter(l=>l.count),units:names[unitKey]||unitKey,skipped,hidden,missingMeshes,meshObjects,surfaceObjects,curveObjects,faceCount};
    }finally{doc.delete();}
}
