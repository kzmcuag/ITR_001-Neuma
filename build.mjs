import {build} from 'esbuild';
import fs from 'node:fs/promises';
await build({entryPoints:['src/app.js'],bundle:true,minify:true,outfile:'dist/app.js'});
await build({entryPoints:['src/rhino-worker.js'],bundle:true,minify:true,outfile:'dist/rhino-worker.js'});
await fs.mkdir('dist/vendor/rhino',{recursive:true});
for(const name of ['rhino3dm.js','rhino3dm.wasm'])await fs.copyFile('node_modules/rhino3dm/'+name,'dist/vendor/rhino/'+name);
