import test from 'node:test';
import assert from 'node:assert/strict';
import {boChuThichAmThanh} from '../web/phaha/loi-noi.js';
import {harness} from './phaha-harness.mjs';

for(const text of ['[nhạc mở đầu]','Nhạc mở đầu.','“Nhạc mở đầu”','(nhạc nền)','【Nhạc không lời】','[Nhạc nền sôi động]','[Music]','[background music]','[Applause]','[Tiếng vỗ tay]','（音乐）','[背景音乐]','♪ Nhạc mở đầu ♪'])test('A non-speech caption is not spoken: '+text,()=>assert.equal(boChuThichAmThanh(text),''));
for(const [text,spoken] of [
 ['[nhạc mở đầu] Xin chào các bạn.','Xin chào các bạn.'],
 ['Nhạc mở đầu\nXin chào.','Xin chào.'],
 ['Mở khẩu độ (f/1.8) để xóa phông.','Mở khẩu độ (f/1.8) để xóa phông.'],
 ['Đây là nhạc mở đầu của video.','Đây là nhạc mở đầu của video.'],
 ['Anh ấy nói: “nhạc mở đầu”.','Anh ấy nói: “nhạc mở đầu”.'],
 ['Im lặng!','Im lặng!'],
 ['[Giảm độ sáng] rồi tăng tương phản.','[Giảm độ sáng] rồi tăng tương phản.'],
 ['[音乐] 大家好','大家好'],
])test('Only sound directions are removed from '+text,()=>assert.equal(boChuThichAmThanh(text),spoken));

function audio(){const pcm=new Int16Array(2400).fill(10000);const data=Buffer.from(pcm.buffer).toString('base64');return {steps:[{type:'model_output',content:[{type:'audio',data,mime_type:'audio/L16;rate=24000'}]}],candidates:[{content:{parts:[{inlineData:{data,mimeType:'audio/L16;rate=24000'}}]}}]};}
function setup({interaction=false}={}){
 const sent=[],h=harness({nativeFetch:async(url,init)=>{if(url==='/ai/capabilities')return Response.json({edge:true});sent.push(JSON.parse(init.body));return Response.json(audio())}});
 h.eval(`caiDat.khoa='test-main';caiDat.khoaDoc='test-voice';caiDat.mhDoc=${JSON.stringify(interaction?'gemini-3.8-flash-tts':'test-tts')};for(const dv of THU_TU)caiDat.bat[dv]=dv==='gemini';S.thoiLuong=12;S.baoChonGiong=()=>{};`);
 return {h,sent};
}
for(const interaction of [false,true])test('Music intro remains a silent TTS interval and only narration is sent to Gemini: '+(interaction?'Interactions':'generateContent'),async()=>{
 const {h,sent}=setup({interaction});h.context.rows=[{start:0,end:4.9,zh:'[音乐]',vi:'[nhạc mở đầu]'},{start:5,end:7,zh:'大家好',vi:'Xin chào các bạn.'}];h.eval('S.cacCau=rows');
 const wav=await h.eval('longTieng()');assert.equal(sent.length,1);
 const text=interaction?sent[0].input[0].content[0].text:sent[0].contents[0].parts[0].text;assert.equal(text,'Xin chào các bạn.');assert.doesNotMatch(text,/nhạc|hướng dẫn|Hãy đọc/i);
 h.context.wav=wav;const pcm=h.eval('docWav(wav).pcm');assert.ok(pcm.subarray(0,5*24000).every(n=>n===0));assert.ok(pcm.subarray(5*24000,6*24000).some(n=>n!==0));
 assert.equal(h.context.rows[0].vi,'[nhạc mở đầu]');assert.equal(h.context.rows[1].start,5);assert.match(h.get('o-nhat-ky').textContent,/không đọc chú thích thành lời/);
 assert.equal(h.eval('moHinhDocDaChot()'),interaction?'gemini-3.8-flash-tts':'test-tts');assert.equal(h.eval('giongDocDaChot()'),'Kore');
});
test('A music-only video uses zero TTS requests; original background audio is left to the existing mixer',async()=>{
 const {h,sent}=setup();h.context.rows=[{start:0,end:12,vi:'Nhạc mở đầu'}];h.eval('S.cacCau=rows');const wav=await h.eval('longTieng()');h.context.wav=wav;
 assert.equal(sent.length,0);assert.ok(h.eval('docWav(wav).pcm').every(n=>n===0));assert.doesNotMatch(h.get('o-nhat-ky').textContent,/chưa dịch được/);
});
test('Gaps under 1.2s still group normally but do not join narration across a marked music interval',()=>{
 const {h}=setup();h.context.rows=[{start:0,end:1,vi:'Câu một'},{start:1.1,end:1.5,vi:'[nhạc nền]'},{start:1.6,end:2.5,vi:'Câu hai'},{start:2.7,end:4,vi:'Câu ba'}];h.eval('S.cacCau=rows');
 const groups=h.eval("chiaNhom(cauDocDuoc(),'gemini')");assert.deepEqual(Array.from(groups,c=>[c.start,c.end,c.vi]),[[0,1,'Câu một'],[1.6,4,'Câu hai Câu ba']]);
});
test('A caption sanitizer removes the direction before number and symbol normalization makes it spoken text',()=>{
 const {h}=setup();h.context.text='[nhạc mở đầu] Dùng 2 đèn và tăng 10%.';const text=h.eval('chuanHoaDoc(text)');assert.equal(text,'Dùng hai đèn và tăng mười phần trăm.');
});
test('Gemini transcription rejects music-only rows even if their translated field invents narration',async()=>{
 const {h}=setup();h.module('gemini.js').goiGemini=async()=>({candidates:[{content:{parts:[{text:JSON.stringify([{start:0,end:4,zh:'[音乐]',vi:'Phần nhạc dạo đang bắt đầu'},{start:5,end:6,zh:'大家好',vi:'[nhạc nền] Xin chào.'}])}]}}]});
 const rows=await h.eval("ngheGemini('',12,0)");assert.equal(rows.length,1);assert.equal(rows[0].start,5);assert.equal(rows[0].vi,'Xin chào.');assert.equal(rows[0].zh,'大家好');
});

