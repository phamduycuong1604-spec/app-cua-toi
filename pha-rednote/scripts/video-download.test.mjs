import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile,mkdtemp,rm,open,stat} from 'node:fs/promises';
import {openAsBlob} from 'node:fs';
import {webcrypto} from 'node:crypto';
const source=await readFile(new URL('../web/video-download.js',import.meta.url),'utf8');
const header=new Uint8Array([0,0,0,16,102,116,121,112,105,115,111,109,0,0,0,0]);
async function fixture({quota=4*1024**3,writeError=false,userAgent='',maxTouchPoints=0}={}){
 const path=await mkdtemp('/tmp/pha-video-disk-');let maxWrite=0,removed=0;
 const dir={async getFileHandle(name){return {async createWritable(){const fd=await open(path+'/'+name,'w+');return {async write({position,data}){maxWrite=Math.max(maxWrite,data.length);if(writeError)throw Object.assign(Error('full'),{name:'QuotaExceededError'});await fd.write(data,0,data.length,position)},truncate:n=>fd.truncate(n),close:()=>fd.close(),abort:()=>fd.close()};},getFile:()=>openAsBlob(path+'/'+name)};},async removeEntry(name){removed++;await rm(path+'/'+name,{force:true})}};
 const context=vm.createContext({navigator:{userAgent,maxTouchPoints,storage:{getDirectory:async()=>({getDirectoryHandle:async()=>dir}),estimate:async()=>({quota,usage:0})}},location:{origin:'https://site.test'},crypto:webcrypto,URL,File,Blob,ReadableStream,AbortSignal,AbortController,setTimeout,clearTimeout,fetch(){assert.fail('Supply test fetch')}});
 vm.runInContext(source,context);return {api:context.PHAVideoDownload,context,path,dir,get maxWrite(){return maxWrite},get removed(){return removed},dispose:()=>rm(path,{recursive:true,force:true})};
}
function data(size){return {downloadUrl:'/api/download?kind=original',title:'Video gốc',size};}

test('A render worker never sweeps active page files and can use direct synchronous OPFS without a nested worker',async()=>{
 let removed=0,closed=0,flushed=0;const bytes=new Uint8Array(16);let length=0;
 const handle={async createSyncAccessHandle(){return {truncate(n){length=n},write(chunk,{at}){bytes.set(chunk,at);length=Math.max(length,at+chunk.length);return chunk.length},flush(){flushed++},close(){closed++}}},async getFile(){assert.equal(closed,1);return new Blob([bytes.slice(0,length)])}};
 const dir={async*keys(){yield 'video-1000-active.mp4'},getFileHandle:async()=>handle,async removeEntry(){removed++}};
 class FileSystemFileHandle{createSyncAccessHandle(){}}
 const context=vm.createContext({PHA_STORAGE_WORKER:true,navigator:{storage:{getDirectory:async()=>({getDirectoryHandle:async()=>dir})}},location:{origin:'https://site.test'},crypto:webcrypto,URL,File,Blob,AbortSignal,AbortController,setTimeout,clearTimeout,FileSystemFileHandle,fetch(){}});
 vm.runInContext(source,context);const api=context.PHAVideoDownload;assert.equal(await api.cleaned,0);assert.equal(removed,0);assert.equal(await api.canUseDisk(),true);
 const output=await api.outputFile('worker.mp4');assert.match(output.reference.cacheName,/^video-/);await output.write(header,0);const file=await output.finish();assert.equal(file.size,16);assert.equal(flushed,1);assert.equal(closed,1);assert.equal(removed,0);await api.release(file);assert.equal(removed,1);
});

test('Page and render worker exchange disk references, restore fresh snapshots, and release the same stored output',async()=>{
 const f=await fixture();try{
  const file=await f.api.attachment(data(1024),{fetch:ranged(1024).fetch}),ref=f.api.reference(file);
  assert.equal(ref.size,1024);assert.equal(ref.title,'Video gốc.mp4');
  const restored=await f.api.restore(ref);assert.equal(restored.size,1024);assert.notEqual(restored,file);assert.equal(f.api.reference(restored).cacheName,ref.cacheName);
  assert.deepEqual(new Uint8Array(await restored.slice(0,16).arrayBuffer()),header);
  await f.api.release(restored);assert.equal(f.removed,1);
  await assert.rejects(f.api.restore({...ref,cacheName:'../elsewhere'}),/không hợp lệ/);
  await assert.rejects(f.api.discard({cacheName:'notes.txt'}),/không hợp lệ/);
 }finally{await f.dispose()}
});

test('Discarding a terminated worker partial output removes it without reading or buffering the file',async()=>{
 const f=await fixture();try{const output=await f.api.outputFile();await output.write(header,0);await output.finish();await f.api.discard(output.reference);assert.equal(f.removed,1)}finally{await f.dispose()}
});

