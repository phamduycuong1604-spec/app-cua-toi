import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=(await readFile(new URL('../web/phaha/video.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replace(/\bexport /g,'').replaceAll('import.meta.url',JSON.stringify('https://site.test/video.js')).replace("()=>import('/dub/lop-phu.js')","()=>globalThis.loadOverlay()");
function fixture({disk=true,mergeFails=false}={}){
 const commands=[],deleted=[],writes=[],logs=[],S={thoiLuong:12,tepVideo:new File([new Uint8Array(16)],'goc.mp4'),cacCau:[{start:1,end:3}]},caiDat={amGoc:15,amNen:35};
 const ff={async writeFile(p,b){writes.push([p,b.length])},async exec(args){commands.push(args);return 0},async readFile(){return new Uint8Array([0,0,0,16,102,116,121,112,105,115,111,109,0,0,0,0])},async deleteFile(p){deleted.push(p)},async createDir(){},async mount(){},async unmount(){},on(){},off(){}};
 let merged;
 const context=vm.createContext({Blob,File,URL,AbortSignal,Uint8Array,Int16Array,ArrayBuffer,DataView,S,caiDat,nhat:t=>logs.push(t),ghiChu(){},dongHo(){},TEN_BUOC:{xuat:'Xuất video'},TAN_SO_NGHE:16000,assertRunning(){},runSignal(){},PHAVideoDownload:{canUseDisk:async()=>disk},loadOverlay:async()=>({ghepVideo:async(video,audio)=>{merged={video,audio};if(mergeFails)throw Error('storage lost');return new Blob([new Uint8Array(64)],{type:'video/mp4'})}})});
 vm.runInContext(source+'\nff=globalThis.testFF;globalThis.exportVideo=xuatVideo;',Object.assign(context,{testFF:ff}));
 return{S,caiDat,commands,deleted,writes,logs,get merged(){return merged},run:(...args)=>context.exportVideo(...args)};
}
for(const entry of [
 {name:'only Vietnamese voice',info:{coTieng:false,duong:'/goc.mp4'},background:null,duck:false,needsOriginal:false},
 {name:'separated background music',info:{coTieng:true,duong:'/goc.mp4'},background:new Uint8Array(100),duck:false,needsOriginal:false},
 {name:'original audio at reduced volume',info:{coTieng:true,duong:'/goc.mp4'},background:null,duck:false,needsOriginal:true},
 {name:'ducked original speech',info:{coTieng:true,duong:'/goc.mp4'},background:null,duck:true,needsOriginal:true},
])test('Bounded export: '+entry.name,async()=>{
 const f=fixture(),file=await f.run(new Uint8Array(44),entry.info,entry.background,null,entry.duck);assert.equal(file.size,64);assert.equal(f.commands.length,1);const cmd=f.commands[0];assert.equal(cmd.includes('/goc.mp4'),entry.needsOriginal);assert.equal(cmd.at(-1),'/tieng-ket-qua.m4a');assert.ok(!cmd.includes('/ket-qua.mp4'));assert.equal(f.merged.video,f.S.tepVideo);assert.equal(f.merged.audio.type,'audio/mp4');assert.ok(f.deleted.includes('/tieng-ket-qua.m4a'));
});
test('Without disk storage FFmpeg retains HEVC tagging and exports a real Blob',async()=>{
 const f=fixture({disk:false}),result=await f.run(new Uint8Array(44),{coTieng:false,duong:'/goc.mp4',hevc:true},null,null,false);assert.equal(result.type,'video/mp4');assert.equal(f.commands.length,1);assert.ok(f.commands[0].includes('hvc1'));assert.equal(f.commands[0].at(-1),'/ket-qua.mp4');
});
test('If OPFS merging fails, FFmpeg exports with the selected overlay and source color correction',async()=>{
 const f=fixture({mergeFails:true});const hinh={blob:new Blob([new Uint8Array(16)]),codec:'avc'};const result=await f.run(new Uint8Array(44),{coTieng:true,duong:'/goc.mp4'},null,hinh,false);assert.equal(result.type,'video/mp4');assert.equal(f.commands.length,2);assert.ok(f.commands[1].includes('/hinh/hinh.mp4'));assert.ok(f.commands[1].some(x=>String(x).includes('h264_metadata')));assert.ok(f.logs.some(x=>x.includes('dự phòng')));
});
