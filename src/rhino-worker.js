import {readRhinoLines} from './rhino-model.js';
importScripts('./vendor/rhino/rhino3dm.js');
const ready=self.rhino3dm({locateFile:path=>new URL('./vendor/rhino/'+path,self.location.href).href});
self.onmessage=async ({data})=>{
    try {self.postMessage({model:readRhinoLines(await ready,data)});}
    catch(e){self.postMessage({error:e.message||'3DM decoding failed.'});}
};