test('Bounded source reads report begin/end byte offsets for render diagnostics',async()=>{
 const f=await fixture();try{
  const size=300000,file=await f.api.attachment(data(size),{fetch:ranged(size).fetch}),events=[];
  const src=f.api.mediaSource({CustomSource:class{constructor(options){this.options=options}}},file,{onRead:e=>events.push(e)}),reader=src.options.read(0,size).getReader();
  while(!(await reader.read()).done){}
  assert.deepEqual(events.map(e=>e.event),['begin','end','begin','end']);assert.deepEqual(events.map(e=>[e.start,e.end]),[[0,262144],[0,262144],[262144,300000],[262144,300000]]);
  await f.api.release(file);
 }finally{await f.dispose()}
});
function ranged(total,{failOnce=false,badMagic=false,wrongRange=false,abort}={}){
 const calls=[];let failed=false;
 const fetch=async(_url,{headers})=>{
  const [,a,b]=headers.range.match(/bytes=(\d+)-(\d+)/),start=+a,end=+b;calls.push([start,end]);let at=start;
  return new Response(new ReadableStream({pull(c){if(failOnce&&!failed&&at>start){failed=true;c.error(Error('Load failed'));return;}if(at>end){c.close();return;}const bytes=new Uint8Array(Math.min(1048576,end-at+1));bytes.fill(7);if(at===0&&!badMagic)bytes.set(header);at+=bytes.length;c.enqueue(bytes);abort?.();}}),{status:206,headers:{'content-range':`bytes ${wrongRange?start+1:start}-${end}/${total}`,'content-type':'video/mp4'}});
 };return {fetch,calls};
}
test('Both reported 585 MB and 678 MB files download into real disk files with bounded writes',async()=>{
 const f=await fixture();try{
  for(const size of [585510074,678433035]){const network=ranged(size);let progress=0;const file=await f.api.attachment(data(size),{fetch:network.fetch,onProgress:n=>{progress=n}});
   assert.equal(file.size,size);assert.equal(file.name,'Video gốc.mp4');assert.equal(progress,size);assert.ok(network.calls.length>60);assert.ok(f.maxWrite<=1048576);
   assert.deepEqual(new Uint8Array(await file.slice(0,16).arrayBuffer()),header);assert.equal(new Uint8Array(await file.slice(-1).arrayBuffer())[0],7);
   await f.api.release(file);
  }
  assert.equal(f.removed,2);
 }finally{await f.dispose()}
});
test('An interrupted range retries only that range, preserves other completed ranges and keeps exact final size',async()=>{
 const f=await fixture(),size=9*1048576+19,network=ranged(size,{failOnce:true});try{const file=await f.api.attachment(data(size),{fetch:network.fetch});assert.equal(file.size,size);assert.deepEqual(network.calls.toSorted((a,b)=>a[0]-b[0]),[[0,8388607],[1048576,8388607],[8388608,size-1]]);assert.equal(new Uint8Array(await file.slice(8388608,8388624).arrayBuffer())[0],7);assert.equal(new Uint8Array(await file.slice(-1).arrayBuffer())[0],7);await f.api.release(file);}finally{await f.dispose()}
});
test('HTML and shifted byte ranges are rejected and partial disk files removed',async()=>{
 for(const options of [{badMagic:true},{wrongRange:true}]){const f=await fixture();try{await assert.rejects(f.api.attachment(data(1024),{fetch:ranged(1024,options).fetch}),/không phải video|sai phần video/);assert.equal(f.removed,1);}finally{await f.dispose()}}
});
test('Storage quota is checked before downloading; actual write exhaustion also cleans up',async()=>{
 const f=await fixture({quota:100});try{await assert.rejects(f.api.attachment(data(1024),{fetch:()=>assert.fail('No download with insufficient quota')}),/không đủ/);assert.equal(f.removed,0);}finally{await f.dispose()}
 const g=await fixture({writeError:true});try{await assert.rejects(g.api.attachment(data(1024),{fetch:ranged(1024).fetch}),/đã đầy/);assert.equal(g.removed,1);}finally{await g.dispose()}
});
test('Cancellation and repeated network failures remove incomplete downloads',async()=>{
 const f=await fixture(),controller=new AbortController();try{await assert.rejects(f.api.attachment(data(2*1048576),{signal:controller.signal,fetch:ranged(2*1048576,{abort:()=>controller.abort()}).fetch}),e=>e.name==='AbortError');assert.equal(f.removed,1);}finally{await f.dispose()}
 const g=await fixture();let calls=0;try{await assert.rejects(g.api.attachment(data(1024),{fetch:async()=>{calls++;throw Error('Load failed')}}),/Load failed/);assert.equal(calls,4);assert.equal(g.removed,1);}finally{await g.dispose()}
});
test('External URLs and unavailable storage fail before video download',async()=>{
 const f=await fixture();try{await assert.rejects(f.api.attachment({...data(1024),downloadUrl:'https://evil.test/api/download'}),/không hợp lệ/);delete f.context.navigator.storage.getDirectory;await assert.rejects(f.api.attachment(data(1024)),/Safari chưa cho/);}finally{await f.dispose()}
});
// Exercise the actual fallback worker code for Safari without createWritable.
test('Safari sync-access worker writes bounded chunks and closes its handle before getFile',async()=>{
 const size=3*8388608+17,payload=new Uint8Array(size);let closed=false,position=0,terminated=false,maxWrite=0;const blobs=new Map();
 class TestURL extends URL{static createObjectURL(b){blobs.set('blob:test',b);return 'blob:test'}static revokeObjectURL(u){blobs.delete(u)}}
 const handle={async createSyncAccessHandle(){return {truncate(n){position=n},write(b,{at}){position=Math.max(position,at+b.length);maxWrite=Math.max(maxWrite,b.length);payload.set(b,at);return b.length},flush(){},close(){closed=true}}},async getFile(){assert.equal(closed,true);return new Blob([payload])}};
 const dir={getFileHandle:async()=>handle,removeEntry:async()=>{}};
 class Worker{constructor(url){this.ready=blobs.get(url).text().then(code=>{this.context=vm.createContext({onmessage:null,navigator:{storage:{getDirectory:async()=>({getDirectoryHandle:async()=>dir})}},postMessage:data=>this.onmessage?.({data})});vm.runInContext(code,this.context)})}postMessage(data){this.ready.then(()=>this.context.onmessage({data})).catch(()=>this.onerror?.())}terminate(){terminated=true}}
 const context=vm.createContext({navigator:{storage:{getDirectory:async()=>({getDirectoryHandle:async()=>dir})}},location:{origin:'https://site.test'},crypto:webcrypto,URL:TestURL,File,Blob,Worker,AbortSignal,AbortController,setTimeout,clearTimeout,fetch(){}});vm.runInContext(source,context);
 const network=delayedNetwork(size,{delay:5,failFirst:true});const file=await context.PHAVideoDownload.attachment(data(size),{fetch:network.fetch});assert.equal(file.size,size);assert.equal(position,size);assert.equal(closed,true);assert.equal(terminated,true);assert.equal(network.maxActive,4);assert.ok(maxWrite<=1048576);for(let i=0;i<4;i++)assert.equal(payload[i*8388608+16],i+7);
});

