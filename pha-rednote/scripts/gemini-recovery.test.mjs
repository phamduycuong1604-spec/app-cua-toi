import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './phaha-harness.mjs';
const audio=()=>({steps:[{type:'model_output',content:[{type:'audio',data:'AQACAA==',mime_type:'audio/L16;rate=24000'}]}],candidates:[{content:{parts:[{inlineData:{mimeType:'audio/L16;codec=pcm;rate=24000',data:Buffer.from(new Uint8Array([1,0,2,0])).toString('base64')}}]}}]});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
test('A failed voice lane waits for its in-flight sibling before allowing a fallback',async()=>{
 const h=harness(),started=deferred(),gate=deferred();let calls=0,settled=false;
 h.module('giong-doc.js').docCau=async()=>{if(++calls===1){await started.promise;throw Error('provider failed')}started.resolve();await gate.promise;return new Float32Array([.2])};
 h.context.rows=[{start:0,end:1,vi:'Một'},{start:2,end:3,vi:'Hai'},{start:4,end:5,vi:'Ba'},{start:6,end:7,vi:'Bốn'}];
 const work=h.eval("docTatCa(rows,'az','lượt')");work.then(()=>settled=true,()=>settled=true);
 await started.promise;await new Promise(r=>setImmediate(r));assert.equal(settled,false);
 gate.resolve();await assert.rejects(work,/provider failed/);assert.equal(calls,3);
});
test('An aborted Edge request is never counted as an allowed missing sentence',async()=>{
 const h=harness();h.module('giong-doc.js').docCau=async()=>{throw new DOMException('Lỗi kết nối đã dừng','AbortError')};
 h.context.rows=[{start:0,end:1,vi:'Một'}];await assert.rejects(h.eval("docTatCa(rows,'edge','câu')"),{name:'AbortError'});
 assert.doesNotMatch(h.get('o-nhat-ky').textContent,/bỏ trống/);
});
function setup(options){const h=harness(options);h.eval("caiDat.khoa='main-test-key';caiDat.khoaDoc='';caiDat.mhDoc='gemini-test-tts';globalThis.testNow=Date.now();Date.now=()=>testNow;cho=async seconds=>{testNow+=Math.ceil(seconds)*1000};timMoHinh=async()=>[]");return h;}
test('A temporary model outage remains temporary on the next call, never a daily-quota error',async()=>{
 const h=setup();h.eval("goiMoHinh=async()=>{throw Object.assign(Error('busy'),{status:503,doiMoHinh:true})}");
 await assert.rejects(h.eval("goiGemini('nghe',{})"),e=>e.message!=='HET_NGAY');
 await assert.rejects(h.eval("goiGemini('nghe',{})"),e=>e.message!=='HET_NGAY');
 assert.ok(![...h.store.keys()].some(k=>k==='phaha-dv-dung'&&h.store.get(k).includes('het:gm:')));
});
test('A per-minute limit with a 90-second retry delay is not reported as exhausted for the day',async()=>{
 const h=setup({nativeFetch:async url=>url==='/ai/capabilities'?Response.json({}):Response.json({error:{message:'Quota exceeded for requests per minute',details:[{quotaId:'GenerateRequestsPerMinutePerProject'},{retryDelay:'90s'}]}},{status:429})});
 await assert.rejects(h.eval("goiMoHinh('gemini-test-tts',{},'doc')"),e=>e.message!=='HET_NGAY'&&e.status===429);
});
test('An in-flight Gemini request keeps usage attached to the API key it actually sent',async()=>{
 const gate=deferred(),seen=deferred();const h=setup({nativeFetch:async(url,init)=>{if(url==='/ai/capabilities')return Response.json({});seen.resolve(new Headers(init.headers).get('x-goog-api-key'));await gate.promise;return Response.json(audio())}});
 h.eval("caiDat.khoaDoc='first-test-key second-test-key';soMaDoc=0");const job=h.eval("goiMoHinh('gemini-test-tts',{},'doc')");assert.equal(await seen.promise,'first-test-key');h.eval('soMaDoc=1');gate.resolve();await job;
 const usage=JSON.parse(h.store.get('phaha-dv-dung'));assert.ok(Object.keys(usage).some(k=>k.includes(h.eval("vanTayMa('first-test-key')"))));assert.ok(!Object.keys(usage).some(k=>k.includes(h.eval("vanTayMa('second-test-key')"))));
});
test('A model error from a pending request is not cached against a different key selected by another lane',async()=>{
 const gate=deferred(),seen=deferred(),calls=[];let first=true;const h=setup({nativeFetch:async(url,init)=>{if(url==='/ai/capabilities')return Response.json({});calls.push(new Headers(init.headers).get('x-goog-api-key'));if(first){first=false;seen.resolve();await gate.promise;return Response.json({error:{message:'model not found'}},{status:404})}return Response.json(audio())}});
 h.eval("caiDat.khoaDoc='first-test-key second-test-key';soMaDoc=0");const job=h.eval("goiGeminiMotMa('doc',{})");await seen.promise;h.eval('soMaDoc=1');gate.resolve();await job;
 assert.ok(calls.every(k=>k==='first-test-key'));const cache=JSON.parse(h.store.get('phaha-dv-gemini-nghi'));assert.ok(Object.keys(cache).every(k=>k.startsWith(h.eval("vanTayMa('first-test-key')")+':')));
});
test('A rejected first voice key can move to the second configured key',async()=>{
 const calls=[];const h=setup({nativeFetch:async(url,init)=>{if(url==='/ai/capabilities')return Response.json({});const key=new Headers(init.headers).get('x-goog-api-key');calls.push(key);return key==='bad-test-key'?Response.json({error:{message:'API key not valid',status:'UNAUTHENTICATED'}},{status:401}):Response.json(audio())}});
 h.eval("caiDat.khoaDoc='bad-test-key good-test-key'");const result=await h.eval("docGemini('Xin chào')");assert.equal(result.pcm.length,2);assert.deepEqual(calls,['bad-test-key','good-test-key']);assert.doesNotMatch(h.get('o-nhat-ky').textContent,/bad-test-key|good-test-key/);
});
test('A configured equivalent TTS model is used when supported',async()=>{
 const calls=[];const h=setup({nativeFetch:async url=>{if(url==='/ai/capabilities')return Response.json({});calls.push(String(url));return Response.json(audio())}});
 h.eval("caiDat.mhDoc='new-voice-tts'");await h.eval("docGemini('Xin chào')");assert.ok(calls[0].includes('new-voice-tts'));
});
test('A model returning no audio is not cached; another Gemini pair is tried',async()=>{
 const calls=[];const h=setup({nativeFetch:async(url,init)=>{if(url==='/ai/capabilities')return Response.json({});calls.push(String(url));return calls.length===1?Response.json({candidates:[]}):Response.json(audio())}});
 const result=await h.eval("docGemini('Xin chào')");assert.equal(result.pcm.length,2);assert.equal(calls.length,2);
});

