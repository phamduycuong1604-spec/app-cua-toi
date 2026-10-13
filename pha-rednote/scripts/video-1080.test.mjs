import test from 'node:test';
import assert from 'node:assert/strict';
import {normalise,fit1080} from '../web/video-1080.js';
function setup({w=2160,h=3840,dropAudio=false,wrongSize=false,wrongDuration=false,invalid=false,encodingFails=false,signal,onExecute}={}){
 const source=new File(['source'],'source.mp4'),result=new File(['result'],'source-1080p.mp4'),track={displayWidth:w,displayHeight:h,canDecode:async()=>true},audio={};let initOptions,outputOptions,disposed=0,aborted=0,cancelled=0,closed=0;
 const mb={ALL_FORMATS:[],QUALITY_HIGH:'high',BlobSource:class{constructor(file){this.file=file}},Input:class{constructor({source:s}){this.output=s.file===result}async getPrimaryVideoTrack(){return this.output?{displayWidth:wrongSize?2160:fit1080(w,h).width,displayHeight:fit1080(w,h).height}:track}async getAudioTracks(){return [audio]}async computeDuration(){return this.output&&wrongDuration?9:18}dispose(){disposed++}},getFirstEncodableVideoCodec:async()=> 'avc',Mp4OutputFormat:class{constructor(options){outputOptions=options}},StreamTarget:class{constructor(stream,options){this.stream=stream;this.options=options}},Output:class{constructor(options){Object.assign(this,options)}},Conversion:{async init(options){initOptions=options;return {isValid:!invalid,discardedTracks:dropAudio?[{track:audio}]:[],async execute(){onExecute?.();if(encodingFails)throw Error('encode failed');const writer=options.output.target.stream.getWriter();try{await writer.write({data:new Uint8Array([1,2,3]),position:0})}finally{writer.releaseLock()}this.onProgress?.(.5)},async cancel(){cancelled++}}}}};
 const writes=[],storage={async outputFile(name){assert.equal(name,result.name);return {async write(bytes,at){writes.push([bytes.length,at])},async finish(){closed++;return result},async abort(){aborted++}}},async release(){aborted++}};
 return {source,result,options:{loadMedia:async()=>mb,storage,signal},writes,get init(){return initOptions},get output(){return outputOptions},get disposed(){return disposed},get aborted(){return aborted},get cancelled(){return cancelled},get closed(){return closed}};
}
globalThis.VideoEncoder=class{};globalThis.VideoDecoder=class{};
test('1080 geometry preserves portrait, landscape, square and wide aspect ratios without enlarging smaller sources',()=>{
 for(const [w,h,W,H] of [[2160,3840,1080,1920],[3840,2160,1920,1080],[2160,2160,1080,1080],[4000,1000,1920,480],[720,1280,720,1280],[1920,1080,1920,1080]]){const size=fit1080(w,h);assert.equal(size.width,W);assert.equal(size.height,H);assert.equal(size.resize,w>W||h>H)}assert.throws(()=>fit1080(0,1920),/độ phân giải/);
});
test('Original below the cap is returned byte-for-byte without opening an encoder/output file',async()=>{
 const f=setup({w:720,h:1280});const result=await normalise(f.source,f.options);assert.equal(result.file,f.source);assert.equal(result.converted,false);assert.equal(f.init,undefined);assert.equal(f.disposed,1);
});
test('4K conversion writes MP4 to disk, keeps audio, uses AVC and requests no crop, subtitles or watermark',async()=>{
 const f=setup(),result=await normalise(f.source,f.options);assert.equal(result.file,f.result);assert.equal(result.converted,true);assert.equal(result.width,1080);assert.equal(result.height,1920);
 assert.deepEqual(f.init.audio,{});assert.equal(f.init.video.codec,'avc');assert.equal(f.init.video.fit,'contain');assert.equal(f.init.video.forceTranscode,true);assert.equal(f.init.video.allowTransformationMetadata,false);assert.equal(f.init.video.crop,undefined);assert.equal(f.init.video.process,undefined);assert.equal(f.output.fastStart,false);assert.deepEqual(f.writes,[[3,0]]);assert.equal(f.closed,1);assert.equal(f.aborted,0);assert.equal(f.disposed,2);
});
test('Missing audio, invalid conversion and encoding failures never return a file falsely labelled 1080p',async()=>{
 for(const options of [{dropAudio:true},{invalid:true},{encodingFails:true}]){const f=setup(options);await assert.rejects(normalise(f.source,f.options));assert.equal(f.aborted,1);assert.equal(f.disposed,1);assert.ok(f.cancelled>=1)}
});
test('Wrong output resolution or truncated duration removes the output file and reports failure',async()=>{
 for(const options of [{wrongSize:true},{wrongDuration:true}]){const f=setup(options);await assert.rejects(normalise(f.source,f.options),/sai độ phân giải|thời lượng/);assert.ok(f.aborted>=1);assert.equal(f.disposed,2)}
});
test('Cancellation during encoding drains conversion and clears partial output',async()=>{
 const controller=new AbortController(),f=setup({signal:controller.signal,onExecute:()=>controller.abort()});await assert.rejects(normalise(f.source,f.options),e=>e.name==='AbortError');assert.equal(f.aborted,1);assert.ok(f.cancelled>=1);
});
