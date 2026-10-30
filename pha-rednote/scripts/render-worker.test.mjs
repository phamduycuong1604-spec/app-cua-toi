import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Worker as ThreadWorker} from 'node:worker_threads';

const text=await readFile(new URL('../web/lop-phu.js',import.meta.url),'utf8');
const source=text.replace(/^import .*\n/,'').replaceAll('export const ','const ').replaceAll('export function ','function ').replaceAll('export async function ','async function ').replaceAll('import.meta.url',JSON.stringify('https://site.test/dub/lop-phu.js'));
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const outputRef={cacheName:'video-1234-output.mp4',title:'render.mp4',type:'video/mp4',size:16};
const oldRef={cacheName:'video-1234-partial.mp4',title:'partial.mp4'};
const inputRef={cacheName:'video-1234-source.mp4',title:'input.mp4',type:'video/mp4',size:678433035};

function fixture(t,{behavior='success',safari=true,logo=false,WorkerClass}={}){
 t.mock.timers.enable({apis:['setTimeout','setInterval','Date']});
 const state={logs:[],discarded:[],terminated:0,bitmapsClosed:0,messages:[],progress:[],restored:0,screenAsked:0,screenReleased:0};
 const controller=new AbortController();
 class FakeWorker{
  constructor(url,options){assert.equal(url.pathname,'/dub/render-worker.js');assert.equal(options.type,'module');state.worker=this;queueMicrotask(()=>this.onmessage?.({data:{type:'ready',version:'HINH-R2',decoder:true,encoder:true,canvas:behavior!=='unsupported',storage:true}}))}
  postMessage(d,transfer){state.messages.push(d);state.transfer=transfer;state.job=d;
   const emit=(type,extra)=>this.onmessage?.({data:{id:d.id,type,...extra}});
   emit('created',{reference:oldRef});emit('created',{reference:outputRef});
   emit('trace',{trace:{phase:'decode',event:'begin',stage:'giải mã khung 17/100',frame:17}});
   if(behavior==='stall')return;
   emit('trace',{trace:{phase:'decode',event:'end',stage:'giải mã khung 17/100',frame:17,ms:12}});
   emit('trace',{trace:{phase:'logo',event:'begin',stage:'vẽ lớp',frame:17,time:.5,width:40,height:24}});
   if(behavior==='error'){emit('error',{name:'InvalidStateError',message:'logo invalid',stack:'InvalidStateError: logo invalid\n at drawLogo'});return;}
   emit('trace',{trace:{phase:'logo',event:'end',stage:'vẽ lớp',frame:17,time:.5}});
   emit('progress',{value:1});emit('result',{reference:outputRef,codec:'avc',W:1080,H:1750});
  }
  terminate(){state.terminated++}
 }
 const storage={reference:()=>inputRef,restore:async ref=>{state.restored++;assert.equal(ref.cacheName,outputRef.cacheName);return new File([new Uint8Array(ref.size)],ref.title,{type:ref.type})},discard:async ref=>state.discarded.push(ref.cacheName),release:async()=>{}};
 const globals={Worker:WorkerClass||FakeWorker,crypto:{randomUUID:()=> 'diagnostic-test'},PHAVideoDownload:storage,navigator:{userAgent:safari?'AppleWebKit Safari/605.1.15':'Chrome/130',wakeLock:{request:async type=>{assert.equal(type,'screen');state.screenAsked++;return {release:async()=>{state.screenReleased++}}}}},document:{visibilityState:'visible'},createImageBitmap:async(_image,options)=>{state.resize=options;return {width:options.resizeWidth,height:options.resizeHeight,close(){state.bitmapsClosed++}}}};
 const render=new Function('runSignal','Worker','VideoEncoder','globalThis',source+'\nreturn xuatLop;')(()=>controller.signal,globals.Worker,class{},globals);
 const pending=render(new File(['source'],'source.mp4'),{phuDe:{bat:true},che:{bat:false},logo:{bat:logo}},[{start:0,end:1,vi:'test'}],logo?{width:4000,height:2000}:null,p=>state.progress.push(p),controller.signal,m=>state.logs.push(m));pending.catch(()=>{});
 return {state,controller,pending};
}