test('A real daily-quota response is kept distinct and recorded only for the request key',async()=>{
 const h=setup({nativeFetch:async url=>url==='/ai/capabilities'?Response.json({}):Response.json({error:{message:'Quota exceeded per day',details:[{quotaId:'GenerateRequestsPerDayPerProject'},{retryDelay:'3600s'}]}},{status:429})});
 await assert.rejects(h.eval("goiGemini('doc',{})"),{code:'TTS_DAY_EXHAUSTED'});
 const quota=JSON.parse(h.store.get('phaha-tts-quota-v1'));assert.ok(Object.values(quota.pairs).every(p=>p.exhausted));

});
test('A 90-second minute limit rotates key without adding a false daily-exhaustion flag',async()=>{
 const keys=[];const h=setup({nativeFetch:async(url,init)=>{if(url==='/ai/capabilities')return Response.json({});const k=new Headers(init.headers).get('x-goog-api-key');keys.push(k);return keys.length===1?Response.json({error:{message:'requests per minute',details:[{retryDelay:'90s'}]}},{status:429}):Response.json(audio())}});
 h.eval("caiDat.khoaDoc='first-test-key second-test-key'");await h.eval("docGemini('Xin chào')");assert.deepEqual(keys,['first-test-key','second-test-key']);assert.doesNotMatch(h.store.get('phaha-dv-dung')||'',/het:gm:/);
});
test('All rejected keys are tried at most once each and error logs never expose them',async()=>{
 let calls=0;const h=setup({nativeFetch:async url=>url==='/ai/capabilities'?Response.json({}):(calls++,Response.json({error:{message:'API_KEY_INVALID first-test-key second-test-key'}},{status:400}))});
 h.eval("caiDat.khoaDoc='first-test-key second-test-key'");await assert.rejects(h.eval("docGemini('Xin chào')"),e=>e.status===400&&e.reason==='key-rejected');assert.equal(calls,2);assert.doesNotMatch(h.get('o-nhat-ky').textContent,/first-test-key|second-test-key/);assert.equal(h.store.has('phaha-dv-gemini-nghi'),false);
});
test('Transient cooldown expires while the app stays open, allowing Gemini to recover',async()=>{
 let fail=true,calls=0;const h=setup({nativeFetch:async url=>{if(url==='/ai/capabilities')return Response.json({});calls++;return fail?Response.json({error:{message:'busy'}},{status:503}):Response.json(audio())}});
 h.eval('Date.now=()=>100000');await assert.rejects(h.eval("docGemini('Xin chào')"));const count=calls;fail=false;h.eval('Date.now=()=>161000');await h.eval("docGemini('Xin chào')");assert.equal(calls,count+1);
});
test('One old network error does not permanently force Gemini through the Site server',async()=>{
 let broken=true,direct=0,relay=0;const h=setup({nativeFetch:async url=>{if(url==='/ai/capabilities')return Response.json({});if(String(url).startsWith('https://generativelanguage')){direct++;if(broken)throw TypeError('Load failed')}else relay++;return Response.json(audio())}});
 h.eval('Date.now=()=>100000');await h.eval("docGemini('Xin chào')");assert.equal(relay,1);broken=false;h.eval('Date.now=()=>131000');await h.eval("docGemini('Xin chào')");assert.equal(direct,2);assert.equal(relay,1);
});
test('Google location restrictions are surfaced without marking a model or key as expired',async()=>{
 const h=setup({nativeFetch:async url=>url==='/ai/capabilities'?Response.json({}):Response.json({error:{message:'User location is not supported for the API use.'}},{status:400})});
 await assert.rejects(h.eval("docGemini('Xin chào')"),e=>e.viTri===true&&/vị trí mạng/.test(e.message));assert.equal(h.store.has('phaha-dv-gemini-nghi'),false);assert.doesNotMatch(h.store.get('phaha-dv-dung')||'',/het:gm:/);
});
test('Changing a non-model voice option cannot falsely blacklist a TTS model for 30 days',async()=>{
 const h=setup({nativeFetch:async url=>url==='/ai/capabilities'?Response.json({}):Response.json({error:{message:'Voice is not supported for this request'}},{status:400})});
 await assert.rejects(h.eval("docGemini('Xin chào')"),e=>e.status===400);assert.equal(h.store.has('phaha-dv-gemini-nghi'),false);
});
test('Old false quota memories are cleared once without deleting API keys or usage counts',()=>{
 const settings={khoa:'main-test-key',khoaDoc:'voice-test-key'},stored={'phaha-dv-cai-dat':JSON.stringify(settings),'phaha-dv-gemini-nghi':JSON.stringify({old:Date.now()+3600000}),'phaha-dv-dung':JSON.stringify({'gm:old:doc':{n:3},'het:gm:old:doc':{ngay:'today'}})};
 const h=harness({stored});h.eval('napMoHinhNghi()');assert.equal(h.eval('caiDat.khoaDoc'),'voice-test-key');assert.equal(h.eval('moHinhNghi.size'),0);const used=JSON.parse(h.store.get('phaha-dv-dung'));assert.equal(used['gm:old:doc'].n,3);assert.equal(used['het:gm:old:doc'],undefined);
 h.eval("luuMoHinhNghi('new',60,'quota-minute');napMoHinhNghi()");assert.equal(h.eval('moHinhNghi.has("new")'),true);
});

