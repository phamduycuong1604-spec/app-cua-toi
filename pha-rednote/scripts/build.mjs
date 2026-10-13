import {build} from 'esbuild';
import {readFile,writeFile,mkdir,readdir,rm,copyFile} from 'node:fs/promises';
import {APP_RELEASE_LABEL,APP_RELEASE} from '../web/release-info.js';
const root=new URL('../',import.meta.url),assets={};
assets['/dub/remote/NotoSans.ttf']=Buffer.from(await readFile(new URL('worker/vendor/NotoSans-Regular.ttf',root))).toString('base64');
for(const name of ['dub.html','dub.css','dub-core.js','device-test.html','run-journal.js','video-download.js']) assets['/dub/'+name]=await readFile(new URL('web/'+name,root),'utf8');
assets['/dub/dub.html']=assets['/dub/dub.html'].replace('<!-- PHA_APP_RELEASE -->',`<p class="goi-y" data-app-release="${APP_RELEASE.version}">${APP_RELEASE_LABEL}</p>`);
for(const entry of [['web/video-1080.js','/dub/video-1080.js'],['web/dub-client.js','/dub/app.js'],['web/lop-phu.js','/dub/lop-phu.js'],['web/du-phong.js','/dub/du-phong.js'],['web/dong-bo.js','/dub/dong-bo.js'],['web/site-bridge.js','/dub/site-bridge.js'],['web/separation.js','/dub/separation.js'],['web/local-voice.js','/dub/local-voice.js'],['web/vad.js','/dub/vad.js']]){
 const r=await build({entryPoints:[new URL(entry[0],root).pathname],bundle:true,format:'esm',platform:'browser',target:'safari17',write:false,minify:true,external:['/dub/*','onnxruntime-web','onnxruntime-web/wasm','fs','path']});assets[entry[1]]=r.outputFiles[0].text;
}
for(const name of ['doc-may.js','tach-nhac.js'])assets['/dub/'+name]=await readFile(new URL('web/'+name,root),'utf8');
const diagnostic=await build({entryPoints:[new URL('web/device-test.js',root).pathname],bundle:true,format:'esm',platform:'browser',target:'safari17',write:false,minify:true,external:['/dub/*']});assets['/dub/device-test.js']=diagnostic.outputFiles[0].text;
const ffdir=new URL('node_modules/@ffmpeg/ffmpeg/dist/esm/',root);
for(const f of await readdir(ffdir))if(f.endsWith('.js'))assets['/dub/ffmpeg/'+f]=await readFile(new URL(f,ffdir),'utf8');
await writeFile(new URL('worker/assets.generated.js',root),'export default '+JSON.stringify(assets)+';\n');
await rm(new URL('dist/',root),{recursive:true,force:true});
await mkdir(new URL('dist/server/',root),{recursive:true});await mkdir(new URL('dist/.openai/',root),{recursive:true});
await build({entryPoints:[new URL('worker/index.js',root).pathname],outfile:new URL('dist/server/index.js',root).pathname,bundle:true,format:'esm',platform:'neutral',target:'es2022'});
await copyFile(new URL('.openai/hosting.json',root),new URL('dist/.openai/hosting.json',root));
console.log('Built Worker and phone video tools');
