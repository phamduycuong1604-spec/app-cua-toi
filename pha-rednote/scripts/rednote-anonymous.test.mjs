import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
const SOURCE='https://www.xiaohongshu.com/explore/abcdefabcdefabcdefabcdef';
const CDN='https://sns-video-bd.xhscdn.com/source/original';
const MP4=new Uint8Array([0,0,0,16,102,116,121,112,105,115,111,109,0,0,0,0]);
const PAGE='<script>window.__INITIAL_STATE__='+JSON.stringify({note:{noteDetailMap:{a:{note:{noteId:'abcdefabcdefabcdefabcdef',title:'Public video',desc:'Original caption',video:{consumer:{originVideoKey:'source/original'}}}}}}})+'</script>';
const LOGIN='<title>登录</title><script>window.__INITIAL_STATE__={"login":{}}</script>';
const staleEnv={REDNOTE_SESSION_KEY:'retired-test-key',REDNOTE_SESSION_ADMIN_EMAIL:'owner@example.test',BUCKET:new Proxy({},{get(){assert.fail('Anonymous downloads must not access stored Rednote sessions')}})};
function request(path='/api/dub/fetch-video',method='POST',body={url:SOURCE,delivery:'attachment'}){
 return new Request('https://site.test'+path,{method,headers:{origin:'https://site.test','content-type':'application/json',cookie:'incoming-site-session=TEST-DO-NOT-FORWARD',authorization:'Bearer incoming-test-only'},...(method==='GET'?{}:{body:JSON.stringify(body)})});
}
async function upstream(page,fn){
 const before=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,init={})=>{
  calls.push({url,init});const h=new Headers(init.headers);
  assert.equal(h.get('cookie'),null);assert.equal(h.get('authorization'),null);assert.equal(init.credentials,'omit');
  if(new URL(url).hostname.endsWith('xhscdn.com'))return new Response(MP4,{status:206,headers:{'content-range':'bytes 0-15/500000000','content-type':'video/mp4'}});
  return page(url,init);
 };
 try{return await fn(calls)}finally{globalThis.fetch=before}
}
test('Public downloads ignore retired cookie configuration and do not access its storage',()=>upstream(()=>new Response(PAGE),async calls=>{
 const r=await worker.fetch(request(),staleEnv),d=await r.json();assert.equal(r.status,200);assert.equal(d.mode,'original');assert.equal(d.size,500000000);assert.match(d.reason,/≤ 600 MB/);assert.equal(calls.filter(c=>c.url===SOURCE).length,1);
}));
test('Login-only pages fail clearly without using stored cookies or asking users to paste cookies',()=>upstream(()=>new Response(LOGIN),async calls=>{
 const r=await worker.fetch(request(),staleEnv),d=await r.json();assert.equal(r.status,422);assert.equal(d.code,'REDNOTE_LOGIN_REQUIRED');assert.match(d.error,/bài công khai.*chọn video từ máy/);assert.doesNotMatch(d.error,/cookie|cập nhật phiên|lưu phiên/i);assert.ok(calls.length>=2);assert.ok(calls.every(c=>new Headers(c.init.headers).get('cookie')===null));
}));
test('401 responses are login-required errors rather than expired-cookie errors',()=>upstream(()=>new Response('Unauthorized',{status:401}),async()=>{
 const r=await worker.fetch(request(),staleEnv);assert.equal(r.status,422);assert.equal((await r.json()).code,'REDNOTE_LOGIN_REQUIRED');
}));
test('Anonymous redirects can fall back from a gated page to a public canonical page',()=>upstream(url=>url===SOURCE?new Response(LOGIN):new Response(PAGE),async()=>{
 const r=await worker.fetch(request(),staleEnv);assert.equal(r.status,200);assert.equal((await r.json()).mode,'original');
}));
test('A public page with a login UI module remains downloadable',()=>upstream(()=>new Response(PAGE.replace('"note":','"login":{},"note":')),async()=>{
 assert.equal((await worker.fetch(request(),staleEnv)).status,200);
}));
for(const [path,method] of [['/api/rednote/session','GET'],['/api/rednote/session','PUT'],['/api/rednote/session','DELETE'],['/api/rednote/session/check','POST'],['/dub/rednote-session.js','GET']])test('Retired cookie endpoint returns 404: '+method+' '+path,async()=>{
 const before=globalThis.fetch;globalThis.fetch=()=>assert.fail('Retired endpoints must not contact Rednote');
 try{assert.equal((await worker.fetch(request(path,method,{cookie:'test-retired-cookie'}),staleEnv)).status,404)}finally{globalThis.fetch=before}
});
test('Download page has no cookie management UI or script; local video selection and size policy remain',async()=>{
 const r=await worker.fetch(request('/','GET'),staleEnv),html=await r.text();assert.equal(r.status,200);
 assert.doesNotMatch(html,/rednoteSession|rednoteCookie|rednote-session\.js|Cookie Rednote|Đăng nhập Rednote · quản trị/);
 assert.match(html,/id="chooseFile"/);assert.match(html,/Tối đa 600 MB/);assert.match(html,/720p không watermark/);
});