test('1080p output storage accepts seeked MP4 writes, closes a real disk file, and releases it',async()=>{
 const f=await fixture();try{const output=await f.api.outputFile('1080p.mp4');await output.write(new Uint8Array([4,5,6]),4);await output.write(new Uint8Array([1,2,3,4]),0);const file=await output.finish();assert.equal(file.name,'1080p.mp4');assert.equal(file.size,7);assert.deepEqual(new Uint8Array(await file.arrayBuffer()),new Uint8Array([1,2,3,4,4,5,6]));await f.api.release(file);assert.equal(f.removed,1)}finally{await f.dispose()}
});

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function delayedNetwork(total,{delay=100,failFirst=false}={}){
 let active=0,maxActive=0,failed=false;const events=[];
 return {get maxActive(){return maxActive},events,fetch:async(_url,{headers})=>{
  const [,a,b]=headers.range.match(/bytes=(\d+)-(\d+)/),start=+a,end=+b,index=Math.floor(start/8388608);let at=start,closed=false;
  active++;maxActive=Math.max(active,maxActive);await pause(delay);events.push('start:'+index);
  const finish=()=>{if(!closed){closed=true;active--}};
  return new Response(new ReadableStream({async pull(c){
   if(failFirst&&index===0&&!failed&&at>start){failed=true;await pause(200);finish();events.push('fail:0');c.error(Error('interrupted'));return;}
   if(at>end){finish();events.push('done:'+index);c.close();return;}
   const bytes=new Uint8Array(Math.min(65536,end-at+1));bytes.fill(index+7);if(at===0)bytes.set(header);at+=bytes.length;c.enqueue(bytes);
  },cancel:finish}),{status:206,headers:{'content-range':`bytes ${start}-${end}/${total}`}});
 }};
}
test('Four bounded lanes beat serial header waits and assemble out-of-order ranges correctly',async()=>{
 const size=8*8388608+17,f=await fixture();try{
  const timings=[];
  for(const concurrency of [1,4]){const network=delayedNetwork(size),start=Date.now();let progress=0;
   const file=await f.api.attachment(data(size),{concurrency,fetch:network.fetch,onProgress:(n,total,stats)=>{assert.ok(n>=0&&n<=total);assert.ok(stats.bytesPerSecond>=0);progress=n}});
   timings.push(Date.now()-start);assert.equal(network.maxActive,concurrency);assert.equal(progress,size);
   for(let i=0;i<9;i++){const at=i*8388608+(i===0?16:0);assert.equal(new Uint8Array(await file.slice(at,at+1).arrayBuffer())[0],i+7)}
   assert.ok(f.maxWrite<=1048576);await f.api.release(file);
  }
  assert.ok(timings[1]<timings[0]*.75,`serial ${timings[0]}ms, parallel ${timings[1]}ms`);
 }finally{await f.dispose()}
});
test('Retrying an early range never truncates ranges that finished ahead of it',async()=>{
 const size=3*8388608+17,f=await fixture(),network=delayedNetwork(size,{delay:5,failFirst:true});try{
  const file=await f.api.attachment(data(size),{fetch:network.fetch});
  assert.ok(network.events.indexOf('done:1')<network.events.indexOf('fail:0'));
  for(let i=0;i<4;i++)assert.equal(new Uint8Array(await file.slice(i*8388608+16,i*8388608+17).arrayBuffer())[0],i+7);
  assert.equal(file.size,size);await f.api.release(file);
 }finally{await f.dispose()}
});
test('A server without ranges uses one whole-file stream and bounded disk writes',async()=>{
 const size=10*1048576,f=await fixture();let requests=0;try{
  const file=await f.api.attachment(data(size),{fetch:async()=>{requests++;let at=0;return new Response(new ReadableStream({pull(c){if(at===size){c.close();return}const bytes=new Uint8Array(Math.min(65536,size-at));bytes.fill(7);if(!at)bytes.set(header);at+=bytes.length;c.enqueue(bytes)}}),{status:200})}});
  assert.equal(requests,1);assert.equal(file.size,size);assert.ok(f.maxWrite<=1048576);assert.equal(new Uint8Array(await file.slice(-1).arrayBuffer())[0],7);await f.api.release(file);
 }finally{await f.dispose()}
});
test('A fatal parallel range mismatch cancels stalled readers before deleting partial storage',async()=>{
 const f=await fixture();let cancelled=0,requested=0;try{
  await assert.rejects(f.api.attachment(data(4*8388608),{fetch:async(_url,{headers})=>{
   const [,a,b]=headers.range.match(/bytes=(\d+)-(\d+)/),start=+a,end=+b;requested++;
   if(start===8388608){await pause(50);return new Response(new Uint8Array([1]),{status:206,headers:{'content-range':`bytes ${start+1}-${end}/${4*8388608}`}})}
   return new Response(new ReadableStream({start(c){const bytes=new Uint8Array(65536);if(!start)bytes.set(header);c.enqueue(bytes)},cancel(){cancelled++}}),{status:206,headers:{'content-range':`bytes ${start}-${end}/${4*8388608}`}});
  }}),/sai phần video/);
  assert.equal(requested,4);assert.equal(cancelled,3);assert.equal(f.removed,1);
 }finally{await f.dispose()}
});

function cacheDir(names){
 const files=new Set(names),removed=[];
 return {files,removed,dir:{async*keys(){for(const name of [...files])yield name},async removeEntry(name){removed.push(name);files.delete(name)},async getFileHandle(){assert.fail('Cleanup must not create files')}}};
}
function cleanupContext(dir,locks){
 const navigator={storage:{getDirectory:async()=>({getDirectoryHandle:async()=>dir})}};if(locks)navigator.locks=locks;
 const context=vm.createContext({navigator,location:{origin:'https://site.test'},crypto:webcrypto,URL,File,Blob,AbortSignal,AbortController,setTimeout,clearTimeout,fetch(){}});
 vm.runInContext(source,context);return context;
}
test('Opening the app removes videos left by earlier sessions but keeps newer and unrelated files',async()=>{
 const later='video-'+(Date.now()+60000)+'-new.mp4',cache=cacheDir(['video-1000-old.mp4','video-1700000000000-crash.mp4',later,'notes.txt']);
 const context=cleanupContext(cache.dir);
 assert.equal(await context.PHAVideoDownload.cleaned,2);
 assert.deepEqual(cache.removed.toSorted(),['video-1000-old.mp4','video-1700000000000-crash.mp4']);
 assert.deepEqual([...cache.files].toSorted(),[later,'notes.txt'].toSorted());
});
test('Cleanup is skipped while another tab holds the app storage lock, then this tab holds a shared lock',async()=>{
 const cache=cacheDir(['video-1000-old.mp4']),requests=[];
 const locks={async request(name,options,callback){requests.push([name,options.mode,!!options.ifAvailable]);if(options.mode==='exclusive')return callback(null);return new Promise(()=>{})}};
 const context=cleanupContext(cache.dir,locks);
 assert.equal(await context.PHAVideoDownload.cleaned,0);await pause(0);
 assert.deepEqual(cache.removed,[]);assert.deepEqual(requests,[['pha-video-cache','exclusive',true],['pha-video-cache','shared',false]]);
});
test('A download waits for cleanup, so freed space counts before the quota check',async()=>{
 const cache=cacheDir(['video-1000-old.mp4']);let usage=900;
 const dir={...cache.dir,async removeEntry(name){await pause(20);usage=0;return cache.dir.removeEntry(name)},async getFileHandle(){throw Error('passed quota check')}};
 const context=cleanupContext(dir);context.navigator.storage.estimate=async()=>({quota:1000+16*1048576,usage});
 await assert.rejects(context.PHAVideoDownload.attachment(data(1000),{fetch:()=>assert.fail('No network needed')}),/passed quota check/);
 assert.deepEqual(cache.removed,['video-1000-old.mp4']);
});

