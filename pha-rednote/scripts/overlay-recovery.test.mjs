import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const text=await readFile(new URL('../web/lop-phu.js',import.meta.url),'utf8');
const source=text.replace(/^import .*\n/,'').replaceAll('export const ','const ').replaceAll('export function ','function ').replaceAll('export async function ','async function ').replaceAll('import(MB)','loadMB()').replaceAll('import.meta.url',JSON.stringify('https://site.test/dub/lop-phu.js'));
const flush=()=>new Promise(resolve=>setImmediate(resolve));

function fixture(t,{initStall=false,executeStall=true,cancelStall=false,finishStall=false,metadataStall=false,software=true,firstTimestamp=0}={}){
 t.mock.timers.enable({apis:['setTimeout','setInterval','Date']});
 const state={inputs:0,disposed:0,cancels:0,aborted:0,finishes:0,draws:[],painted:[],closed:0,locks:0,releases:0,logs:[],progress:[],writes:[],outputs:[]};
 const controller=new AbortController();let resolveExecute,resolveInit;
 const track={displayWidth:2160,displayHeight:3150,computeDuration:async()=>.1,computePacketStats:async()=>({averagePacketRate:30}),getFirstTimestamp:async()=>firstTimestamp,getDecoderConfig:async()=>({codec:'hvc1.1.6.L120.90'})};
 const frame=()=>({timestamp:0,drawWithFit(){},close(){state.closed++}});
 const storage={canUseDisk:async()=>true,mediaSource(){return {}},async outputFile(){return {async write(b,p){state.writes.push([b.length,p])},async finish(){state.finishes++;if(finishStall)return new Promise(()=>{});return new File(['rendered'],'image.mp4',{type:'video/mp4'})},async abort(){state.aborted++}}},async release(){state.releases++}};
 const mb={ALL_FORMATS:[],Quality:class{constructor(o){Object.assign(this,o)}},Input:class{constructor(){state.inputs++}async getPrimaryVideoTrack(){if(metadataStall)return new Promise(()=>{});return track}dispose(){state.disposed++}},BlobSource:class{},Mp4OutputFormat:class{},StreamTarget:class{constructor(stream){this.stream=stream}},Output:class{constructor(o){this.target=o.target;state.outputs.push(this)}addVideoTrack(){}async start(){}async finalize(){}async cancel(){}},
  getFirstEncodableVideoCodec:async(_codecs,o)=>o.hardwareAcceleration==='prefer-software'&&!software?null:'avc',
  Conversion:{async init(o){
   const conv={isValid:true,async execute(){o.video.process(frame());conv.onProgress(.25);if(executeStall)return new Promise(r=>{resolveExecute=r})},async cancel(){state.cancels++;if(cancelStall)return new Promise(()=>{})}};
   state.conversion=conv;
   if(initStall)return new Promise(r=>{resolveInit=()=>r(conv)});
   return conv;
  }},
  VideoSampleSink:class{constructor(_track,o){state.decoder=o}async *samplesAtTimestamps(times){state.sampleTimes=times;for(const _t of times)yield frame()}},
  VideoSample:class{constructor(_canvas,o){this.timestamp=o.timestamp;this.duration=o.duration;state.painted.push(o)}close(){state.closed++}},
  VideoSampleSource:class{constructor(o){state.encoder=o}async add(sample){const writer=state.outputs.at(-1).target.stream.getWriter();try{await writer.write({data:new Uint8Array([1]),position:Math.round(sample.timestamp*30)})}finally{writer.releaseLock()}}close(){}},
 };
 const document={fonts:{load:async()=>{}},addEventListener(){},removeEventListener(){}};
 const globals={PHAVideoDownload:storage,document,navigator:{wakeLock:{request:async()=>{state.locks++;return {release:async()=>{state.releases++}}}}},VideoDecoder:{isConfigSupported:async()=>({supported:software})}};
 const render=new Function('runSignal','VideoEncoder','OffscreenCanvas','document','loadMB','globalThis',source+'\nreturn xuatHinh;')(()=>controller.signal,class{},class{getContext(){return {}}},document,async()=>mb,globals);
 const pending=render(new File(['input'],'input.mp4'),(_c,_w,_h,time)=>state.draws.push(time),p=>state.progress.push(p),controller.signal,m=>state.logs.push(m));
 // Attach a rejection handler immediately while fake time is being advanced.
 pending.catch(()=>{});
 return {state,pending,controller,resolveExecute:()=>resolveExecute?.(),resolveInit:()=>resolveInit?.()};
}

