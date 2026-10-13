// Compatibility API for the owner's PHAHA source. The private Sites audience
// authenticates access; no new account database or plaintext key storage.
import {docEdge} from './edge-tts.js';
const SOURCE='https://raw.githubusercontent.com/phamduycuong1604-spec/app-cua-toi/10be28d6936da7f7b2cd9a48f149aed1871b4ae5/dich-video/mo-hinh/';
const MODELS={'UVR_MDXNET_9482.onnx':29704436,'UVR-MDX-NET-Inst_HQ_4.onnx':59074342,'vi_VN-vais1000-medium.onnx':63149198,'vi_VN-vais1000-medium.onnx.json':4860,'NGUON.txt':736};
const safeHeaders={'cache-control':'no-store','x-content-type-options':'nosniff'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...safeHeaders,'content-type':'application/json; charset=utf-8'}});
class VideoError extends Error{constructor(message,status=400){super(message);this.status=status;}}
export function providerURL(value){
 let u;try{u=new URL(value);}catch{throw new VideoError('Địa chỉ dịch vụ không hợp lệ.');}
 if(u.protocol!=='https:'||u.username||u.password||u.hash||u.port&&u.port!=='443')throw new VideoError('Địa chỉ dịch vụ bị từ chối.',403);
 const paths={
 'generativelanguage.googleapis.com':/^\/v1beta\/(?:models(?:\/[^/]+(?::generateContent)?)?|interactions)\/?$/,
 'texttospeech.googleapis.com':/^\/v1\/(?:voices|text:synthesize)$/,
 'api.groq.com':/^\/openai\/v1\/(?:models|audio\/transcriptions|chat\/completions)$/,
 'api.deepseek.com':/^\/(?:v1\/)?(?:chat\/completions|user\/balance|models)$/,
 'openrouter.ai':/^\/api\/v1\/(?:chat\/completions|models|key)$/,
 'api.fish.audio':/^\/(?:v1\/(?:tts|models)|model|wallet\/self\/api-credit)(?:\/[^/]+)?$/,
 'api.elevenlabs.io':/^\/v1\/(?:voices(?:\/[^/]+)?|shared-voices|voices\/add\/[^/]+\/[^/]+|user(?:\/subscription)?|text-to-speech\/[^/]+)$/,
 'api.fpt.ai':/^\/hmi\/tts\/v5$/,
 'viettelai.vn':/^\/tts\/speech_synthesis$/,
 'api.cognitive.microsofttranslator.com':/^\/translate$/,
 };
 const allowed=paths[u.hostname]?.test(u.pathname)||/^[a-z0-9-]+\.tts\.speech\.microsoft\.com$/.test(u.hostname)&&/^\/cognitiveservices\/(?:v1|voices\/list)$/.test(u.pathname)||/^[a-z0-9-]+\.api\.cognitive\.microsoft\.com$/.test(u.hostname)&&u.pathname==='/speechtotext/transcriptions:transcribe'||/^file\d*\.fpt\.ai$/.test(u.hostname)&&/^\/[^<>]*\.(?:mp3|wav)$/.test(u.pathname);
 if(!allowed)throw new VideoError('Không hỗ trợ địa chỉ dịch vụ này.',403);
 if([...u.searchParams.keys()].some(k=>/^(?:key|api_key|token)$/i.test(k)))throw new VideoError('Gửi mã qua header của dịch vụ.',400);
 return u;
}
async function readBody(request,max){
 if(Number(request.headers.get('content-length'))>max)throw new VideoError('Dữ liệu quá lớn.',413);
 const reader=request.body?.getReader();if(!reader)return new Uint8Array();let n=0,parts=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>max){await reader.cancel();throw new VideoError('Dữ liệu quá lớn.',413);}parts.push(value);}}finally{reader.releaseLock();}
 const data=new Uint8Array(n);let i=0;for(const p of parts){data.set(p,i);i+=p.length;}return data;
}
async function bodyJSON(request,max=250000){let data;try{data=JSON.parse(new TextDecoder().decode(await readBody(request,max)));}catch(e){if(e instanceof VideoError)throw e;throw new VideoError('JSON không hợp lệ.');}if(!data||typeof data!=='object'||Array.isArray(data))throw new VideoError('Cần một đối tượng JSON.');return data;}
function redacted(text,keys){for(const key of keys.filter(x=>x&&x.length>=4))text=text.split(key).join('[đã ẩn]');return text.replace(/Bearer\s+[A-Za-z0-9._-]+/gi,'Bearer [đã ẩn]');}
async function proxy(request){
 const u=providerURL(request.headers.get('X-Dich-Den')||'');
 if(!['GET','POST','HEAD'].includes(request.method))throw new VideoError('Phương thức không hỗ trợ.',405);
 const h=new Headers(),keys=[];
 for(const name of ['content-type','X-Provider-Authorization','x-goog-api-key','xi-api-key','api-key','token','voice','speed','format','Ocp-Apim-Subscription-Key','Ocp-Apim-Subscription-Region','X-Title','HTTP-Referer','X-Microsoft-OutputFormat','model','accept']){const v=request.headers.get(name);if(v){if(/key|token|authorization/i.test(name)){if(v.length>2048||/[^\x20-\x7e]/.test(v))throw new VideoError('Mã API chứa ký tự không hợp lệ.');keys.push(v,v.replace(/^Bearer\s+/i,''));}h.set(name==='X-Provider-Authorization'?'authorization':name,v);}}
 const data=['GET','HEAD'].includes(request.method)?undefined:await readBody(request,6_000_000);
 // Viettel also accepts the token inside JSON. Redact it if an upstream error echoes it.
 if(data&&h.get('content-type')?.includes('json')){try{const b=JSON.parse(new TextDecoder().decode(data));if(typeof b.token==='string')keys.push(b.token);}catch{}}
 const upstream=await fetch(u.href,{method:request.method,headers:h,body:data,redirect:'manual',signal:AbortSignal.timeout(180000)});
 if(upstream.status>=300&&upstream.status<400){await upstream.body?.cancel();throw new VideoError('Dịch vụ trả chuyển hướng. Chưa chuyển mã API sang địa chỉ khác.',502);}
 const out=new Headers(safeHeaders);out.set('content-type',upstream.headers.get('content-type')||'application/octet-stream');
 for(const k of ['retry-after','x-ratelimit-remaining-requests','x-ratelimit-remaining-tokens'])if(upstream.headers.has(k))out.set(k,upstream.headers.get(k));
 if(!upstream.ok){const bytes=await readBody(upstream,64000);const safe=redacted(new TextDecoder().decode(bytes),keys);return new Response(safe,{status:upstream.status,headers:out});}
 return new Response(upstream.body,{status:upstream.status,headers:out});
}
function validVault(v){
 return v&&[1,2].includes(v.pb)&&Object.keys(v).every(k=>['pb','muoi','iv','du'].includes(k))&&/^[A-Za-z0-9+/]{22}==$/.test(v.muoi)&&/^[A-Za-z0-9+/]{16}$/.test(v.iv)&&typeof v.du==='string'&&v.du.length>=24&&v.du.length<=4_500_000&&v.du.length%4===0&&/^[A-Za-z0-9+/]+={0,2}$/.test(v.du);
}
const VAULT='owner/source-video/vault.json',HISTORY='owner/source-video/history.json';
async function vault(request,env,path){
 if(!env.BUCKET)throw new VideoError('Kho đồng bộ chưa kết nối.',503);
 if(path==='/du-lieu'&&request.method==='GET'){const current=await env.BUCKET.get(VAULT);return json(current?{'dich-video':await current.json()}:{});}
 if(path==='/du-lieu/dich-video'&&request.method==='PUT'){
  const b=await bodyJSON(request,5_000_000);if(!validVault(b.giaTri)||Object.keys(b).some(k=>k!=='giaTri'))throw new VideoError('Chỉ nhận cài đặt đã khóa bằng mật khẩu.');
  const current=await env.BUCKET.get(VAULT),history=await env.BUCKET.get(HISTORY);let list=history?await history.json():[];
  if(current){const old=await current.json(),id=crypto.randomUUID();await env.BUCKET.put('owner/source-video/history/'+id,JSON.stringify(old));list.unshift({phan:'dich-video',ma:id,luc:old.capNhat});}
  for(const entry of list.slice(10))await env.BUCKET.delete('owner/source-video/history/'+entry.ma);
  await env.BUCKET.put(HISTORY,JSON.stringify(list.slice(0,10)));
  const capNhat=Date.now();await env.BUCKET.put(VAULT,JSON.stringify({giaTri:b.giaTri,capNhat}));return json({capNhat});
 }
 if(path==='/du-lieu/lich-su'&&request.method==='GET'){const h=await env.BUCKET.get(HISTORY);return json({banLuu:h?await h.json():[]});}
 if(/^\/du-lieu\/lich-su\/[a-f0-9-]{36}$/.test(path)&&request.method==='GET'){const b=await env.BUCKET.get('owner/source-video/history/'+path.split('/').at(-1));if(!b)throw new VideoError('Không tìm thấy bản cũ.',404);return json(await b.json());}
 throw new VideoError('Không hỗ trợ thao tác này.',405);
}
async function cfRun(request,env,model,input){
 const key=request.headers.get('X-Cf-Key')||env.CF_API_TOKEN,account=request.headers.get('X-Cf-Account')||env.CF_ACCOUNT_ID;
 if(!key&&env.AI)return env.AI.run(model,input);
 if(!key||!/^[a-f0-9]{32}$/i.test(account||''))throw new VideoError('Cloudflare cần API token và Account ID hợp lệ.',501);
 const response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/ai/run/'+model,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+key},body:JSON.stringify(input),redirect:'manual',signal:AbortSignal.timeout(90000)});
 const d=await response.json().catch(()=>({}));if(!response.ok||d.success===false)throw new VideoError('Cloudflare chưa xử lý được yêu cầu. Kiểm tra mã, quyền Workers AI và hạn mức.',response.status===401||response.status===403?response.status:502);return d.result||d;
}
async function edge(b){
 if(typeof b.text!=='string'||!b.text.trim()||b.text.length>3000||b.voice&&!/^vi-VN-[A-Za-z]+Neural$/.test(b.voice))throw new VideoError('Chữ hoặc giọng Edge không hợp lệ.');
 const attempt=async(text,n)=>{for(let i=0;i<n;i++){try{return await docEdge(text,b.voice||undefined);}catch{}}throw new VideoError('Edge không trả về âm thanh. Thử giọng đọc kế tiếp.',502);};
 let audio;try{audio=await attempt(b.text,3);}catch(e){const middle=b.text.length/2,spaces=[...b.text.matchAll(/\s/g)].map(m=>m.index).filter(i=>i>3&&i<b.text.length-3);if(!spaces.length)throw e;const cut=spaces.reduce((a,c)=>Math.abs(c-middle)<Math.abs(a-middle)?c:a);const a=await attempt(b.text.slice(0,cut),2),z=await attempt(b.text.slice(cut+1),2);audio=new Uint8Array(a.length+z.length);audio.set(a);audio.set(z,a.length);}
 if(audio.length<50||audio.length>15_000_000||!(audio[0]===0xff&&(audio[1]&0xe0)===0xe0||new TextDecoder().decode(audio.subarray(0,3))==='ID3'))throw new VideoError('Edge chưa trả file MP3 hợp lệ.',502);
 return new Response(audio,{headers:{...safeHeaders,'content-type':'audio/mpeg'}});
}
export async function handleVideoSource(request,env={}){
 const u=new URL(request.url),path=u.pathname;
 if(path.startsWith('/dub/mo-hinh/')&&request.method==='GET'){
  const name=path.slice('/dub/mo-hinh/'.length);if(!Object.hasOwn(MODELS,name))return json({loi:'Không có mô hình này.'},404);
  const r=await fetch(SOURCE+name,{redirect:'follow',signal:AbortSignal.timeout(120000)});if(!r.ok)return json({loi:'Chưa tải được mô hình AI.'},502);
  const size=Number(r.headers.get('content-length'));if(size&&size!==MODELS[name]){await r.body?.cancel();return json({loi:'Mô hình tải về sai kích thước.'},502);}
  return new Response(r.body,{headers:{'content-type':name.endsWith('.json')?'application/json':name.endsWith('.txt')?'text/plain':'application/octet-stream','cache-control':'private, max-age=31536000, immutable','content-length':String(MODELS[name]),'x-content-type-options':'nosniff'}});
 }
 if(!path.startsWith('/ai/')&&!path.startsWith('/du-lieu'))return null;
 try{
  const origin=request.headers.get('origin');if(origin&&origin!==u.origin)throw new VideoError('Yêu cầu khác nguồn bị từ chối.',403);
  if(path==='/ai/capabilities'&&request.method==='GET')return json({edge:true,cloudflare:!!(env.AI||env.CF_API_TOKEN&&env.CF_ACCOUNT_ID),sync:!!env.BUCKET,source:'10be28d6936da7f7b2cd9a48f149aed1871b4ae5'});
  if(path.startsWith('/du-lieu'))return await vault(request,env,path);
  if(path==='/ai/chuyen')return await proxy(request);
  if(request.method!=='POST')throw new VideoError('Phương thức không hợp lệ.',405);
  if(path==='/ai/edge')return await edge(await bodyJSON(request));
  if(path==='/ai/nghe'){const audio=new TextDecoder().decode(await readBody(request,6_000_000));if(!audio||!/^[A-Za-z0-9+/]*={0,2}$/.test(audio))throw new VideoError('Âm thanh không hợp lệ.');const result=await cfRun(request,env,'@cf/openai/whisper-large-v3-turbo',{audio,language:'zh',vad_filter:true});if(!Array.isArray(result.segments))throw new VideoError('Cloudflare chưa trả lời thoại có mốc giờ.',502);return json({segments:result.segments,text:result.text||''});}
  if(path==='/ai/dich'){const b=await bodyJSON(request);if(!Array.isArray(b.messages)||!b.messages.length)throw new VideoError('Thiếu câu cần dịch.');for(const model of ['@cf/meta/llama-3.3-70b-instruct-fp8-fast','@cf/qwen/qwen3-30b-a3b-fp8']){try{const d=await cfRun(request,env,model,{messages:b.messages,max_tokens:4096,temperature:0.15});return json({text:typeof d.response==='string'?d.response:JSON.stringify(d.response??d),model});}catch(e){if(e.status===501||e.status===401||e.status===403)throw e;}}throw new VideoError('Cloudflare chưa trả bản dịch.',502);}
  throw new VideoError('Không tìm thấy chức năng.',404);
 }catch(e){return json({loi:e instanceof VideoError?e.message:'Không kết nối được dịch vụ. Chưa xác định mã đúng hay sai.'},e instanceof VideoError?e.status:502);}
}