test('canUseDisk says yes only when the browser can really open app storage and write to it',async()=>{
 const dir={getFileHandle:async()=>{},removeEntry:async()=>{}};
 const run=(navigator,extra={})=>{const context=vm.createContext({navigator,location:{origin:'https://site.test'},crypto:webcrypto,URL,File,Blob,AbortSignal,AbortController,setTimeout,clearTimeout,fetch(){},...extra});vm.runInContext(source,context);return context.PHAVideoDownload.canUseDisk();};
 class Worker{}
 assert.equal(await run({storage:{getDirectory:async()=>({getDirectoryHandle:async()=>dir})}},{Worker}),true);
 assert.equal(await run({storage:{getDirectory:async()=>({getDirectoryHandle:async()=>dir})}},{FileSystemFileHandle:class{createWritable(){}}}),true);
 assert.equal(await run({storage:{getDirectory:async()=>({getDirectoryHandle:async()=>dir})}}),false);
 assert.equal(await run({storage:{getDirectory:async()=>{throw Object.assign(Error('private mode'),{name:'SecurityError'})}}},{Worker}),false);
 assert.equal(await run({},{Worker}),false);
});

// Safari-like storage quirks seen as "Video lưu chưa đủ dung lượng" after every byte had arrived.
async function quirkyDisk({viewBug=false,staleReads=0,reportDelta=0}={}){
 const path=await mkdtemp('/tmp/pha-video-quirk-');let reads=0;
 const real=name=>openAsBlob(path+'/'+name);
 const handleFor=name=>({async createWritable(){const fd=await open(path+'/'+name,'w+');return {async write({position,data}){const bytes=viewBug?new Uint8Array(data.buffer):data;await fd.write(bytes,0,bytes.length,position)},truncate:n=>fd.truncate(n),close:()=>fd.close(),abort:()=>fd.close()};},
  async getFile(){const file=await real(name);reads++;if(reads<=staleReads)return file.slice(0,Math.max(0,file.size-4096));if(reportDelta<0)return file.slice(0,file.size+reportDelta);if(reportDelta>0)return new Blob([file,new Uint8Array(reportDelta).fill(9)]);return file}});
 const dir={getFileHandle:async name=>handleFor(name),removeEntry:async name=>rm(path+'/'+name,{force:true})};
 const context=vm.createContext({navigator:{storage:{getDirectory:async()=>({getDirectoryHandle:async()=>dir}),estimate:async()=>({quota:4*1024**3,usage:0})}},location:{origin:'https://site.test'},crypto:webcrypto,URL,File,Blob,AbortSignal,AbortController,setTimeout,clearTimeout,fetch(){}});
 vm.runInContext(source,context);return {api:context.PHAVideoDownload,get reads(){return reads},dispose:()=>rm(path,{recursive:true,force:true})};
}
test('A browser that writes the whole buffer behind a partial view no longer leaves extra bytes at the end',async()=>{
 const size=9*1048576+19,d=await quirkyDisk({viewBug:true});try{
  const file=await d.api.attachment(data(size),{fetch:ranged(size).fetch});
  assert.equal(file.size,size);assert.equal(new Uint8Array(await file.slice(-1).arrayBuffer())[0],7);
  assert.deepEqual(new Uint8Array(await file.slice(0,16).arrayBuffer()),header);
 }finally{await d.dispose()}
});
test('A size that is briefly stale right after saving is read again instead of failing the whole download',async()=>{
 const size=3*1048576+5,d=await quirkyDisk({staleReads:2});try{
  const file=await d.api.attachment(data(size),{fetch:ranged(size).fetch});
  assert.equal(file.size,size);assert.ok(d.reads>=3);
 }finally{await d.dispose()}
});
test('A really short saved file fails with the exact byte counts and storage method for the log',async()=>{
 const size=2*1048576,d=await quirkyDisk({reportDelta:-100});try{
  await assert.rejects(d.api.attachment(data(size),{fetch:ranged(size).fetch}),e=>/chưa đủ dung lượng/.test(e.message)&&e.message.includes((size-100)+' / '+size+' byte')&&/cách ghi: writable/.test(e.message));
 }finally{await d.dispose()}
});
test('Extra bytes past the expected end are cut off and reported, keeping the real video intact',async()=>{
 const size=2*1048576+3,d=await quirkyDisk({reportDelta:777});try{
  const file=await d.api.attachment(data(size),{fetch:ranged(size).fetch});
  assert.equal(file.size,size);assert.equal(new Uint8Array(await file.slice(-1).arrayBuffer())[0],7);
  assert.equal(file.phaStorage.kind,'writable');assert.equal(file.phaStorage.trimmed,777);
 }finally{await d.dispose()}
});

