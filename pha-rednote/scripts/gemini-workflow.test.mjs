import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './phaha-harness.mjs';
function audio(){const pcm=new Int16Array(2400);for(let i=0;i<pcm.length;i++)pcm[i]=Math.sin(i*.12)*10000;return{candidates:[{content:{parts:[{inlineData:{data:Buffer.from(pcm.buffer).toString('base64'),mimeType:'audio/L16;rate=24000'}}]}}]}}
function setup(nativeFetch){const h=harness({nativeFetch:async(u,i)=>u==='/ai/capabilities'?Response.json({edge:true}):nativeFetch(u,i)});h.eval(`caiDat.khoa='test-main';caiDat.khoaDoc='test-voice';caiDat.mhDoc='test-tts';for(const dv of THU_TU)caiDat.bat[dv]=dv==='gemini'||dv==='edge';caiDat.dv.edge.giong='vi-VN-HoaiMyNeural';S.thoiLuong=30;S.cacCau=[{start:0,end:1,vi:'Câu thứ nhất'},{start:10,end:11,vi:'Câu thứ hai'},{start:20,end:21,vi:'Câu thứ ba'}];S.baoChonGiong=()=>{};`);return h}
function diskCache(){const rows=new Map();let created=false;return{rows,open(){const req={};queueMicrotask(()=>{const db={createObjectStore(){created=true},close(){},transaction(){const tx={abort(){tx.onabort?.()},objectStore(){return{put(value){return request(()=>{rows.set(value.id,structuredClone(value));return value.id})},get(id){return request(()=>structuredClone(rows.get(id)))}}}};function request(work){const r={};queueMicrotask(()=>{r.result=work();r.onsuccess?.();tx.oncomplete?.()});return r}return tx}};req.result=db;if(!created)req.onupgradeneeded?.();req.onsuccess?.()});return req}}}
test('Grouping joins gaps below 1.2s, caps a normal packet at 40s and preserves original timestamps',()=>{
 const h=setup(()=>Response.json(audio()));h.context.rows=[{start:0,end:10,vi:'Một'},{start:11.1,end:25,vi:'Hai'},{start:26,end:40,vi:'Ba'},{start:41,end:50,vi:'Bốn'},{start:52,end:60,vi:'Năm'}];
 const r=h.eval("chiaNhom(rows,'gemini')");assert.deepEqual(Array.from(r,c=>[c.start,c.end]),[[0,40],[41,50],[52,60]]);assert.equal(r[0].vi,'Một Hai Ba');
});
test('After every Gemini pair reaches daily quota, fallback reads only missing packets; rerun uses all saved audio',async()=>{
 let requests=0;const h=setup(()=>++requests===1?Response.json(audio()):Response.json({error:{message:'per day'}},{status:429})),edge=[];
 h.module('giong-doc.js').DICH_VU.edge.doc=async text=>{edge.push(text);return{pcm:new Int16Array([10000,-10000,10000,-10000]),tanSo:24000}};
 const wav=await h.eval('longTieng()');assert.ok(wav.length>44);assert.deepEqual(edge,['Câu thứ hai','Câu thứ ba']);const count=requests;
 await h.eval('batDauLanMoiGemini();longTieng()');assert.equal(requests,count);assert.equal(edge.length,2);assert.match(h.get('o-nhat-ky').textContent,/tái dùng 3 gói/);
});
test('A changed model does not invalidate an existing successful audio packet',async()=>{
 let requests=0;const h=setup(()=>{requests++;return Response.json(audio())});const a=await h.eval("docCau('Xin chào','gemini')");h.eval("chotMoHinhDoc('another-tts')");const b=await h.eval("docCau('Xin chào','gemini')");assert.equal(a,b);assert.equal(requests,1);
});
test('A browser reload restores trimmed audio and model from IndexedDB without an API call',async()=>{
 const disk=diskCache();let requests=0;
 const h=setup(()=>{requests++;return Response.json(audio())});h.context.indexedDB=disk;
 const first=await h.eval("docCau('Giọng đã lưu','gemini')");assert.equal(requests,1);assert.equal(disk.rows.size,1);
 const next=setup(()=>{requests++;throw Error('API must not be called')});next.context.indexedDB=disk;
 const restored=await next.eval("docCau('Giọng đã lưu','gemini')");assert.deepEqual([...restored],[...first]);assert.equal(requests,1);assert.equal(next.eval('moHinhDocDaChot()'),'test-tts');
});
test('Denied IndexedDB falls back to memory; changing voice or text invalidates the packet',async()=>{
 let requests=0;const h=setup(()=>{requests++;return Response.json(audio())});h.context.indexedDB={open(){throw new DOMException('denied','SecurityError')}};
 await h.eval("docCau('Một câu','gemini');");await h.eval("docCau('Một câu','gemini');");assert.equal(requests,1);
 await h.eval("caiDat.giong='Puck';docCau('Một câu','gemini');");assert.equal(requests,2);await h.eval("docCau('Một câu mới','gemini')");assert.equal(requests,3);
});
test('Rerun after failed output sends only the missing packets even after a full browser reload',async()=>{
 const disk=diskCache();let requests=0;
 const first=setup(()=>++requests===1?Response.json(audio()):Response.json({error:{message:'per day'}},{status:429}));first.context.indexedDB=disk;
 first.module('giong-doc.js').DICH_VU.edge.doc=async()=>{throw Error('Edge unavailable')};first.module('giong-doc.js').DICH_VU.may.doc=async()=>{throw Error('Local voice unavailable')};
 // Keep the local worker out of this test; its provider is intentionally unavailable.
 first.module('giong-doc.js').nhuongBoNhoChoGiongMay=async()=>{};
 await assert.rejects(first.eval('longTieng()'));assert.ok(disk.rows.size>=1);
 let additional=0;const next=setup(()=>{additional++;return Response.json(audio())});next.context.indexedDB=disk;
 await next.eval('longTieng()');assert.equal(additional,2);assert.match(next.get('o-nhat-ky').textContent,/tái dùng 1 gói/);
});
test('Speech placement retains normal 1.6x and delayed 1.9x caps',()=>{
 const h=setup(()=>Response.json(audio())),ratios=[];h.module('am-thanh.js').coGian=(samples,ratio)=>{ratios.push(ratio);return samples.subarray(0,Math.ceil(samples.length/ratio))};
 h.eval('S.thoiLuong=4');h.context.rows=[{start:0,end:1},{start:1,end:2}];h.context.samples=[new Float32Array(24000*8).fill(.2),new Float32Array(24000*8).fill(.2)];
 const output=h.eval('xepGiongVaoVideo(rows,samples)');assert.equal(ratios[0],1.6);assert.equal(ratios[1],1.9);assert.ok(output[24000*2]>.1);
});

test('An unusually long subtitle is split into bounded speech packets without dropping text',()=>{
 const h=setup(()=>Response.json(audio()));h.context.rows=[{start:5,end:95,vi:'Một hai ba bốn năm sáu bảy tám chín mười mười một'}];
 const rows=h.eval("chiaNhom(rows,'gemini')");assert.equal(rows.length,3);assert.ok(rows.every(c=>c.end-c.start<=40));assert.equal(rows[0].start,5);assert.equal(rows.at(-1).end,95);assert.equal(rows.map(c=>c.vi).join(' '),h.context.rows[0].vi);
});