test('A desktop login redirect recovers the public mobile share without cookies or session storage',()=>upstream((url,init)=>{
 if(url==='https://xhslink.com/o/public-share')return new Response(null,{status:302,headers:{location:SOURCE+'?xsec_token=public-share-token&xsec_source=app_share'}});
 if(new URL(url).pathname==='/login')return new Response(LOGIN);
 if(new Headers(init.headers).get('user-agent').includes('iPhone')){
  assert.equal(new URL(url).searchParams.get('xsec_token'),'public-share-token');
  assert.equal(new Headers(init.headers).get('referer'),'https://www.xiaohongshu.com/');
  return new Response(PAGE);
 }
 return new Response(null,{status:302,headers:{location:'https://www.xiaohongshu.com/login'}});
},async calls=>{
 const r=await worker.fetch(request('/api/dub/fetch-video','POST',{url:'https://xhslink.com/o/public-share',delivery:'attachment'}),staleEnv),d=await r.json();
 assert.equal(r.status,200);assert.equal(d.sourceUserAgent,'mobile-share');assert.equal(d.sourceResolver,'mobile-share');assert.equal(d.mode,'original');assert.equal(d.size,500000000);
 assert.match(d.sourceUrl,/xsec_token=public-share-token/);
 assert.equal(calls.filter(c=>c.url==='https://xhslink.com/o/public-share').length,2);
}));
test('Both public profiles gated still report login required and never manufacture a media URL',()=>upstream(()=>new Response(LOGIN),async calls=>{
 const r=await worker.fetch(request(),staleEnv),d=await r.json();assert.equal(r.status,422);assert.equal(d.code,'REDNOTE_LOGIN_REQUIRED');assert.equal(d.downloadUrl,undefined);
 const agents=calls.map(c=>new Headers(c.init.headers).get('user-agent'));
 assert.ok(agents.some(a=>a.includes('Windows')));assert.ok(agents.some(a=>a.includes('iPhone')));
 assert.ok(calls.length<=10);
}));
test('Successful desktop retrieval does not waste a mobile request',()=>upstream(()=>new Response(PAGE),async calls=>{
 const r=await worker.fetch(request(),staleEnv);assert.equal(r.status,200);assert.equal((await r.json()).sourceUserAgent,'desktop');assert.ok(calls.every(c=>!new Headers(c.init.headers).get('user-agent').includes('iPhone')));
}));

for(const home of [LOGIN,PAGE])test('A short link ending at the home feed is not a note or a login-only failure: '+(home===LOGIN?'login UI':'recommended video'),()=>upstream((url,init)=>{
 if(new URL(url).hostname==='xhslink.com')return new Response(null,{status:302,headers:{location:'https://www.xiaohongshu.com/'}});
 if(!new Headers(init.headers).get('user-agent').includes('iPhone')&&new URL(url).pathname==='/')return new Response(null,{status:302,headers:{location:'https://www.xiaohongshu.com/login'}});
 return new Response(home);
},async calls=>{
 const r=await worker.fetch(request('/api/dub/fetch-video','POST',{url:'https://xhslink.com/o/missing-target',delivery:'attachment'}),staleEnv),d=await r.json();
 assert.equal(r.status,422);assert.equal(d.code,'REDNOTE_SHARE_TARGET_MISSING');assert.match(d.error,/trang chủ.*link chia sẻ mới/);assert.equal(d.downloadUrl,undefined);assert.equal(d.largeOriginal,undefined);
 assert.equal(calls.some(c=>new URL(c.url).hostname.endsWith('xhscdn.com')),false);
}));
test('Desktop home redirect still permits recovery of the correct mobile note',()=>upstream((url,init)=>{
 if(new URL(url).hostname==='xhslink.com')return new Response(null,{status:302,headers:{location:new Headers(init.headers).get('user-agent').includes('iPhone')?SOURCE:'https://www.xiaohongshu.com/'}});
 return new Response(new URL(url).pathname==='/'?LOGIN:PAGE);
},async()=>{
 const r=await worker.fetch(request('/api/dub/fetch-video','POST',{url:'https://xhslink.com/o/mobile-works',delivery:'attachment'}),staleEnv),d=await r.json();
 assert.equal(r.status,200);assert.equal(d.sourceUserAgent,'mobile-share');assert.equal(d.sourceUrl,SOURCE);
}));