// ---- Phần 10 (tiếp): tải nhanh hơn ----
function p11Network(total,{stallRange=-1,stallAt='body',stallTimes=1}={}){
 let active=0,maxActive=0;const calls=[],stalled=new Map();
 const fetch=async(_url,{headers,signal})=>{
  const [,a,b]=headers.range.match(/bytes=(\d+)-(\d+)/),start=+a,end=+b,index=Math.floor(start/8388608);calls.push(index);
  const hang=index===stallRange&&(stalled.get(index)||0)<stallTimes;if(hang)stalled.set(index,(stalled.get(index)||0)+1);
  if(hang&&stallAt==='header')return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
  active++;maxActive=Math.max(active,maxActive);let at=start,sent=0,done=false;const finish=()=>{if(!done){done=true;active--}};
  return new Response(new ReadableStream({async pull(c){
   if(hang&&sent>=65536){await new Promise((_,reject)=>signal.addEventListener('abort',()=>{finish();reject(signal.reason)},{once:true}));return}
   if(at>end){finish();c.close();return}
   await new Promise(r=>setTimeout(r,2));const bytes=new Uint8Array(Math.min(65536,end-at+1));bytes.fill(index+7);if(at===0)bytes.set(header);at+=bytes.length;sent+=bytes.length;c.enqueue(bytes);
  },cancel:finish}),{status:206,headers:{'content-range':`bytes ${start}-${end}/${total}`}});
 };
 return {fetch,calls,get maxActive(){return maxActive}};
}
test('At most four lanes download at once by default',{timeout:30000},async()=>{
 const size=8*8388608,f=await fixture(),net=p11Network(size);try{
  const file=await f.api.attachment(data(size),{fetch:net.fetch});assert.equal(file.size,size);assert.equal(net.maxActive,4);assert.equal(f.api.CONCURRENCY,4);await f.api.release(file);
 }finally{await f.dispose()}
});
test('A part that stops sending bytes is retried after the stall limit instead of waiting 90 seconds',{timeout:15000},async()=>{
 const size=3*8388608+17,f=await fixture(),net=p11Network(size,{stallRange:1});let lastStats;const began=Date.now();try{
  const file=await f.api.attachment(data(size),{fetch:net.fetch,stallMs:300,onProgress:(n,t,s)=>{lastStats=s}});
  assert.equal(file.size,size);assert.ok(Date.now()-began<8000);assert.equal(net.calls.filter(i=>i===1).length,2);assert.equal(lastStats.retries,1);
  assert.equal(new Uint8Array(await file.slice(8388608+100,8388608+101).arrayBuffer())[0],8);await f.api.release(file);
 }finally{await f.dispose()}
});
test('A part whose server never answers is retried after the header wait',{timeout:15000},async()=>{
 const size=2*8388608,f=await fixture(),net=p11Network(size,{stallRange:1,stallAt:'header'});try{
  const file=await f.api.attachment(data(size),{fetch:net.fetch,headerWaitMs:300,stallMs:300});assert.equal(file.size,size);assert.equal(net.calls.filter(i=>i===1).length,2);await f.api.release(file);
 }finally{await f.dispose()}
});
test('A part stalling three times uses exactly its three retries then finishes',{timeout:15000},async()=>{
 const size=2*8388608+5,f=await fixture(),net=p11Network(size,{stallRange:1,stallTimes:3});try{
  const file=await f.api.attachment(data(size),{fetch:net.fetch,stallMs:200});assert.equal(file.size,size);assert.equal(net.calls.filter(i=>i===1).length,4);await f.api.release(file);
 }finally{await f.dispose()}
});
test('The screen is kept awake while downloading and released afterwards, even when the download fails',{timeout:15000},async()=>{
 for(const fail of [false,true]){
  const f=await fixture();const lock={released:false,release:async()=>{lock.released=true}};const asked=[];
  f.context.navigator.wakeLock={request:async type=>{asked.push(type);return lock}};
  try{
   const work=f.api.attachment(data(2*1048576),{fetch:fail?async()=>{throw Error('Load failed')}:ranged(2*1048576).fetch});
   if(fail)await assert.rejects(work,/Load failed/);else await f.api.release(await work);
   assert.deepEqual(asked,['screen']);assert.equal(lock.released,true);
  }finally{await f.dispose()}
 }
});
test('A browser that refuses to keep the screen awake still downloads normally',async()=>{
 const f=await fixture();f.context.navigator.wakeLock={request:async()=>{throw Object.assign(Error('denied'),{name:'NotAllowedError'})}};
 try{const file=await f.api.attachment(data(1048576+3),{fetch:ranged(1048576+3).fetch});assert.equal(file.size,1048576+3);await f.api.release(file)}finally{await f.dispose()}
});

