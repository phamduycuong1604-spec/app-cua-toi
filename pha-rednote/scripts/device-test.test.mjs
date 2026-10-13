import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {bounded,pcmInfo,isMp4,parseProbe} from '../web/device-test-core.js';

test('PCM reads little-endian samples from a sliced buffer',()=>{
  const raw=new Uint8Array(3208),part=raw.subarray(4,3204),v=new DataView(part.buffer,part.byteOffset,part.byteLength);v.setInt16(0,-32768,true);v.setInt16(2,500,true);
  assert.deepEqual(pcmInfo(part),{samples:1600,seconds:.1,peak:32768});
});
test('Empty, truncated and odd-byte audio cannot pass extraction',()=>{
  for(const data of [new Uint8Array(0),new Uint8Array(1600),new Uint8Array(3201),null])assert.throws(()=>pcmInfo(data));
  assert.equal(pcmInfo(new Uint8Array(3200)).peak,0);
});
test('An HTML response is not a successful MP4 output',()=>{
  assert.equal(isMp4(new TextEncoder().encode('<html>login</html>')),false);
  assert.equal(isMp4(new TextEncoder().encode('0000ftypisom')),true);
  assert.equal(isMp4(new Uint8Array(0)),false);
});
test('Core ffprobe -1 requires real metadata; malformed and timed-out probes cannot pass',()=>{
  const report={streams:[{codec_name:'aac'}],format:{duration:'2.0'}};
  assert.deepEqual(parseProbe(-1,JSON.stringify(report)),report);
  assert.throws(()=>parseProbe(-1,'Conversion failed!'));
  assert.throws(()=>parseProbe(-1,'{"streams":[],"format":{"duration":"2"}}'));
  assert.throws(()=>parseProbe(1,JSON.stringify(report)));
});
test('A cancelled operation cannot be recorded as a pass',async()=>{
  const c=new AbortController();const pending=bounded(()=>{c.abort();return 'pass';},c.signal,1000);
  await assert.rejects(pending,{name:'AbortError'});
});
test('A hung operation expires, invokes cleanup once, and cannot pass',async()=>{
  const c=new AbortController();let cleanups=0;
  await assert.rejects(bounded(()=>new Promise(()=>{}),c.signal,5,()=>cleanups++),/Quá thời gian/);
  assert.equal(cleanups,1);
});
test('A successful step removes its timeout and pre-aborted steps never execute',async()=>{
  const c=new AbortController();let ran=false,cleanups=0;
  assert.equal(await bounded(()=>42,c.signal,5,()=>cleanups++),42);
  await new Promise(resolve=>setTimeout(resolve,15));assert.equal(cleanups,0);
  c.abort();await assert.rejects(bounded(()=>{ran=true;},c.signal,5),{name:'AbortError'});assert.equal(ran,false);
});
test('Cancelled overlay font load cannot inherit the next run or start rendering',async()=>{
  const text=await readFile(new URL('../web/lop-phu.js',import.meta.url),'utf8');
  let active=new AbortController(),finish,imports=0;
  const source=text.replace(/^import .*\n/,'').replaceAll('export function ','function ').replaceAll('export async function ','async function ').replace('await import(MB)','await loadMB()');
  const render=new Function('runSignal','VideoEncoder','OffscreenCanvas','document','loadMB',source+'\nreturn xuatHinh;')(()=>active.signal,class{},class{},{fonts:{load:()=>new Promise(r=>finish=r)}},()=>{imports++;return {};});
  const pending=render(new Blob(),()=>{},()=>{});active.abort();active=new AbortController();finish();
  await assert.rejects(pending,{name:'AbortError'});assert.equal(imports,0);
});

test('Actual overlay renderer reduces 4K to 1080p in the same pass that draws captions, preserving portrait and landscape aspect',async()=>{
 const text=await readFile(new URL('../web/lop-phu.js',import.meta.url),'utf8');
 const source=text.replace(/^import .*\n/,'').replaceAll('export function ','function ').replaceAll('export async function ','async function ').replace('await import(MB)','await loadMB()');
 for(const [width,height,W,H] of [[3840,2160,1920,1080],[2160,3840,1080,1920],[1280,720,1280,720]]){
  let config,draws=0,disposed=false;
  const mb={Input:class{async getPrimaryVideoTrack(){return {displayWidth:width,displayHeight:height}}dispose(){disposed=true}},BlobSource:class{},Output:class{constructor(o){this.target=o.target}},Mp4OutputFormat:class{},BufferTarget:class{constructor(){this.buffer=new Uint8Array([1]).buffer}},ALL_FORMATS:[],QUALITY_HIGH:1,getFirstEncodableVideoCodec:async(_codecs,size)=>{assert.equal(size.width,W);assert.equal(size.height,H);return 'avc'},Conversion:{async init(o){config=o;return {isValid:true,async execute(){o.video.process({timestamp:0,drawWithFit(){draws++}})}}}}};
  class Canvas{constructor(w,h){assert.equal(w,W);assert.equal(h,H)}getContext(){return {}}}
  const render=new Function('runSignal','VideoEncoder','OffscreenCanvas','document','loadMB',source+'\nreturn xuatHinh;')(()=>null,class{},Canvas,{fonts:{load:async()=>{}}},async()=>mb);
  let overlays=0;const r=await render(new File(['x'],'4k.mp4'),(_ctx,w,h)=>{assert.equal(w,W);assert.equal(h,H);overlays++},()=>{});
  assert.equal(r.W,W);assert.equal(r.H,H);assert.equal(draws,1);assert.equal(overlays,1);assert.equal(config.audio.discard,true);assert.equal(config.video.forceTranscode,true);assert.equal(disposed,true);
 }
});

