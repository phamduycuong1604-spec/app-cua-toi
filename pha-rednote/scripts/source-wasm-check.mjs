import createFFmpegCore from '@ffmpeg/core';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {harness} from './source-harness.mjs';
// Execute actual supplied-source extraction/mux functions against the real
// FFmpeg WASM core. WORKERFS shim provides bounded reads of a virtual 96 MB file.
const path=process.argv[2];if(!path)throw Error('Supply the 18s 2160x3840 AAC fixture.');
const fixture=await readFile(path),padding=96*1048576,free=Buffer.alloc(8);free.writeUInt32BE(padding);free.write('free',4);const header=Buffer.concat([fixture,free]);let bytesRead=0,maxRead=0;
const source={size:fixture.length+padding,slice(start,end){end=Math.min(end,this.size);const bytes=Buffer.alloc(Math.max(0,end-start));if(start<header.length)header.copy(bytes,0,start,Math.min(end,header.length));return {size:bytes.length,bytes};}};
globalThis.FileReaderSync=class{readAsArrayBuffer(b){bytesRead+=b.size;maxRead=Math.max(maxRead,b.size);return b.bytes.buffer.slice(b.bytes.byteOffset,b.bytes.byteOffset+b.size);}};
globalThis.self=globalThis;globalThis.location={href:new URL('../node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js',import.meta.url).href};
const f=await createFFmpegCore({wasmBinary:await readFile(new URL('../node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm',import.meta.url))});let log=[];f.setLogger(({message})=>log.push(message));
f.FS.mkdir('/vao');f.FS.mount(f.FS.filesystems.WORKERFS,{blobs:[{name:'猫猫我啊也有了自己的写真.mp4',data:source}]},'/vao');
const h=harness(),commands=[];
h.context.execute=async args=>{commands.push([...args]);log=[];const ma=f.exec(...args);f.reset();return {ma,log:log.join('\n')};};
h.context.processor={readFile:async n=>f.FS.readFile(n),deleteFile:async n=>f.FS.unlink(n),writeFile:async(n,bytes)=>f.FS.writeFile(n,bytes)};
h.eval("ff=processor;lenh=execute;duongDanVideo={duong:'/vao/猫猫我啊也有了自己的写真.mp4'};thoiLuong=18;caiDat.amGoc=0;");
const pcm=await h.eval('tachTieng()');assert.ok(pcm.length>=18*16000&&pcm.length<18.1*16000);assert.ok(pcm.some(v=>Math.abs(v)>700));
h.context.pcm=pcm;h.context.wav=h.eval('taoWav(pcm,16000)');
const result=await h.eval("xuatVideo(wav,{duong:'/vao/猫猫我啊也有了自己的写真.mp4',coTieng:true,hevc:false},null,null,false)");
f.FS.writeFile('/verify.mp4',new Uint8Array(await result.arrayBuffer()));log=[];f.ffprobe('-v','error','-show_entries','stream=codec_name,sample_rate,channels,width,height:format=duration','-of','json','/verify.mp4');f.reset();const probe=JSON.parse(log.join('\n'));
assert.deepEqual(probe.streams.filter(s=>s.width).map(s=>[s.width,s.height]),[[2160,3840]]);assert.equal(probe.streams.find(s=>s.sample_rate).codec_name,'aac');assert.ok(Number(probe.format.duration)>=18);assert.ok(commands[1].includes('copy'));assert.ok(commands[1].includes('+faststart'));assert.ok(maxRead<=1024*1024);assert.ok(bytesRead<8*1048576);assert.ok(f.HEAPU8.length<128*1048576);
console.log(JSON.stringify({passed:true,sourcePipeline:true,portrait:'2160x3840',speechSamples:pcm.length,exportBytes:result.size,duration:probe.format.duration,virtualInputBytes:source.size,bytesRead,maxRead,wasmHeapBytes:f.HEAPU8.length},null,2));
