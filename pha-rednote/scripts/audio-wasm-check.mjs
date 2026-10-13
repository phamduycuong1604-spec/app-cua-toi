import createFFmpegCore from '@ffmpeg/core';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {audioDemuxPlan,audioDecodePlan,readWav} from '../web/dub-core.js';
// Real browser WASM codecs + WORKERFS. FileReaderSync is supplied in Node;
// this does not test Safari/iPhone, or reproduce the user's unavailable file.
const path=process.argv[2];if(!path)throw Error('Usage: node scripts/audio-wasm-check.mjs <18-second 2160x3840 AAC MP4 fixture>');
const prefix=await readFile(path),padding=96*1024*1024,free=Buffer.alloc(8);free.writeUInt32BE(padding);free.write('free',4);const header=Buffer.concat([prefix,free]);let bytesRead=0,maxRead=0;
// A valid large trailing free box exercises seeking without allocating 96 MB.
const source={size:prefix.length+padding,slice(start,end){end=Math.min(end,this.size);const bytes=Buffer.alloc(Math.max(0,end-start));if(start<header.length)header.copy(bytes,0,start,Math.min(end,header.length));return {size:bytes.length,bytes};}};
globalThis.FileReaderSync=class{readAsArrayBuffer(blob){bytesRead+=blob.size;maxRead=Math.max(maxRead,blob.size);return blob.bytes.buffer.slice(blob.bytes.byteOffset,blob.bytes.byteOffset+blob.size);}};
globalThis.self=globalThis;globalThis.location={href:new URL('../node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js',import.meta.url).href};
const f=await createFFmpegCore({wasmBinary:await readFile(new URL('../node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm',import.meta.url))});let logs=[];f.setLogger(({message})=>logs.push(message));
function run(args){logs=[];const code=f.exec('-y',...args);f.reset();return code;}
function pass(args){assert.equal(run(args),0,args.join(' ')+'\n'+logs.slice(-28).join('\n'));}
f.FS.mkdir('/video');f.FS.mount(f.FS.filesystems.WORKERFS,{blobs:[{name:'source',data:source}]},'/video');
pass(audioDemuxPlan('/video/source'));assert.ok(logs.some(s=>s.includes('2160x3840')));
const stem=f.FS.readFile('audio-source.m4a');assert.ok(stem.length<1e6);f.FS.unmount('/video');f.FS.rmdir('/video');
pass(audioDecodePlan('audio-source.m4a'));const audio=readWav(f.FS.readFile('speech.wav'));
assert.equal(audio.rate,16000);assert.ok(audio.duration>=18&&audio.duration<18.1);assert.ok(audio.samples.some(s=>Math.abs(s)>.02));
pass(audioDecodePlan('audio-source.m4a',true));
logs=[];f.ffprobe('-v','error','-show_entries','stream=codec_name,sample_rate,channels','-of','json','music-input.m4a');f.reset();const probe=JSON.parse(logs.join('\n'));
assert.deepEqual(probe.streams.map(s=>[s.codec_name,s.sample_rate,s.channels]),[['aac','44100',2]]);
assert.ok(bytesRead<8*1024*1024);assert.ok(maxRead<=1024*1024);assert.ok(f.HEAPU8.length<128*1024*1024);
// PCM cannot be copied into M4A. The universal audio-only fallback must work.
pass(['-f','lavfi','-i','sine=frequency=600:duration=2','-c:a','pcm_s16le','pcm.wav']);
assert.notEqual(run(audioDemuxPlan('pcm.wav')),0);pass(audioDemuxPlan('pcm.wav','audio-source.mka'));pass(audioDecodePlan('audio-source.mka'));assert.ok(readWav(f.FS.readFile('speech.wav')).duration>=2);
console.log(JSON.stringify({passed:true,portrait:'2160x3840',seconds:audio.duration,virtualVideoBytes:source.size,trackBytes:stem.length,bytesRead,maxRead,wasmHeapBytes:f.HEAPU8.length,checks:['WORKERFS bounded reads','AAC stream copy','16kHz mono speech','44.1kHz stereo music','Matroska PCM fallback']},null,2));

