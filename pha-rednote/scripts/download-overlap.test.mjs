import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {harness} from './phaha-harness.mjs';
import {readDownloadAudio} from '../web/download-audio.js';
const source=await readFile(new URL('../web/video-download.js',import.meta.url),'utf8');
const flush=()=>new Promise(r=>setImmediate(r));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const deferred=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j});promise.catch(()=>{});return {promise,resolve,reject}};
const R=8388608,magic=new Uint8Array([0,0,0,16,102,116,121,112,105,115,111,109,0,0,0,0]);
function disk(total,{syncSupported=true}={}){
 const payload=new Uint8Array(total),blobs=new Map(),state={closed:false,removed:0,maxWrite:0,maxRead:0,readsBeforeClose:0};let size=0;
 const sync={truncate(n){size=n},write(b,{at}){state.maxWrite=Math.max(state.maxWrite,b.length);payload.set(b,at);size=Math.max(size,at+b.length);return b.length},read(b,{at}){state.maxRead=Math.max(state.maxRead,b.length);if(!state.closed)state.readsBeforeClose++;b.set(payload.subarray(at,at+b.length));return b.length},flush(){},close(){state.closed=true}};
 const handle={async createSyncAccessHandle(){if(!syncSupported)throw new DOMException('sync unsupported','NotSupportedError');return sync},async createWritable(){return {write:async({data,position})=>sync.write(data,{at:position}),close:async()=>sync.close(),abort:async()=>sync.close(),truncate:async n=>sync.truncate(n)}},async getFile(){assert.equal(state.closed,true);return new Blob([payload.subarray(0,size)])}};
 const dir={getFileHandle:async()=>handle,removeEntry:async()=>{state.removed++}};
 class TestURL extends URL{static createObjectURL(blob){const name='blob:sync-'+blobs.size;blobs.set(name,blob);return name}static revokeObjectURL(u){blobs.delete(u)}}
 class Worker{constructor(url){this.queue=blobs.get(url).text().then(code=>{this.context=vm.createContext({onmessage:null,navigator:{storage:{getDirectory:async()=>({getDirectoryHandle:async()=>dir})}},postMessage:data=>queueMicrotask(()=>this.onmessage?.({data}))});vm.runInContext(code,this.context)})}postMessage(data){this.queue=this.queue.then(()=>this.context.onmessage({data})).catch(()=>this.onerror?.())}terminate(){}}
 const context=vm.createContext({navigator:{storage:{getDirectory:async()=>({getDirectoryHandle:async()=>dir})}},location:{origin:'https://site.test'},crypto:webcrypto,URL:TestURL,File,Blob,Worker,ReadableStream,DOMException,AbortSignal,AbortController,setTimeout,clearTimeout,fetch(){}});
 vm.runInContext(source,context);return {api:context.PHAVideoDownload,state};
}
function network(total,{gateIndex=-1,gate,whole=false}={}){
 const calls=[];return {calls,fetch:async(_url,{headers,signal})=>{
  const [,a,b]=headers.range.match(/bytes=(\d+)-(\d+)/),start=+a,end=whole?total-1:+b,index=Math.floor(start/R);calls.push(index);
  if(index===gateIndex)await Promise.race([gate.promise,new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))]);
  let at=start;return new Response(new ReadableStream({async pull(c){if(at>end){c.close();return}await pause(1);const bytes=new Uint8Array(Math.min(65536,end-at+1));bytes.fill(index+7);if(at===0)bytes.set(magic);at+=bytes.length;c.enqueue(bytes)}}),{status:whole?200:206,headers:whole?{}:{'content-range':`bytes ${start}-${end}/${total}`}});
 }};
}
const metadata=size=>({title:'Video',mode:'original',size,downloadUrl:'/api/download?kind=original'});
test('Streaming download exposes bounded reads before commit and prioritizes a tail range without a second fetch',async()=>{
 const total=4*R+17,f=disk(total),gate=deferred(),net=network(total,{gateIndex:2,gate}),seen=deferred();let session,finished=false;
 f.api.onDownload(s=>{session=s;seen.resolve(s)});const job=f.api.attachment(metadata(total),{fetch:net.fetch,concurrency:2});job.then(()=>finished=true);job.catch(()=>{});
 try{await seen.promise;assert.equal(session.streaming,true);const bytes=await session.read(4*R,4*R+17);assert.equal(bytes[0],11);assert.equal(finished,false);assert.ok(net.calls.indexOf(4)<net.calls.indexOf(2)||!net.calls.includes(2));assert.ok(f.state.readsBeforeClose>0);assert.ok(f.state.maxRead<=256*1024);assert.ok(f.state.maxWrite<=1048576);
  gate.resolve();const file=await job;assert.equal(file.size,total);assert.equal(await session.done,file);assert.equal(new Set(net.calls).size,5);assert.equal(net.calls.length,5);assert.equal((await session.read(0,16))[4],102);await f.api.release(file);
 }finally{gate.resolve();await job.catch(()=>{})}
});
test('Streaming read cancellation rejects pending reads and removes the partial disk file',async()=>{
 const total=3*R+17,f=disk(total),gate=deferred(),net=network(total,{gateIndex:0,gate}),seen=deferred();f.api.onDownload(s=>seen.resolve(s));
 // Let the first header arrive, then hold another range while waiting for its bytes.
 const net2=network(total,{gateIndex:1,gate});const job=f.api.attachment(metadata(total),{fetch:net2.fetch,concurrency:2});job.catch(()=>{});const s=await seen.promise;
 const read=s.read(R,R+16);read.catch(()=>{});s.cancel(new DOMException('stopped','AbortError'));await assert.rejects(read,{name:'AbortError'});await assert.rejects(job,{name:'AbortError'});assert.equal(f.state.removed,1);gate.resolve();
});
test('A browser without sync disk access keeps the existing download path and reports no streaming support',async()=>{
 const f=disk(1024,{syncSupported:false});let s;f.api.onDownload(x=>s=x);const file=await f.api.attachment(metadata(1024),{fetch:network(1024).fetch});assert.equal(s.streaming,false);assert.equal(file.size,1024);await f.api.release(file);
});
test('A server without byte ranges downloads once and never offers unsupported early audio',async()=>{
 const f=disk(1024),net=network(1024,{whole:true});let s;f.api.onDownload(x=>s=x);const file=await f.api.attachment(metadata(1024),{fetch:net.fetch});assert.equal(s.streaming,false);assert.equal(net.calls.length,1);await f.api.release(file);
});
function audioMock(samples,{duration=2,readGate}={}){
 const track={computeDuration:async()=>duration},state={closed:0,disposed:0};
 return {state,mb:{CustomSource:class{constructor(options){this.options=options}},Input:class{constructor({source}){this.source=source}async getPrimaryAudioTrack(){if(readGate)await readGate;return track}async getPrimaryVideoTrack(){return {computeDuration:async()=>duration,displayWidth:1920,displayHeight:1080}}dispose(){state.disposed++}},ALL_FORMATS:[],AudioSampleSink:class{async*samples(){for(const sample of samples)yield {...sample,close(){state.closed++},copyTo(dest,{planeIndex}){dest.set(sample.planes[planeIndex])}}}}}};
}
const sample=(time,values,rate=4)=>({timestamp:time,sampleRate:rate,numberOfFrames:values.length,numberOfChannels:2,planes:[Float32Array.from(values),Float32Array.from(values)]});
test('Audio decode emits timed mono chunks before the complete stream and preserves a final short segment',async()=>{
 const a=audioMock([sample(0,[.5,.5,.5,.5]),sample(1,[-.5,-.5,-.5,-.5]),sample(2,[.25,.25])],{duration:2.5}),out=[],c=new AbortController();let info;
 const r=await readDownloadAudio({data:{size:16},signal:c.signal},{sampleRate:4,segmentSeconds:1,onInfo:x=>info=x,onSegment:async(pcm,time)=>out.push([time,[...pcm]]),load:async()=>a.mb});
 assert.equal(r.samples,10);assert.equal(info.duration,2.5);assert.deepEqual(out.map(x=>[x[0],x[1].length]),[[0,4],[1,4],[2,2]]);assert.ok(out[0][1].every(x=>x===16384));assert.equal(a.state.closed,3);
});
test('Audio gaps remain silence and sample-rate conversion preserves the output clock',async()=>{
 const a=audioMock([sample(.5,[.5,.5],4)],{duration:1}),out=[],c=new AbortController();await readDownloadAudio({data:{size:16},signal:c.signal},{sampleRate:8,segmentSeconds:1,onSegment:async pcm=>out.push([...pcm]),load:async()=>a.mb});assert.equal(out[0].length,8);assert.deepEqual(out[0].slice(0,4),[0,0,0,0]);assert.ok(out[0].slice(4).every(x=>x>16000));
});
test('Audio rejects a truncated ending rather than inventing silence for missing speech',async()=>{
 const a=audioMock([sample(0,[.5,.5,.5,.5])],{duration:2}),c=new AbortController();await assert.rejects(readDownloadAudio({data:{size:16},signal:c.signal},{sampleRate:4,onSegment:async()=>{},load:async()=>a.mb}),/chưa đủ mẫu/);
});
// Release 35 starts translation after the current downloader has committed a
// complete file. These checks exercise its actual event bridge and run lock.
test('A finished top download automatically fills the PhaHa video section without sending speech requests',()=>{
 const h=harness(),file=new File(['source'],'downloaded.mp4');h.setFile(file);h.events.get('pha-video-loaded')();
 assert.equal(h.eval('S.tepVideo'),file);assert.equal(h.get('nut-bat-dau').classList.contains('an'),false);assert.match(h.get('chu-chon-video').textContent,/downloaded/);assert.equal(h.eval('S.dangChay'),false);
});
test('A late download event cannot replace the video of an active translation',()=>{
 const h=harness(),old=new File(['old'],'old.mp4'),late=new File(['late'],'late.mp4');h.context.old=old;h.eval('S.tepVideo=old;S.dangChay=true');h.setFile(late);h.events.get('pha-video-loaded')();assert.equal(h.eval('S.tepVideo'),old);
});
test('The lower file picker cannot swap sources during an active translation',()=>{
 const h=harness(),old=new File(['old'],'old.mp4');h.context.old=old;h.context.other=new File(['new'],'other.mp4');h.eval('S.tepVideo=old;S.dangChay=true;nhanVideo(other)');assert.equal(h.eval('S.tepVideo'),old);
});
test('Start waits for the existing top download and does not launch a second transfer',async()=>{
 const h=harness();h.context.input=new File(['input'],'input.mp4');h.eval("S.tepVideo=input;caiDat.khoa='test-key'");h.busy(true);await h.eval('chay(true)');assert.equal(h.eval('S.dangChay'),false);assert.match(h.get('loi').textContent,/Đợi phần tải video/);
});