test('Safari renders sequentially in a worker, transfers disk references, and keeps only its completed output',async t=>{
 const f=fixture(t);await flush();const result=await f.pending;
 assert.equal(result.W,1080);assert.equal(result.H,1750);assert.equal(result.blob.size,16);assert.equal(f.state.messages[0].compatible,true);
 assert.equal(f.state.messages[0].file,null);assert.equal(f.state.messages[0].reference,inputRef);assert.deepEqual(f.state.discarded,[oldRef.cacheName]);assert.equal(f.state.restored,1);assert.equal(f.state.terminated,1);
 assert.ok(f.state.logs.some(x=>x.includes('HINH-R2')));assert.ok(f.state.logs.some(x=>x.includes('đồng hồ giám sát ở luồng giao diện')));
 assert.equal(f.state.screenAsked,1);assert.equal(f.state.screenReleased,1);
});

test('Large logos are decoded and resized once before transfer instead of redrawing a huge image for every frame',async t=>{
 const f=fixture(t,{logo:true});await flush();await f.pending;
 assert.deepEqual(f.state.resize,{resizeWidth:1080,resizeHeight:540,resizeQuality:'high'});assert.equal(f.state.transfer.length,1);assert.equal(f.state.messages[0].logo,f.state.transfer[0]);
 assert.ok(f.state.logs.some(x=>x.includes('XONG logo ImageBitmap 1080×540')));
});

test('An unresponsive worker is terminated by the page watchdog, with the pending decoder and frame recorded',async t=>{
 const f=fixture(t,{behavior:'stall'});await flush();t.mock.timers.tick(62001);await flush();
 await assert.rejects(f.pending,e=>e.name==='TimeoutError'&&/giải mã khung 17/.test(e.message));
 assert.equal(f.state.terminated,1);assert.deepEqual(f.state.discarded,[oldRef.cacheName,outputRef.cacheName]);
 assert.ok(f.state.logs.some(x=>/giải mã 0\/1 \[đang chờ/.test(x)));assert.equal(f.state.restored,0);
 assert.equal(f.state.screenAsked,1);assert.equal(f.state.screenReleased,1);
});

test('Stop terminates the worker immediately and late completion cannot attach a stale result',async t=>{
 const f=fixture(t,{behavior:'stall'});await flush();f.controller.abort();await flush();await assert.rejects(f.pending,{name:'AbortError'});
 f.state.worker.onmessage({data:{id:f.state.job.id,type:'result',reference:outputRef,W:1080,H:1750,codec:'avc'}});await flush();
 assert.equal(f.state.restored,0);assert.equal(f.state.terminated,1);assert.equal(f.state.discarded.length,2);
});

test('A worker codec or logo error preserves its stack and last unfinished operation in the run log',async t=>{
 const f=fixture(t,{behavior:'error'});await flush();await assert.rejects(f.pending,{name:'InvalidStateError'});
 assert.ok(f.state.logs.some(x=>x.includes('STACK InvalidStateError: logo invalid')));assert.ok(f.state.logs.some(x=>x.includes('logo 0/1 [đang chờ')));assert.equal(f.state.discarded.length,2);
});

test('Unsupported worker capabilities fail clearly instead of starting a job that can hang',async t=>{
 const f=fixture(t,{behavior:'unsupported'});await flush();await assert.rejects(f.pending,/chưa hỗ trợ dựng video trong Worker/);assert.equal(f.state.messages.length,0);assert.equal(f.state.terminated,1);
});

test('The page can stop a real worker whose synchronous code prevents its own timers from running',async t=>{
 let thread,traceSeen=false;
 class BlockingWorker{
  constructor(){thread=new ThreadWorker(`const {parentPort}=require('node:worker_threads');parentPort.postMessage({type:'ready',version:'HINH-R2',decoder:true,encoder:true,canvas:true,storage:true});parentPort.on('message',d=>{parentPort.postMessage({id:d.id,type:'trace',trace:{phase:'video',event:'begin',stage:'drawWithFit',frame:1}});while(true){};});`,{eval:true});thread.on('message',data=>{if(data.type==='trace')traceSeen=true;this.onmessage?.({data})});thread.on('error',e=>this.onerror?.({message:e.message}))}
  postMessage(d){thread.postMessage(d)}terminate(){void thread.terminate()}
 }
 const f=fixture(t,{WorkerClass:BlockingWorker});t.after(()=>thread?.terminate());
 const start=performance.now();while(!traceSeen&&performance.now()-start<3000)await flush();assert.equal(traceSeen,true);
 t.mock.timers.tick(62001);await flush();await assert.rejects(f.pending,/drawWithFit/);assert.ok(f.state.logs.some(x=>x.includes('vẽ hình 0/1 [đang chờ')));
});