test('Transient Safari disk-write errors retry the same bounded bytes without downloading the video again',async()=>{
 const f=await fixture(),base=f.dir.getFileHandle.bind(f.dir),net=ranged(2*1048576+3);let failed=0,stats;
 f.dir.getFileHandle=async name=>{const h=await base(name);return {...h,async createWritable(){const w=await h.createWritable();return {...w,async write(chunk){if(chunk.position===0&&failed<2){failed++;throw new DOMException('unknown transient reason (e.g. out of memory)','UnknownError')}return w.write(chunk)}}}}};
 try{const file=await f.api.attachment(data(2*1048576+3),{fetch:net.fetch,onProgress:(n,t,s)=>{stats=s}});assert.equal(file.size,2*1048576+3);assert.equal(failed,2);assert.equal(stats.storageRetries,2);assert.equal(net.calls.length,1);assert.deepEqual(new Uint8Array(await file.slice(0,16).arrayBuffer()),header);assert.ok(f.maxWrite<=1048576);await f.api.release(file)}finally{await f.dispose()}
});
test('Repeated transient disk failures are bounded and report write position and method',async()=>{
 const f=await fixture(),base=f.dir.getFileHandle.bind(f.dir);let failed=0;
 f.dir.getFileHandle=async name=>{const h=await base(name);return {...h,async createWritable(){const w=await h.createWritable();return {...w,async write(){failed++;throw new DOMException('transient failure','UnknownError')}}}}};
 try{await assert.rejects(f.api.attachment(data(1024),{fetch:ranged(1024).fetch}),e=>e.name==='UnknownError'&&/ghi video tại 0 byte · cách ghi: writable/.test(e.message));assert.equal(failed,3);assert.equal(f.removed,1)}finally{await f.dispose()}
});
test('Rendering reopens a stored video and recovers stale Safari snapshots using bounded reads',async()=>{
 const f=await fixture(),size=2*1048576+19;f.context.ReadableStream=ReadableStream;f.context.DOMException=DOMException;
 try{
  const file=await f.api.attachment(data(size),{fetch:ranged(size).fetch});file.slice=()=>assert.fail('The stale wrapper must not be read');file.arrayBuffer=()=>assert.fail('Never buffer the whole file');
  const base=f.dir.getFileHandle.bind(f.dir);let reads=0,failed=false,maxRead=0;const retries=[];
  f.dir.getFileHandle=async name=>{const handle=await base(name);return {...handle,async getFile(){const blob=await handle.getFile();reads++;return {size:blob.size,slice(start,end){maxRead=Math.max(maxRead,end-start);return {async arrayBuffer(){if(!failed){failed=true;throw new DOMException('The object can not be found here.','NotFoundError')}return blob.slice(start,end).arrayBuffer()}}}}}}};
  const mb={CustomSource:class{constructor(options){this.options=options}}};
  const source=f.api.mediaSource(mb,file,{onRetry:r=>retries.push(r)}),reader=source.options.read(0,size).getReader();let count=0,first,last;
  while(true){const {done,value}=await reader.read();if(done)break;first??=value.slice(0,16);last=value.at(-1);count+=value.length}
  assert.equal(count,size);assert.deepEqual(Array.from(first),Array.from(header));assert.equal(last,7);assert.equal(retries.length,1);assert.equal(retries[0].name,'NotFoundError');assert.equal(reads,2);assert.ok(maxRead<=256*1024);assert.equal(source.options.maxCacheSize,4*1048576);await f.api.release(file);
 }finally{await f.dispose()}
});
test('A cancelled stored-video read stops without reopening or returning bytes',async()=>{
 const f=await fixture();f.context.ReadableStream=ReadableStream;f.context.DOMException=DOMException;
 try{const file=await f.api.attachment(data(1024),{fetch:ranged(1024).fetch}),controller=new AbortController();controller.abort();const source=f.api.mediaSource({CustomSource:class{constructor(o){this.options=o}}},file,{signal:controller.signal});await assert.rejects(source.options.read(0,1024).getReader().read(),e=>e.name==='AbortError');await f.api.release(file)}finally{await f.dispose()}
});

test('A caller requesting many lanes is clamped to four and preserves byte-for-byte output',async()=>{
 const size=6*8388608+17,f=await fixture(),net=p11Network(size);try{
  const file=await f.api.attachment(data(size),{fetch:net.fetch,concurrency:20});assert.equal(net.maxActive,4);assert.equal(file.size,size);await f.api.release(file);
 }finally{await f.dispose()}
});
test('Default first-response timeout is 60 seconds and an abort-ignoring fetch cannot hang beyond three retries',{timeout:3000},async()=>{
 const f=await fixture(),timeouts=[],events=[];let calls=0;f.context.setTimeout=(fn,ms)=>{timeouts.push(ms);return setTimeout(fn,ms===60000?10:ms)};
 try{
  await assert.rejects(f.api.attachment(data(16),{fetch:()=>{calls++;return new Promise(()=>{})},onRetry:e=>events.push(e)}),/thất bại sau 4 lượt/);
  assert.equal(calls,4);assert.equal(timeouts.filter(ms=>ms===60000).length,4);assert.deepEqual(events.map(e=>e.retry),[1,2,3]);assert.ok(events.every(e=>e.phase==='header'&&e.maxRetries===3));assert.equal(f.removed,1);
 }finally{await f.dispose()}
});
test('Default 35-second body stall cancels and retries even when the underlying body and cancel never resolve',{timeout:3000},async()=>{
 const f=await fixture(),events=[],timeouts=[];let calls=0,cancelled=0;
 f.context.setTimeout=(fn,ms)=>{timeouts.push(ms);return setTimeout(fn,ms>=34950&&ms<=35000?10:ms)};
 try{
  await assert.rejects(f.api.attachment(data(16),{fetch:async()=>{calls++;return new Response(new ReadableStream({pull(){return new Promise(()=>{})},cancel(){cancelled++;return new Promise(()=>{})}}),{status:206,headers:{'content-range':'bytes 0-15/16'}})},onRetry:e=>events.push(e)}),/thất bại sau 4 lượt/);
  assert.equal(calls,4);assert.equal(cancelled,4);assert.equal(events.length,3);assert.ok(events.every(e=>e.phase==='body'&&e.name==='TimeoutError'));assert.ok(timeouts.some(ms=>ms===35000));assert.equal(f.removed,1);
 }finally{await f.dispose()}
});
test('Header errors, body stalls and truncated parts share one three-retry budget',{timeout:3000},async()=>{
 const f=await fixture(),events=[];let calls=0;
 try{
  const file=await f.api.attachment(data(16),{stallMs:30,fetch:async()=>{
   calls++;if(calls===1)throw Error('Load failed');
   if(calls===2)return new Response(new ReadableStream({pull(){return new Promise(()=>{})}}),{status:206,headers:{'content-range':'bytes 0-15/16'}});
   return new Response(calls===3?header.slice(0,8):header,{status:206,headers:{'content-range':'bytes 0-15/16'}});
  },onRetry:e=>events.push(e)});
  assert.equal(calls,4);assert.equal(events.length,3);assert.deepEqual(new Uint8Array(await file.arrayBuffer()),header);await f.api.release(file);
 }finally{await f.dispose()}
});
test('Empty body chunks do not reset the no-data stall clock',{timeout:3000},async()=>{
 const f=await fixture();let calls=0;
 try{
  await assert.rejects(f.api.attachment(data(32),{stallMs:30,fetch:async()=>{
   calls++;let first=true;return new Response(new ReadableStream({async pull(c){await pause(2);if(first){first=false;c.enqueue(header)}else c.enqueue(new Uint8Array())}}),{status:206,headers:{'content-range':'bytes 0-31/32'}});
  }}),/thất bại sau 4 lượt/);assert.equal(calls,4);assert.equal(f.removed,1);
 }finally{await f.dispose()}
});
test('Slow successful OPFS writes are not mistaken for network stalls',{timeout:3000},async()=>{
 const f=await fixture(),get=f.dir.getFileHandle.bind(f.dir);let retries=0;
 f.dir.getFileHandle=async name=>{const h=await get(name),openWriter=h.createWritable.bind(h);h.createWritable=async()=>{const w=await openWriter(),write=w.write.bind(w);w.write=async p=>{await pause(50);return write(p)};return w};return h};
 try{const file=await f.api.attachment(data(1048576+16),{fetch:ranged(1048576+16).fetch,stallMs:20,onRetry:()=>retries++});assert.equal(file.size,1048576+16);assert.equal(retries,0);await f.api.release(file)}finally{await f.dispose()}
});