function speech(){const pcm=new Int16Array(2400);for(let i=0;i<pcm.length;i++)pcm[i]=Math.round(Math.sin(i*.12)*12000);return {steps:[{type:'model_output',content:[{type:'audio',data:Buffer.from(pcm.buffer).toString('base64'),mime_type:'audio/L16;rate=24000'}]}],candidates:[{content:{parts:[{inlineData:{mimeType:'audio/L16;codec=pcm;rate=24000',data:Buffer.from(pcm.buffer).toString('base64')}}]}}]};}
for(const scenario of ['normal','next-model','next-key','fallback'])test('Workflow reaches export with audible Vietnamese speech: '+scenario,async()=>{
 const calls=[];const h=setup({nativeFetch:async(url,init)=>{if(url==='/ai/capabilities')return Response.json({edge:true});calls.push(String(url));const key=new Headers(init.headers).get('x-goog-api-key');if(scenario==='fallback'||scenario==='next-key'&&key==='bad-test-key')return Response.json({error:{message:'API key not valid'}},{status:401});if(scenario==='next-model'&&String(url).includes('gemini-test-tts'))return Response.json({error:{message:'model not found'}},{status:404});return Response.json(speech())}});
 h.eval(`tepVideo=new File(['source'],'video.mp4');caiDat.khoaDoc=${JSON.stringify(scenario==='next-key'?'bad-test-key good-test-key':'good-test-key')};
 for(const dv of THU_TU)caiDat.bat[dv]=dv==='gemini'||dv==='edge';caiDat.tachNhac=false;caiDat.lop.phuDe.bat=true;caiDat.lop.che.bat=true;
 taiFfmpeg=async()=>{ff={}};ganVideo=async()=>{thoiLuong=3;return {width:1280,height:720,coTieng:true,duong:'/source'}};tachTieng=async()=>new Int16Array(48000);ngheVaDich=async()=>[{start:0,end:1,zh:'主光',vi:'Đèn chính'}];
 DICH_VU.edge.doc=async()=>({pcm:new Int16Array([12000,-12000,12000,-12000]),tanSo:24000});
 xuatHinh=async()=>({blob:new Blob(['picture']),codec:'avc',W:1280,H:720});
 xuatVideo=async(wav)=>{globalThis.finalVoice=wav;return new Blob(['encoded video'])};`);
 await h.eval('chay(true)');assert.ok(h.eval('videoKetQua'));assert.equal(h.eval('dangChay'),false);assert.equal(h.eval('PHADownload.isBusy()'),false);const voice=h.eval('docWav(finalVoice)');assert.ok(voice.pcm.some(x=>Math.abs(x)>.1));assert.match(h.get('o-nhat-ky').textContent,/HOÀN TẤT/);assert.match(h.get('o-nhat-ky').textContent,scenario==='fallback'?/Edge chỉ đọc các gói chưa có audio/:/bằng Gemini/);assert.ok(calls.length>0);
});
test('Stopping a real pending Gemini call never starts another voice or exports a silent result',async()=>{
 const seen=deferred();let edge=0,exported=0;const h=setup({nativeFetch:async(url,init)=>{if(url==='/ai/capabilities')return Response.json({edge:true});seen.resolve();return new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true}))}});
 h.eval(`tepVideo=new File(['source'],'video.mp4');for(const dv of THU_TU)caiDat.bat[dv]=dv==='gemini'||dv==='edge';caiDat.tachNhac=false;caiDat.lop.phuDe.bat=false;caiDat.lop.che.bat=false;
 taiFfmpeg=async()=>{ff={}};ganVideo=async()=>{thoiLuong=3;return {width:1280,height:720,coTieng:true}};tachTieng=async()=>new Int16Array(48000);ngheVaDich=async()=>[{start:0,end:1,vi:'Đèn chính'}];`);
 h.context.edgeSpy=()=>{edge++;return {pcm:new Int16Array([12000]),tanSo:24000}};h.context.exportSpy=()=>{exported++;return new Blob(['output'])};h.eval('DICH_VU.edge.doc=edgeSpy;xuatVideo=exportSpy');const job=h.eval('chay(true)');await seen.promise;h.eval('stopRun()');await job;assert.equal(edge,0);assert.equal(exported,0);assert.equal(h.eval('dangChay'),false);assert.equal(h.eval('PHADownload.isBusy()'),false);
});