test('An old cached packet containing the spoken intro label is not reused for the corrected narration',async()=>{
 const {h,sent}=setup();h.eval("khoGiong.set('gemini|Kore||nhạc mở đầu Xin chào.',{mau:new Float32Array([.9]),mh:'test-tts',provider:'gemini',giong:'Kore'})");
 const result=await h.eval("docCau('[nhạc mở đầu] Xin chào.','gemini')");assert.equal(sent.length,1);assert.equal(sent[0].contents[0].parts[0].text,'Xin chào.');assert.ok(result.length>1);
 await h.eval("docCau('[nhạc mở đầu] Xin chào.','gemini')");assert.equal(sent.length,1);
});
test('Whisper music captions are removed before DeepSeek translation without shifting real speech',async()=>{
 let translations=0;const h=harness({nativeFetch:async(url,init)=>{
  if(url==='/ai/capabilities')return Response.json({edge:true});
  if(String(url).includes('/audio/transcriptions'))return Response.json({segments:[{start:0,end:4,text:'[音乐]'},{start:5,end:6,text:'大家好'}]});
  if(String(url).includes('api.deepseek.com')){translations++;const body=JSON.parse(init.body),text=body.messages.at(-1).content;assert.match(text,/大家好/);assert.doesNotMatch(text,/\[音乐\]/);return Response.json({choices:[{message:{content:'{"1":"Xin chào."}'}}]})}
  assert.fail('Unexpected provider URL');
 }});
 h.eval("caiDat.dp.groq='test-key';caiDat.dp.ds='test-ds';caiDat.dichBang='deepseek'");
 const rows=await h.eval("duPhong.ngheVaDich(new Uint8Array(44),'')");assert.equal(translations,1);assert.equal(rows.length,1);assert.equal(rows[0].start,5);assert.equal(rows[0].vi,'Xin chào.');
});