for(const [name,userAgent,maxTouchPoints,expected] of [
 ['Windows','Mozilla/5.0 (Windows NT 10.0; Win64; x64)',0,6],
 ['Mac','Mozilla/5.0 (Macintosh; Intel Mac OS X)',0,6],
 ['iPhone','Mozilla/5.0 (iPhone; CPU iPhone OS 18_6)',5,4],
 ['iPad desktop UA','Mozilla/5.0 (Macintosh; Intel Mac OS X)',5,4]
])test('Download lane cap for '+name,async()=>{
 const f=await fixture({userAgent,maxTouchPoints}),size=6*8388608+17,net=p11Network(size);
 try{assert.equal(f.api.CONCURRENCY,expected);const file=await f.api.attachment(data(size),{fetch:net.fetch,concurrency:20});assert.equal(net.maxActive,expected);assert.ok(f.maxWrite<=1048576);assert.equal(file.size,size);await f.api.release(file)}finally{await f.dispose()}
});
test('Retry keeps committed bytes, re-requests only the missing suffix, and never rolls progress back',async()=>{
 const f=await fixture(),size=3*1048576+29,network=ranged(size,{failOnce:true}),events=[],progress=[];
 try{const file=await f.api.attachment(data(size),{fetch:network.fetch,onRetry:e=>events.push(e),onProgress:n=>progress.push(n)});
  assert.deepEqual(network.calls,[[0,size-1],[1048576,size-1]]);assert.equal(events[0].resumedBytes,1048576);assert.equal(events[0].resumeFrom,1048576);
  assert.ok(progress.every((n,i)=>!i||n>=progress[i-1]));assert.deepEqual(new Uint8Array(await file.slice(0,16).arrayBuffer()),header);assert.equal(file.size,size);await f.api.release(file);
 }finally{await f.dispose()}
});
test('A server without byte ranges restarts safely from zero after interruption',async()=>{
 const f=await fixture(),size=2*1048576+17,calls=[];let first=true;
 try{const file=await f.api.attachment(data(size),{fetch:async(_,{headers})=>{
  calls.push(headers.range);let at=0,fail=first;first=false;
  return new Response(new ReadableStream({pull(c){if(fail&&at>=1048576){c.error(Error('Load failed'));return;}if(at===size){c.close();return;}const b=new Uint8Array(Math.min(1048576,size-at));b.fill(7);if(!at)b.set(header);at+=b.length;c.enqueue(b)}}),{status:200});
 }});assert.deepEqual(calls,['bytes=0-'+(size-1),'bytes=0-'+(size-1)]);assert.equal(file.size,size);assert.deepEqual(new Uint8Array(await file.slice(0,16).arrayBuffer()),header);await f.api.release(file)}finally{await f.dispose()}
});
test('Different ETags on equal-sized ranges cannot be combined into a corrupt MP4',async()=>{
 const f=await fixture(),size=9*1048576,net=ranged(size);
 try{await assert.rejects(f.api.attachment(data(size),{fetch:async(u,o)=>{const r=await net.fetch(u,o);r.headers.set('etag',o.headers.range.startsWith('bytes=0-')?'"first"':'"changed"');return r}}),/đã thay đổi giữa các phần/);assert.equal(f.removed,1)}finally{await f.dispose()}
});

test('A wrong range with a hanging cancel cannot trap the downloader',{timeout:1000},async()=>{
 const f=await fixture();try{await assert.rejects(f.api.attachment(data(16),{fetch:async()=>({ok:true,status:206,headers:new Headers({'content-range':'bytes 1-15/16'}),body:{cancel:()=>new Promise(()=>{})}})}),/sai phần video/);assert.equal(f.removed,1)}finally{await f.dispose()}
});
test('An interrupted 8 MB range after 6 MB saved transfers only its 2 MB suffix',async()=>{
 const f=await fixture(),size=8*1048576,calls=[];let wireBytes=0,fail=true;
 try{const file=await f.api.attachment(data(size),{fetch:async(_,{headers})=>{
  const start=Number(headers.range.match(/bytes=(\d+)/)[1]);calls.push(start);let at=start;
  return {ok:true,status:206,headers:new Headers({'content-range':'bytes '+start+'-'+(size-1)+'/'+size}),body:{getReader:()=>({
   async read(){if(fail&&at===6*1048576){fail=false;throw Error('Load failed')}if(at===size)return {done:true};const b=new Uint8Array(1048576);b.fill(7);if(!at)b.set(header);at+=b.length;wireBytes+=b.length;return {done:false,value:b}},async cancel(){},releaseLock(){}
  })}};
 }});assert.deepEqual(calls,[0,6*1048576]);assert.equal(wireBytes,size);assert.equal(file.size,size);await f.api.release(file)}finally{await f.dispose()}
});

