import createFFmpegCore from '@ffmpeg/core';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {DEFAULTS,readWav,subtitleAss,visualPlan,mixFilter} from '../web/dub-core.js';
// Execute the exact browser WASM core without a browser. This is codec/filter QA,
// not a claim of testing Safari, user credentials, or iPhone memory limits.
globalThis.self=globalThis;globalThis.location={href:new URL('../node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js',import.meta.url).href};
const f=await createFFmpegCore({wasmBinary:await readFile(new URL('../node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm',import.meta.url))});
let logs=[];f.setLogger(({message})=>logs.push(message));
function exec(...args){logs=[];const code=f.exec(...args);f.reset();assert.equal(code,0,args.join(' ')+'\n'+logs.slice(-8).join('\n'));}
exec('-f','lavfi','-i','color=c=white:s=320x180:r=15:d=2','-f','lavfi','-i','sine=frequency=440:duration=2','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-shortest','-f','mp4','render-input');
exec('-i','render-input','-vn','-map','0:a:0','-ac','1','-ar','16000','-c:a','pcm_s16le','speech.wav');
const audio=readWav(f.FS.readFile('speech.wav'));assert.equal(audio.rate,16000);assert.ok(audio.duration>=2&&audio.duration<2.1);
f.FS.mkdir('fonts');f.FS.writeFile('fonts/NotoSans.ttf',await readFile(new URL('../worker/vendor/NotoSans-Regular.ttf',import.meta.url)));
f.FS.writeFile('subtitle.ass',new TextEncoder().encode(subtitleAss([{start:0,end:2,vi:'Ánh sáng mềm · giữ màu da tự nhiên'}],320,180,DEFAULTS)));
exec('-f','lavfi','-i','color=c=green:s=64x32','-frames:v','1','logo.png');
exec(...visualPlan(320,180,DEFAULTS,.5));
exec(...visualPlan(320,180,{...DEFAULTS,subtitles:false,maskH:1,logo:false}));
exec(...visualPlan(320,180,DEFAULTS,.5));
assert.ok(logs.some(l=>l.includes('Noto Sans')||l.includes('NotoSans')));assert.ok(!logs.some(l=>l.includes('Glyph')&&l.includes('not found')));
exec('-i','speech.wav','-af','atempo=1.6','-ac','1','-ar','24000','voice.wav');
assert.ok(readWav(f.FS.readFile('voice.wav')).duration<1.4);
for(const music of [false,true]){exec('-i','rendered.mp4','-i','voice.wav','-i','render-input','-filter_complex',mixFilter(music,.35),'-map','0:v:0','-map','[mixed]','-c:v','copy','-c:a','aac','-b:a','160k','-t','2','-movflags','+faststart',music?'output-separated.mp4':'output-duck.mp4');const bytes=f.FS.readFile(music?'output-separated.mp4':'output-duck.mp4');assert.equal(String.fromCharCode(...bytes.subarray(4,8)),'ftyp');assert.ok(bytes.length>1000);}
logs=[];f.ffprobe('-v','error','-show_entries','stream=codec_name,codec_type,width,height','-of','json','output-duck.mp4');const probe=JSON.parse(logs.join('\n'));assert.ok(probe.streams.some(s=>s.codec_name==='h264'&&s.width===320&&s.height===180));assert.ok(probe.streams.some(s=>s.codec_name==='aac'));
await writeFile('/tmp/PHA-video-wasm-check.mp4',f.FS.readFile('output-duck.mp4'));
console.log('Actual WASM checks passed: mono 16 kHz; Vietnamese ASS; blur + logo (including minimum-height mask); atempo; duck/separated mix; H.264 + AAC MP4.');