test('A conversion stuck at 25 percent retries sequentially, preserves overlay timing, and cleans partial output',async t=>{
 const f=fixture(t);await flush();assert.equal(f.state.progress.at(-1),.25);
 t.mock.timers.tick(45001);await flush();const result=await f.pending;
 assert.equal(result.blob.size,8);assert.equal(result.W,1080);assert.equal(result.H,1574);
 assert.equal(f.state.cancels,1);assert.equal(f.state.aborted,1);assert.equal(f.state.disposed,2);
 assert.equal(f.state.encoder.hardwareAcceleration,'prefer-software');assert.equal(f.state.decoder.hardwareAcceleration,'prefer-software');
 assert.deepEqual(f.state.draws.slice(-3),[0,1/30,2/30]);assert.deepEqual(f.state.painted.map(x=>x.timestamp),[0,1/30,2/30]);
 assert.equal(f.state.closed,6);assert.equal(f.state.progress.at(-1),1);assert.equal(f.state.locks,1);assert.equal(f.state.releases,1);
 assert.ok(f.state.logs.some(x=>x.includes('chế độ tương thích')));assert.equal(f.state.writes.length,3);
});

test('A stalled conversion cannot hang cleanup; fallback starts even if cancel never resolves',async t=>{
 const f=fixture(t,{cancelStall:true});await flush();t.mock.timers.tick(45001);await flush();
 assert.equal(f.state.cancels,1);assert.equal(f.state.inputs,1);
 t.mock.timers.tick(3001);await flush();assert.ok((await f.pending).blob);assert.equal(f.state.inputs,2);assert.equal(f.state.aborted,1);
});

test('Stop during a hung encoder initialization rejects promptly and disposes a late conversion without retrying',async t=>{
 const f=fixture(t,{initStall:true});await flush();f.controller.abort();await flush();
 await assert.rejects(f.pending,{name:'AbortError'});assert.equal(f.state.inputs,1);assert.equal(f.state.aborted,1);
 f.resolveInit();await flush();assert.equal(f.state.cancels,1);assert.equal(f.state.disposed,1);assert.equal(f.state.releases,1);
});

test('Repeated identical progress is not activity and does not keep a stuck encoder alive',async t=>{
 const f=fixture(t);await flush();
 for(let i=0;i<8;i++){t.mock.timers.tick(5000);f.state.conversion.onProgress(.25);await flush()}
 t.mock.timers.tick(5001);await flush();assert.ok((await f.pending).blob);assert.equal(f.state.inputs,2);
});

test('A long conversion with advancing progress is not timed out and never enters fallback',async t=>{
 const f=fixture(t);await flush();
 for(const progress of [.3,.4,.5,.6,.7,.8,.9]){t.mock.timers.tick(20000);f.state.conversion.onProgress(progress);await flush()}
 f.resolveExecute();await flush();assert.ok((await f.pending).blob);assert.equal(f.state.inputs,1);assert.equal(f.state.aborted,0);
});

test('Metadata that never resolves fails with its exact stage instead of waiting forever',async t=>{
 const f=fixture(t,{metadataStall:true});await flush();t.mock.timers.tick(30001);await flush();t.mock.timers.tick(30001);await flush();
 await assert.rejects(f.pending,e=>e.name==='TimeoutError'&&e.message.includes('đọc thông tin hình'));assert.equal(f.state.disposed,2);assert.equal(f.state.finishes,0);
});

test('Finishing a disk file cannot hang either rendering path, and partial outputs are aborted',async t=>{
 const f=fixture(t,{executeStall:false,finishStall:true});await flush();t.mock.timers.tick(30001);await flush();t.mock.timers.tick(30001);await flush();
 await assert.rejects(f.pending,e=>e.name==='TimeoutError'&&e.message.includes('hoàn tất file hình'));assert.equal(f.state.aborted,2);assert.equal(f.state.disposed,2);
});

test('Compatibility rendering uses the supported encoder when software acceleration is unavailable',async t=>{
 const f=fixture(t,{software:false});await flush();t.mock.timers.tick(45001);await flush();assert.ok((await f.pending).blob);
 assert.equal(f.state.encoder.hardwareAcceleration,'no-preference');assert.equal(f.state.decoder.hardwareAcceleration,undefined);
});


test('A delayed first frame is held without moving caption timestamps or dropping the beginning',async t=>{
 const f=fixture(t,{firstTimestamp:.04});await flush();t.mock.timers.tick(45001);await flush();assert.ok((await f.pending).blob);
 assert.deepEqual(f.state.sampleTimes,[.04,.04,2/30]);assert.deepEqual(f.state.painted.map(x=>x.timestamp),[0,1/30,2/30]);
});
