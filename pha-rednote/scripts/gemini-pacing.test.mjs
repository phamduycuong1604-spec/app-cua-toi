import test from 'node:test';
import assert from 'node:assert/strict';
import {createTtsScheduler,retrySeconds} from '../web/phaha/gemini-tts.js';
const audio=()=>({candidates:[{content:{parts:[{inlineData:{data:'AQACAA==',mimeType:'audio/L16;rate=24000'}}]}}]});
const fail=(message,status=429,details=[],headers={})=>Response.json({error:{message,details}},{status,headers});
function fixture({keys=['key-a','key-b'],models=['first-tts','second-tts'],reply=()=>Response.json(audio()),saved={}}={}){
 let clock=100000,today='2026-10-21',active=0,maxActive=0,record;const calls=[],waits=[],logs=[],controller=new AbortController();
 const api=createTtsScheduler({keys:()=>keys,models:()=>models,read:()=>saved,write:x=>record=structuredClone(x),now:()=>clock,day:()=>today,
 fingerprint:key=>'hash-'+key.slice(-1),wait:async seconds=>{waits.push(seconds);clock+=seconds*1000},signal:()=>controller.signal,log:t=>logs.push(t),api:'https://api.test',
 fetch:async(url,init)=>{const key=init.headers['x-goog-api-key'],model=url.match(/models\/([^:]+)/)?.[1];calls.push({key,model,at:clock});maxActive=Math.max(maxActive,++active);try{return await reply({key,model,call:calls.length,init})}finally{active--}}});
 return{api,calls,waits,logs,controller,get saved(){return record},get maxActive(){return maxActive},advance:ms=>clock+=ms,nextDay:()=>today='2026-10-22'};
}
const payload={contents:[{parts:[{text:'Xin chào'}]}]};
test('All callers share one TTS request even when submitted concurrently',async()=>{
 const f=fixture({reply:async()=>{await new Promise(r=>setTimeout(r,5));return Response.json(audio())}});
 await Promise.all(Array.from({length:6},()=>f.api.request(payload)));assert.equal(f.maxActive,1);assert.equal(f.calls.length,6);
});
for(const seconds of [0,0.5,15])test(`Retry-After ${seconds}s waits and retries the same pair once`,async()=>{
 const f=fixture({reply:({call})=>call===1?fail('requests per minute',429,[],{'retry-after':String(seconds)}):Response.json(audio())});await f.api.request(payload);
 assert.deepEqual(f.calls.map(c=>c.key),['key-a','key-a']);assert.deepEqual(f.waits,seconds?[Math.ceil(seconds)]:[]);
});
test('A delay above 15s locks the pair and switches key without waiting',async()=>{
 const f=fixture({reply:({call})=>call===1?fail('Please retry in 44s'):Response.json(audio())});await f.api.request(payload);
 assert.deepEqual(f.calls.map(c=>c.key),['key-a','key-b']);assert.deepEqual(f.waits,[]);assert.ok(f.api.snapshot('key-a','first-tts').blockedUntil>100000);
});
test('Repeated short 429 never loops or waits longer than the 15s budget',async()=>{
 const f=fixture({reply:()=>fail('Please retry in 10s')});await assert.rejects(f.api.request(payload),{code:'TTS_TEMPORARY'});
 assert.ok(f.waits.reduce((n,x)=>n+x,0)<=15);assert.ok(f.calls.length<=5);
});
test('The structured daily Free Tier quota is stored per key + model until next Pacific day',async()=>{
 const f=fixture({reply:({key,model})=>key==='key-a'&&model==='first-tts'?fail('Quota exhausted',429,[{violations:[{quotaId:'GenerateRequestsPerDayPerProjectPerModel-FreeTier'}]}]):Response.json(audio())});
 await f.api.request(payload);assert.equal(f.api.snapshot('key-a','first-tts').exhausted,true);assert.equal(f.api.snapshot('key-b','first-tts').exhausted,false);
 await f.api.request(payload);assert.equal(f.calls.filter(c=>c.key==='key-a'&&c.model==='first-tts').length,1);f.nextDay();assert.equal(f.api.snapshot('key-a','first-tts').remaining,10);
});
test('Model exhaustion tries every key for that model, then changes model only for the new packet',async()=>{
 let first=true;const f=fixture({reply:({model})=>first||model==='second-tts'?(first=false,Response.json(audio())):fail('per day')});
 await f.api.request(payload);await f.api.request(payload);assert.deepEqual(f.calls.map(c=>c.model),['first-tts','first-tts','first-tts','second-tts']);assert.deepEqual(f.waits,[]);
});
test('All pairs exhausted returns immediately and the next call sends no requests',async()=>{
 const f=fixture({reply:()=>fail('per day')});await assert.rejects(f.api.request(payload),{code:'TTS_DAY_EXHAUSTED'});const n=f.calls.length;
 await assert.rejects(f.api.request(payload),{code:'TTS_DAY_EXHAUSTED'});assert.equal(f.calls.length,n);assert.equal(f.waits.length,0);assert.equal(n,4);
});
test('A successful model stays preferred; before the first success the model with most remaining wins',async()=>{
 const saved={pairs:{'hash-a:first-tts':{day:'2026-10-21',used:9,limit:10},'hash-b:first-tts':{day:'2026-10-21',used:9,limit:10}}};
 const f=fixture({saved});await f.api.request(payload);await f.api.request(payload);assert.deepEqual(f.calls.map(c=>c.model),['second-tts','second-tts']);
});
test('Initial model ranking sums remaining requests across distinct known projects',async()=>{
 const saved={projects:{'hash-a':'projects/one','hash-b':'projects/two'},pairs:{
  'projects/one:first-tts':{day:'2026-10-21',used:1,limit:10},'projects/two:first-tts':{day:'2026-10-21',used:1,limit:10},
  'projects/two:second-tts':{day:'2026-10-21',used:10,limit:10},
 }};
 const f=fixture({saved});await f.api.request(payload);assert.equal(f.calls[0].model,'first-tts');
});
test('Known project aliases share daily quota, different projects remain eligible',async()=>{
 const saved={projects:{'hash-a':'projects/shared','hash-b':'projects/shared','hash-c':'projects/other'}};
 const f=fixture({keys:['key-a','key-b','key-c'],models:['first-tts'],saved,reply:({key})=>key==='key-a'?fail('per day'):Response.json(audio())});
 await f.api.request(payload);assert.deepEqual(f.calls.map(c=>c.key),['key-a','key-c']);assert.equal(f.api.snapshot('key-b','first-tts').exhausted,true);
});
test('A project reported by Google is learned without exposing API keys in stored quota',async()=>{
 const f=fixture({reply:()=>fail('per day',429,[{metadata:{consumer:'projects/shared'}}])});await assert.rejects(f.api.request(payload));
 assert.equal(f.saved.projects['hash-a'],'projects/shared');assert.doesNotMatch(JSON.stringify(f.saved),/key-a|key-b/);
});
test('Quota survives reopening the scheduler; temporary cooldown expires',async()=>{
 const f=fixture({reply:()=>fail('Please retry in 44s')});await assert.rejects(f.api.request(payload));
 const g=fixture({saved:f.saved});await assert.rejects(g.api.request(payload));assert.equal(g.calls.length,0);g.advance(45000);await g.api.request(payload);assert.equal(g.calls.length,1);
});
test('Rejected keys are attempted once, empty audio is not accepted, transient failure is not daily quota',async()=>{
 const f=fixture({reply:({key,model})=>key==='key-a'?fail('bad key',401):model==='first-tts'?Response.json({candidates:[]}):Response.json(audio())});
 await f.api.request(payload);assert.equal(f.calls.filter(c=>c.key==='key-a').length,1);assert.equal(f.api.snapshot('key-b','first-tts').exhausted,false);assert.equal(f.calls.at(-1).model,'second-tts');
});
test('Stop while a request is pending aborts the request and all queued TTS jobs',async()=>{
 let started;const seen=new Promise(r=>started=r);const f=fixture({reply:({init})=>new Promise((_,reject)=>{started();init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true})})});
 const jobs=[f.api.request(payload),f.api.request(payload)];const checks=jobs.map(p=>assert.rejects(p,{name:'AbortError'}));await seen;f.controller.abort();await Promise.all(checks);assert.equal(f.calls.length,1);
});
test('Retry hints honor headers, JSON RetryInfo, full hour durations and HTTP dates',()=>{
 const body={error:{message:'Please retry in 20h6m22s',details:[{retryDelay:'12.5s'}]}};
 assert.equal(retrySeconds(body,new Response(null,{headers:{'retry-after':'15'}})),15);
 assert.equal(retrySeconds(body,new Response(null)),12.5);body.error.details=[];assert.equal(retrySeconds(body,new Response(null)),72382);
 assert.equal(retrySeconds(body,new Response(null,{headers:{'retry-after':new Date(130000).toUTCString()}}),100000),30);
});