test('The working mobile media headers survive selection, byte-range downloads and file streaming',async()=>{
 const before=globalThis.fetch;const seen=[];
 globalThis.fetch=async(url,init={})=>{
  const h=new Headers(init.headers);seen.push({url,headers:h});assert.equal(h.get('cookie'),null);assert.equal(h.get('authorization'),null);
  if(new URL(url).hostname.endsWith('xhscdn.com')){
   if(!h.get('user-agent').includes('iPhone')||h.get('referer')!=='https://www.xiaohongshu.com/')return new Response('Forbidden',{status:403});
   return new Response(MP4,{status:206,headers:{'content-range':'bytes 0-15/16','content-length':'16','content-type':'video/mp4'}});
  }
  return new Response(h.get('user-agent').includes('iPhone')?PAGE:LOGIN);
 };
 try{
  const response=await worker.fetch(request(),staleEnv),d=await response.json();assert.equal(response.status,200);assert.equal(new URL(d.downloadUrl,'https://site.test').searchParams.get('profile'),'mobile-share');
  const range=await worker.fetch(new Request(new URL(d.downloadUrl,'https://site.test'),{headers:{range:'bytes=0-15'}}),staleEnv);assert.equal(range.status,206);assert.deepEqual(new Uint8Array(await range.arrayBuffer()),MP4);
  assert.equal(seen.at(-1).headers.get('range'),'bytes=0-15');
  const stream=await worker.fetch(request('/api/dub/fetch-video','POST',{url:SOURCE,delivery:'stream'}),staleEnv);assert.equal(stream.status,200);assert.equal(stream.headers.get('x-source-user-agent'),'mobile-share');assert.deepEqual(new Uint8Array(await stream.arrayBuffer()),MP4);
 }finally{globalThis.fetch=before}
});

test('Android public share fallback preserves its exact query and working headers into media downloads',async()=>{
 const originalFetch=globalThis.fetch,seen=[];
 const query='app_platform=android&app_version=9.0&xhsshare=CopyLink&source=app&xsec_source=app_share&xsec_token=a%2Bb%3D&share_id=public-share';
 globalThis.fetch=async(url,init={})=>{
  const u=new URL(url),h=new Headers(init.headers);seen.push({url,ua:h.get('user-agent')});assert.equal(h.get('cookie'),null);assert.equal(h.get('authorization'),null);
  if(u.hostname==='xhslink.com')return new Response(null,{status:302,headers:{location:SOURCE.replace('/explore/','/discovery/item/')+'?'+query}});
  if(u.hostname.endsWith('xhscdn.com')){
   assert.match(h.get('user-agent'),/Android/);assert.equal(h.get('referer'),'https://www.rednote.com/');
   return new Response(MP4,{status:206,headers:{'content-range':'bytes 0-15/16','content-length':'16'}});
  }
  if(u.hostname==='www.rednote.com'&&h.get('user-agent').includes('Android')){assert.equal(u.search.slice(1),query);return new Response(PAGE)}
  return new Response(LOGIN);
 };
 try{
  const r=await worker.fetch(request('/api/dub/fetch-video','POST',{url:'https://xhslink.com/o/android-share',delivery:'attachment'}),staleEnv),d=await r.json();
  assert.equal(r.status,200);assert.equal(d.sourceUserAgent,'mobile-android');assert.equal(new URL(d.downloadUrl,'https://site.test').searchParams.get('profile'),'mobile-android');
  const download=await worker.fetch(new Request(new URL(d.downloadUrl,'https://site.test'),{headers:{range:'bytes=0-15'}}),staleEnv);
  assert.equal(download.status,206);assert.deepEqual(new Uint8Array(await download.arrayBuffer()),MP4);assert.ok(seen.some(x=>x.ua.includes('iPhone')));assert.ok(seen.some(x=>x.ua.includes('Android')));
 }finally{globalThis.fetch=originalFetch}
});

for(const gate of ['captcha','error'])test('Server-side verification '+gate+' is not reported as proof that the note requires user login',()=>upstream(url=>{
 if(new URL(url).pathname.startsWith('/website-login/'))return new Response(LOGIN);
 return new Response(null,{status:302,headers:{location:'https://www.rednote.com/website-login/'+gate}});
},async()=>{
 const r=await worker.fetch(request(),staleEnv),d=await r.json();assert.equal(r.status,422);assert.equal(d.code,'REDNOTE_SERVER_VERIFICATION');assert.match(d.error,/máy chủ app/);assert.match(d.error,/Chưa thể kết luận/);assert.match(d.error,/chọn video từ máy/);assert.equal(d.downloadUrl,undefined);
}));