// Measured bandwidth scenarios: independent connections, a shared bottleneck,
// and a lost tail. Every scenario writes real disk files, not an in-memory Blob.
function adaptiveNetwork(total,{bottleneck=false,failOnce=false}={}){
 let active=0,maxActive=0,failed=false;const calls=[];
 return {calls,get maxActive(){return maxActive},get active(){return active},fetch:async(_,{headers})=>{
  const [,a,b]=headers.range.match(/bytes=(\d+)-(\d+)/),start=+a,end=+b;calls.push([start,end]);
  if(failOnce&&!failed&&start>0){failed=true;throw Error('temporary network error')}
  active++;maxActive=Math.max(maxActive,active);let at=start,closed=false;
  const finish=()=>{if(!closed){closed=true;active--}};
  return new Response(new ReadableStream({async pull(c){
   await pause(bottleneck&&active>4?65:15);if(closed)return;
   if(at>end){finish();c.close();return;}
   const bytes=new Uint8Array(Math.min(262144,end-at+1));bytes.fill(Math.floor(at/8388608)+7);if(at===0)bytes.set(header);at+=bytes.length;c.enqueue(bytes);
  },cancel:finish}),{status:206,headers:{'content-range':`bytes ${start}-${end}/${total}`,'etag':'same-video'}});
 }};
}
async function verifyAdaptiveFile(file,size){
 assert.equal(file.size,size);assert.deepEqual(new Uint8Array(await file.slice(0,16).arrayBuffer()),header);
 for(let i=0;i<Math.ceil(size/8388608);i++){const at=i*8388608+16;assert.equal(new Uint8Array(await file.slice(at,at+1).arrayBuffer())[0],i+7)}
}
test('Automatic 4-to-6 trial keeps a measured improvement and beats fixed four lanes',{timeout:20000},async t=>{
 const size=32*8388608,f=await fixture({userAgent:'iPhone'}),timings=[];
 try{
  for(const automatic of [false,true]){
   const net=adaptiveNetwork(size),events=[],began=Date.now();
   const file=await f.api.attachment(data(size),{fetch:net.fetch,...(automatic?{}:{concurrency:4}),tuningMs:600,onTune:e=>events.push(e)});
   timings.push(Date.now()-began);await verifyAdaptiveFile(file,size);assert.ok(f.maxWrite<=1048576);assert.equal(net.active,0);
   if(automatic){assert.equal(net.maxActive,6);assert.ok(events.some(e=>e.to===6&&/Giữ/.test(e.reason)),JSON.stringify(events));}else assert.equal(net.maxActive,4);
   await f.api.release(file);
  }
  t.diagnostic('simulated independent connections: fixed4='+timings[0]+'ms, adaptive='+timings[1]+'ms');
  assert.ok(timings[1]<timings[0]*.9,'Adaptive should improve on a source that scales per connection: '+timings);
 }finally{await f.dispose()}
});
test('Automatic trial returns to four lanes when six encounters a shared bottleneck',{timeout:20000},async()=>{
 const size=32*8388608,f=await fixture(),net=adaptiveNetwork(size,{bottleneck:true}),events=[],progress=[];
 try{const file=await f.api.attachment(data(size),{fetch:net.fetch,tuningMs:600,onTune:e=>events.push(e),onProgress:n=>progress.push(n)});
  assert.equal(net.maxActive,6);assert.ok(events.some(e=>e.from===6&&e.to===4),JSON.stringify(events));assert.ok(progress.every((n,i)=>!i||n>=progress[i-1]));await verifyAdaptiveFile(file,size);assert.equal(net.calls.length,32);await f.api.release(file);
 }finally{await f.dispose()}
});
test('Network retries lower automatic concurrency and retain all successful bytes',{timeout:20000},async()=>{
 const size=16*8388608,f=await fixture(),net=adaptiveNetwork(size,{failOnce:true}),events=[];
 try{const file=await f.api.attachment(data(size),{fetch:net.fetch,tuningMs:300,onTune:e=>events.push(e)});
  assert.ok(events.some(e=>e.to===2&&/lỗi/.test(e.reason)));assert.equal(net.maxActive,4);assert.equal(net.calls.length,17);await verifyAdaptiveFile(file,size);await f.api.release(file);
 }finally{await f.dispose()}
});
test('Idle lanes recover a stalled tail early from its committed offset, without duplicate ranges',{timeout:4000},async t=>{
 const size=4*8388608,f=await fixture(),calls=[],events=[];let hung=false,cancelled=0;const began=Date.now();
 try{const file=await f.api.attachment(data(size),{tuningMs:250,tailWaitMs:150,stallMs:3000,onRetry:e=>events.push(e),fetch:async(_,{headers})=>{
  const [,a,b]=headers.range.match(/bytes=(\d+)-(\d+)/),start=+a,end=+b,index=Math.floor(start/8388608);calls.push([start,end]);let at=start;const hang=index===1&&!hung;if(hang)hung=true;
  return new Response(new ReadableStream({pull(c){
   if(hang&&at>start)return new Promise(()=>{});
   if(at>end){c.close();return}
   const bytes=new Uint8Array(Math.min(1048576,end-at+1));bytes.fill(index+7);if(at===0)bytes.set(header);at+=bytes.length;c.enqueue(bytes);
  },cancel(){cancelled++}}),{status:206,headers:{'content-range':`bytes ${start}-${end}/${size}`}});
 }});
  const elapsed=Date.now()-began;t.diagnostic('simulated stalled tail recovered in '+elapsed+'ms with 3000ms normal stall threshold');
  assert.ok(elapsed<1800);assert.equal(events.length,1);assert.match(events[0].reason,/Phần cuối/);assert.equal(events[0].resumeFrom,8388608+1048576);assert.equal(events[0].retry,1);assert.ok(cancelled>=1);
  assert.equal(calls.filter(([a])=>a===0).length,1);assert.equal(calls.length,5);await verifyAdaptiveFile(file,size);await f.api.release(file);
 }finally{await f.dispose()}
});
test('Automatic tuning cancels every active lane and removes partial files after a six-lane trial',{timeout:5000},async()=>{
 const size=32*8388608,f=await fixture(),net=adaptiveNetwork(size),controller=new AbortController();let tuned=false;
 try{await assert.rejects(f.api.attachment(data(size),{fetch:net.fetch,signal:controller.signal,tuningMs:300,onTune:e=>{if(e.to===6){tuned=true;setTimeout(()=>controller.abort(),50)}}}),e=>e.name==='AbortError');assert.equal(tuned,true);assert.equal(net.active,0);assert.equal(f.removed,1)}finally{await f.dispose()}
});

test('Tail recovery never treats queued or slow disk writes as a network stall',{timeout:6000},async()=>{
 const size=4*8388608,f=await fixture(),get=f.dir.getFileHandle.bind(f.dir);let retries=0;
 f.dir.getFileHandle=async name=>{const h=await get(name),create=h.createWritable.bind(h);h.createWritable=async()=>{const w=await create(),write=w.write.bind(w);w.write=async p=>{await pause(50);return write(p)};return w};return h};
 try{const file=await f.api.attachment(data(size),{fetch:ranged(size).fetch,tuningMs:250,tailWaitMs:30,onRetry:()=>retries++});assert.equal(file.size,size);assert.equal(retries,0);assert.ok(f.maxWrite<=1048576);await f.api.release(file)}finally{await f.dispose()}
});