test('Overlay MP4 uses seeked disk writes and the bounded source, and deletes partial output after an encoder failure',async()=>{
 const text=await readFile(new URL('../web/lop-phu.js',import.meta.url),'utf8');
 const source=text.replace(/^import .*\n/,'').replaceAll('export function ','function ').replaceAll('export async function ','async function ').replace('await import(MB)','await loadMB()');
 const previous=globalThis.PHAVideoDownload;
 try{for(const fail of [false,true]){
  const file=new File(['input'],'4k.mp4'),result=new File(['result'],'image.mp4'),writes=[];let aborted=0,finished=0,disposed=0,custom=0,options;
  const storage={canUseDisk:async()=>true,mediaSource(_mb,f){assert.equal(f,file);custom++;return {disk:true}},outputFile:async()=>({write:async(bytes,at)=>{writes.push([bytes.length,at])},finish:async()=>{finished++;return result},abort:async()=>{aborted++}})};
  globalThis.PHAVideoDownload=storage;
  const mb={ALL_FORMATS:[],QUALITY_HIGH:1,Input:class{constructor({source}){assert.equal(source.disk,true)}async getPrimaryVideoTrack(){return {displayWidth:3840,displayHeight:2160}}dispose(){disposed++}},BlobSource:class{constructor(){assert.fail('Use disk source')}},BufferTarget:class{constructor(){assert.fail('Never buffer the whole rendered video')}},Mp4OutputFormat:class{constructor(o){assert.equal(o.fastStart,false)}},StreamTarget:class{constructor(stream,o){this.stream=stream;assert.equal(o.chunked,true);assert.equal(o.chunkSize,1048576)}},Output:class{constructor(o){this.target=o.target}},getFirstEncodableVideoCodec:async()=> 'avc',Conversion:{async init(o){options=o;return {isValid:true,async execute(){const writer=o.output.target.stream.getWriter();try{await writer.write({data:new Uint8Array([1,2,3]),position:4});await writer.write({data:new Uint8Array([4]),position:0});if(fail)throw new DOMException('encoder failed','UnknownError');o.video.process({timestamp:0,drawWithFit(){}})}finally{writer.releaseLock()}},async cancel(){}}}}};
  const render=new Function('runSignal','VideoEncoder','OffscreenCanvas','document','loadMB',source+'\nreturn xuatHinh;')(()=>null,class{},class{getContext(){return {}}},{fonts:{load:async()=>{}}},async()=>mb);
  const logs=[];if(fail)await assert.rejects(render(file,()=>{},()=>{},null,m=>logs.push(m)),e=>e.name==='UnknownError'&&/dựng các khung hình/.test(e.message));else{const output=await render(file,()=>{},()=>{},null,m=>logs.push(m));assert.equal(output.blob,result);assert.equal(output.W,1920);assert.equal(output.H,1080)}
  assert.equal(custom,1);assert.equal(disposed,1);assert.equal(finished,fail?0:1);assert.equal(aborted,fail?1:0);assert.deepEqual(writes,[[3,4],[1,0]]);assert.equal(options.audio.discard,true);assert.match(logs[0],/ghi từng phần/);
 }}finally{globalThis.PHAVideoDownload=previous}
});
test('A Safari missing-file error identifies the rendering stage rather than reporting an unexplained message',async()=>{
 const text=await readFile(new URL('../web/lop-phu.js',import.meta.url),'utf8'),source=text.replace(/^import .*\n/,'').replaceAll('export function ','function ').replaceAll('export async function ','async function ').replace('await import(MB)','await loadMB()');let disposed=0;
 const mb={ALL_FORMATS:[],BlobSource:class{constructor(_file,options){assert.equal(options.useStreamReader,false)}},Input:class{async getPrimaryVideoTrack(){throw new DOMException('The object can not be found here.','NotFoundError')}dispose(){disposed++}}};
 const render=new Function('runSignal','VideoEncoder','OffscreenCanvas','document','loadMB',source+'\nreturn xuatHinh;')(()=>null,class{},class{},{fonts:{load:async()=>{}}},async()=>mb);
 await assert.rejects(render(new File(['x'],'test.mp4'),()=>{},()=>{}),e=>e.name==='NotFoundError'&&/đọc thông tin hình · NotFoundError/.test(e.message));assert.equal(disposed,1);
});
