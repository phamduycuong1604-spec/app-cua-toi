import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import worker,{shareUrl,validUrl,parseState,extractNote,translationProfile} from '../worker/index.js';

// Only return controls that exist in the served markup, as Safari does.
// Fabricating an element for every ID hid removed settings controls in setBusy.
async function actualPageContext(fetch){
 const html=await(await worker.fetch(new Request('https://site.test/'),{})).text();
 const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1])),elements=new Map();
 const get=id=>{
  if(!ids.has(id))return null;
  if(!elements.has(id)){
   const classes=new Set();
   elements.set(id,{value:'',checked:false,disabled:false,events:{},
    classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c),toggle(c,on){if(on??!classes.has(c))classes.add(c);else classes.delete(c);}},
    addEventListener(name,fn){this.events[name]=fn;},setAttribute(){},removeAttribute(){},pause(){},load(){},focus(){},showModal(){this.open=true;}});
  }
  return elements.get(id);
 };
 const dispatched=[];
 const context=vm.createContext({document:{getElementById:get},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},URL,File,Event,AbortSignal,AbortController,setTimeout,clearTimeout,navigator:{userAgent:'iPhone Safari'},dispatchEvent:e=>dispatched.push(e.type),PHAVideo1080:{normalise:async file=>({file,width:1080,height:1920,sourceWidth:1080,sourceHeight:1920,converted:false})},fetch});
 vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);
 return {context,get,dispatched};
}

test('Served markup permits download and dubbing locks without referencing removed caption controls',async()=>{
 const {context,get}=await actualPageContext(()=>{throw Error('Unexpected fetch');});
 assert.equal(get('saveCaptionShortcut'),null);assert.equal(get('launchChatGPT'),null);
 for(const enabled of [true,false]){
  context.PHADownload.lock(enabled);
  assert.equal(context.PHADownload.isBusy(),enabled);
  for(const id of ['extractBtn','resetBtn','chooseFile','domain','original','customRules'])assert.equal(get(id).disabled,enabled,id);
  assert.equal(get('results').classList.contains('busy'),enabled);
 }
 assert.equal(get('resultTag').textContent,'SẴN SÀNG');
});

test('Actual download submit reaches file loading, preserves the video on caption errors, and unlocks controls',async()=>{
 let requests=0;
 const bytes=new Uint8Array([0,0,0,16,102,116,121,112,105,115,111,109,0,0,0,0]);
 const {context,get,dispatched}=await actualPageContext(async url=>{
  if(url!=='/api/dub/fetch-video')throw Error('Load failed');requests++;
  assert.equal(get('extractBtn').disabled,true);assert.equal(get('chooseFile').disabled,true);
  return new Response(bytes,{headers:{'content-type':'video/mp4','content-length':String(bytes.length),'x-video-name':'test.mp4','x-rednote-title':encodeURIComponent('测试'),'x-rednote-caption':encodeURIComponent('主光'),'x-video-mode':'original','x-caption-complete':'1'}});
 });
 get('url').value='http://xhslink.com/o/9GTWdcFKg48';
 await get('extractForm').events.submit({preventDefault(){}});
 assert.equal(requests,1);assert.equal(context.PHADownload.getVideoFile().name,'test.mp4');
 assert.equal(context.PHADownload.getVideoFile().size,bytes.length);assert.equal(get('original').value,'主光');
 assert.deepEqual(dispatched,['pha-video-reset','pha-video-loaded']);assert.equal(context.PHADownload.isBusy(),false);
 assert.equal(get('extractBtn').disabled,false);assert.equal(get('chooseFile').disabled,false);
 assert.equal(get('resultTag').textContent,'VIDEO SẴN SÀNG');assert.match(get('status').textContent,/Video gốc đã sẵn sàng/);
 URL.revokeObjectURL(get('video').src);
});

test('Actual failed download releases the busy state',async()=>{
 const {context,get}=await actualPageContext(async()=>new Response(JSON.stringify({error:'Rednote chưa cho đọc bài'}),{status:502}));
 await get('extractForm').events.submit({preventDefault(){}});
 assert.equal(context.PHADownload.isBusy(),false);assert.equal(get('extractBtn').disabled,false);
 assert.match(get('status').textContent,/Rednote chưa cho đọc bài/);assert.equal(context.PHADownload.getVideoFile(),null);

});

test('Uses the official rednote domain when Xiaohongshu requires login and preserves signed access',async()=>{
 const originalFetch=globalThis.fetch,originalWarn=console.warn;console.warn=()=>{};
 const id='abcdefabcdefabcdefabcdef',requests=[];
 const html='<script>window.__INITIAL_STATE__='+JSON.stringify({noteData:{data:{noteData:{title:'original note',desc:'original caption',video:{consumer:{originVideoKey:'pre_post/original'}}}}}})+'</script>';
 const bytes=new Uint8Array([0,0,0,16,102,116,121,112,105,115,111,109,0,0,0,0]);
 globalThis.fetch=async(url)=>{
  requests.push(url);const u=new URL(url);
  if(u.hostname==='xhslink.com')return new Response(null,{status:302,headers:{location:'https://www.xiaohongshu.com/discovery/item/'+id+'?xsec_token=keep-me&xsec_source=app_share&app_platform=ios'}});
  if(u.hostname==='www.xiaohongshu.com')return u.pathname==='/login'?new Response('<script>window.__INITIAL_STATE__={"login":{}}</script>'):new Response(null,{status:302,headers:{location:'/login'}});
  if(u.hostname==='www.rednote.com'){assert.equal(u.searchParams.get('xsec_token'),'keep-me');assert.equal(u.searchParams.get('xsec_source'),'app_share');assert.equal(u.searchParams.has('app_platform'),false);return new Response(html)}
  return new Response(bytes,{headers:{'content-length':String(bytes.length)}});
 };
 try{
  const response=await worker.fetch(new Request('https://site.test/api/dub/fetch-video',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'https://xhslink.com/o/share'})}),{});
  assert.equal(response.status,200);assert.equal(response.headers.get('x-video-mode'),'original');assert.match(decodeURIComponent(response.headers.get('x-rednote-caption')),/original caption/);assert.ok(requests.some(url=>url.startsWith('https://www.rednote.com/')));assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);
 }finally{globalThis.fetch=originalFetch;console.warn=originalWarn}
});

test('Preserves the public share token when Rednote redirects a short link to login',async()=>{
 const originalFetch=globalThis.fetch,originalWarn=console.warn;console.warn=()=>{};
 const id='abcdefabcdefabcdefabcdef',requests=[];
 const html='<script>window.__INITIAL_STATE__='+JSON.stringify({noteData:{data:{noteData:{title:'public note',desc:'caption',video:{consumer:{originVideoKey:'pre_post/original'}}}}}})+'</script>';
 const bytes=new Uint8Array([0,0,0,16,102,116,121,112,105,115,111,109,0,0,0,0]);
 globalThis.fetch=async(url)=>{
  requests.push(url);const u=new URL(url);
  if(u.hostname==='xhslink.com')return new Response(null,{status:302,headers:{location:'https://www.xiaohongshu.com/discovery/item/'+id+'?xsec_token=keep-me&xsec_source=app_share'}});
  if(u.pathname.startsWith('/discovery/item'))return new Response(null,{status:302,headers:{location:'/login'}});
  if(u.pathname==='/login')return new Response('<script>window.__INITIAL_STATE__={"login":{}}</script>');
  if(u.pathname.startsWith('/explore/')){assert.equal(u.searchParams.get('xsec_token'),'keep-me');return new Response(html)}
  return new Response(bytes,{headers:{'content-length':String(bytes.length)}});
 };
 try{
  const response=await worker.fetch(new Request('https://site.test/api/dub/fetch-video',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'https://xhslink.com/o/share'})}),{});
  assert.equal(response.status,200);assert.equal(response.headers.get('x-video-mode'),'original');assert.ok(requests.some(url=>url.includes('/explore/')));await response.arrayBuffer();
 }finally{globalThis.fetch=originalFetch;console.warn=originalWarn}
});

test('Reports a Rednote login gate accurately without leaking share tokens',async()=>{
 const originalFetch=globalThis.fetch,originalWarn=console.warn;console.warn=()=>{};
 globalThis.fetch=async()=>new Response('<script>window.__INITIAL_STATE__={"login":{}}</script>');
 try{
  const response=await worker.fetch(new Request('https://site.test/api/dub/fetch-video',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'https://www.xiaohongshu.com/explore/abcdefabcdefabcdefabcdef?xsec_token=private-token'})}),{});
  assert.equal(response.status,422);const body=await response.text();assert.match(body,/REDNOTE_LOGIN_REQUIRED/);assert.match(body,/đăng nhập/);assert.doesNotMatch(body,/private-token|sourceDetails/);
 }finally{globalThis.fetch=originalFetch;console.warn=originalWarn}
});

test('Extracts a real share-text shape and rejects untrusted URLs',()=>{
 assert.equal(shareUrl('摄影教程，快来看看 https://xhslink.com/a/abc 。'),'https://xhslink.com/a/abc');
 for(const url of ['http://www.xiaohongshu.com/explore/a','https://xiaohongshu.com.attacker.test/a','https://user:pass@xhslink.com/a','https://127.0.0.1/a','https://xhslink.com:8443/a'])assert.throws(()=>validUrl(url));
});
test('HTTP sharing links are upgraded to HTTPS',()=>{assert.equal(shareUrl('http://xhslink.com/o/8GyX9Z394CN'),'https://xhslink.com/o/8GyX9Z394CN');assert.throws(()=>shareUrl('http://localhost/'));});
test('Embedded state preserves literal undefined inside captions and unicode',()=>{
 const html='<script>window.__INITIAL_STATE__={"note":{"noteDetailMap":{"a":{"note":{"title":"布光教学","desc":"undefined 字样\\n主光 45°，ISO 100","user":{"nickname":"老师"},"video":{"media":{"stream":{"h264":[{"masterUrl":"https://sns-video-bd.xhscdn.com/example.mp4","width":1080,"height":1920},{"masterUrl":"https://sns-video-bd.xhscdn.com/small.mp4","width":720,"height":1280}]}}}}}}},"empty":undefined};</script>';
 assert.equal(parseState(html).empty,null);
 const note=extractNote(html,'https://www.xiaohongshu.com/explore/abcdefabcdefabcdefabcdef');
 assert.equal(note.caption,'undefined 字样\n主光 45°，ISO 100');assert.equal(note.width,1080);assert.equal(note.author,'老师');
});
test('Image post keeps original caption while video stays unavailable',()=>{
 const html='<script>window.__INITIAL_STATE__='+JSON.stringify({note:{noteDetailMap:{a:{note:{title:'照片',desc:'真实说明',imageList:[]}}}}})+'</script>';
 assert.equal(extractNote(html,'https://www.xiaohongshu.com/explore/a').videoUrl,null);
});
test('Page has parseable JavaScript and Vietnamese UI; API rejects bad inputs',async()=>{
 const page=await worker.fetch(new Request('https://site.test/'),{});assert.equal(page.status,200);const html=await page.text();assert.match(html,/lang="vi"/);
 const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];new vm.Script(script);
 const req=(body,origin)=>new Request('https://site.test/api/extract',{method:'POST',headers:{'content-type':'application/json',...(origin?{origin}:{})},body:JSON.stringify(body)});
 assert.equal((await worker.fetch(req({url:'https://evil.test/a'}),{})).status,400);
 assert.equal((await worker.fetch(req({url:'https://xhslink.com/a'},'https://evil.test'),{})).status,403);
 assert.equal((await worker.fetch(new Request('https://site.test/api/download?url=https%3A%2F%2F127.0.0.1%2Fa'),{})).status,400);
});
test('Video download preserves Range, filename and streams after header timeout is cleared',async()=>{
 const originalFetch=globalThis.fetch,originalSetTimeout=globalThis.setTimeout,originalClearTimeout=globalThis.clearTimeout;
 let receivedRange,timerCleared=false,abort;
 globalThis.setTimeout=callback=>{abort=callback;return 123};
 globalThis.clearTimeout=id=>{if(id===123)timerCleared=true};
 globalThis.fetch=async (_url,options)=>{
  receivedRange=options.headers.range;
  return new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array([1,2,3,4]));controller.close()}}),{status:206,headers:{'content-type':'video/mp4','content-length':'4','content-range':'bytes 0-3/100','accept-ranges':'bytes'}});
 };
 try{
  const result=await worker.fetch(new Request('https://site.test/api/download?url=https%3A%2F%2Fsns-video-bd.xhscdn.com%2Fvideo.mp4&id=sample',{headers:{range:'bytes=0-3'}}),{});
  assert.equal(result.status,206);assert.equal(receivedRange,'bytes=0-3');assert.equal(timerCleared,true);
  assert.equal(result.headers.get('content-range'),'bytes 0-3/100');assert.match(result.headers.get('content-disposition'),/attachment; filename="PHA-Rednote-sample.mp4"/);
  assert.deepEqual([...new Uint8Array(await result.arrayBuffer())],[1,2,3,4]);
 }finally{globalThis.fetch=originalFetch;globalThis.setTimeout=originalSetTimeout;globalThis.clearTimeout=originalClearTimeout}
});
test('Downloads retry a temporary failure and send an open-ended Range by default',async()=>{
 const originalFetch=globalThis.fetch;let calls=0;
 globalThis.fetch=async (_url,options)=>{assert.equal(options.headers.range,'bytes=0-');if(++calls===1)throw new Error('temporary connection failure');return new Response('video-data',{headers:{'content-type':'video/mp4'}})};
 try{
  const result=await worker.fetch(new Request('https://site.test/api/download?url=https%3A%2F%2Fsns-video-bd.xhscdn.com%2Fvideo.mp4'),{});
  assert.equal(result.status,200);assert.equal(calls,2);assert.equal(await result.text(),'video-data');
 }finally{globalThis.fetch=originalFetch}
});
test('Failed download navigation returns recovery controls instead of raw JSON',async()=>{
 const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('timeout')};
 try{
  const result=await worker.fetch(new Request('https://site.test/api/download?url=https%3A%2F%2Fsns-video-bd.xhscdn.com%2Fvideo.mp4'),{});
  assert.equal(result.status,502);assert.match(result.headers.get('content-type'),/text\/html/);
  const page=await result.text();assert.match(page,/Thử tải lại/);assert.match(page,/Mở video trực tiếp để lưu/);assert.match(page,/Quay về PHA Rednote/);
 }finally{globalThis.fetch=originalFetch}
});
test('POST file flow falls back to desktop and returns verified bytes with title/caption',async()=>{
 const originalFetch=globalThis.fetch;let desktop=false,requests=0;
 const bytes=new Uint8Array([0,0,0,16,102,116,121,112,105,115,111,109,0,0,0,0]);
 const html='<script>window.__INITIAL_STATE__='+JSON.stringify({noteData:{data:{noteData:{title:'测试标题',desc:'主光 ISO 100',user:{nickName:'作者'},video:{consumer:{originVideoKey:'pre_post/source'},media:{stream:{h264:[{masterUrl:'http://sns-video-bd.xhscdn.com/test.mp4'}]}}}}}}})+'</script>';
 globalThis.fetch=async (url,options)=>{
  if(url.includes('xiaohongshu.com')){requests++;if(requests===1)return new Response('Login',{status:403});desktop=options.headers['user-agent'].includes('Windows');return new Response(html)}
  return new Response(bytes,{headers:{'content-length':String(bytes.length),'content-type':'application/octet-stream'}});
 };
 try{
  const request=new Request('https://site.test/api/dub/fetch-video',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'分享 http://www.xiaohongshu.com/explore/abcdefabcdefabcdefabcdef',preferOriginal:false})});
  const response=await worker.fetch(request,{});assert.equal(response.status,200);assert.equal(desktop,true);assert.equal(response.headers.get('content-type'),'video/mp4');
  assert.match(decodeURIComponent(response.headers.get('x-video-name')),/测试标题\.mp4/);assert.match(decodeURIComponent(response.headers.get('x-rednote-caption')),/主光 ISO 100/);assert.deepEqual([...new Uint8Array(await response.arrayBuffer())],[...bytes]);
 }finally{globalThis.fetch=originalFetch}
});
test('File flow rejects HTML disguised as a video response',async()=>{
 const originalFetch=globalThis.fetch;
 const html='<script>window.__INITIAL_STATE__='+JSON.stringify({note:{noteDetailMap:{a:{note:{title:'test',desc:'test',video:{consumer:{originVideoKey:'pre_post/test'},media:{stream:{h264:[{masterUrl:'https://sns-video-bd.xhscdn.com/test.mp4'}]}}}}}}}})+'</script>';
 globalThis.fetch=async url=>url.includes('xiaohongshu.com')?new Response(html):new Response('<html>login</html>',{headers:{'content-type':'video/mp4'}});
 try{
  const response=await worker.fetch(new Request('https://site.test/api/dub/fetch-video',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'https://www.xiaohongshu.com/explore/test',preferOriginal:false})}),{});
  assert.equal(response.status,502);assert.match((await response.json()).error,/không phải MP4/);
 }finally{globalThis.fetch=originalFetch}
});
test('Original mode never silently falls back to a shared stream',async()=>{
 const originalFetch=globalThis.fetch;let videoRequested=false;
 const html='<script>window.__INITIAL_STATE__='+JSON.stringify({note:{noteDetailMap:{a:{note:{title:'test',desc:'test',video:{media:{stream:{h264:[{masterUrl:'https://sns-video-bd.xhscdn.com/shared.mp4'}]}}}}}}}})+'</script>';
 globalThis.fetch=async url=>{if(url.includes('shared.mp4'))videoRequested=true;return new Response(html)};
 try{
  const response=await worker.fetch(new Request('https://site.test/api/dub/fetch-video',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'https://www.xiaohongshu.com/explore/test'})}),{});
  assert.equal(response.status,422);assert.equal(videoRequested,false);assert.match((await response.json()).error,/Không tìm được bản gốc/);
 }finally{globalThis.fetch=originalFetch}
});
test('Large originals return a server download attachment without buffering or replacing them',async()=>{
 const originalFetch=globalThis.fetch;const requests=[];
 const bytes=new Uint8Array([0,0,0,16,102,116,121,112,105,115,111,109,0,0,0,0]);
 const html='<script>window.__INITIAL_STATE__='+JSON.stringify({note:{noteDetailMap:{a:{note:{title:'original',desc:'caption',video:{consumer:{originVideoKey:'spectrum/original'},media:{stream:{h264:[{masterUrl:'https://sns-video-bd.xhscdn.com/shared.mp4'}]}}}}}}}})+'</script>';
 globalThis.fetch=async (url,options)=>{requests.push(url);if(url.includes('xiaohongshu.com'))return new Response(html);assert.equal(options.headers.range,'bytes=0-65535');return new Response(bytes,{status:206,headers:{'content-range':'bytes 0-15/1900000000','content-length':'16'}})};
 try{
  const response=await worker.fetch(new Request('https://site.test/api/dub/fetch-video',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'https://www.xiaohongshu.com/explore/test'})}),{});
  assert.equal(response.status,200);const result=await response.json();assert.equal(result.delivery,'attachment');assert.equal(result.size,1900000000);assert.equal(result.mode,'original');assert.match(result.downloadUrl,/kind=original/);assert.equal(requests.some(url=>url.includes('shared.mp4')),false);
 }finally{globalThis.fetch=originalFetch}
});

test('Starting a new failed Rednote download resets the video studio instead of leaving its previous file',async()=>{
 const html=await(await worker.fetch(new Request('https://site.test/'),{})).text(),script=html.match(/<script>([\s\S]*?)<\/script>/)[1],elements=new Map(),dispatched=[];
 const get=id=>{if(!elements.has(id))elements.set(id,{value:'',checked:false,events:{},classList:{toggle(){},add(){},remove(){}},addEventListener(name,fn){this.events[name]=fn;},setAttribute(){},removeAttribute(){},pause(){}});return elements.get(id);};
 const context=vm.createContext({document:{getElementById:get},localStorage:{getItem:()=>null,setItem(){}},URL,AbortSignal,AbortController,Event,dispatchEvent:e=>dispatched.push(e.type),setTimeout,clearTimeout,fetch:async()=>new Response(JSON.stringify({error:'Rednote login'}),{status:502})});
 vm.runInContext(script,context);vm.runInContext("videoFile={name:'old.mp4'};",context);await get('extractForm').events.submit({preventDefault(){}});assert.equal(vm.runInContext('videoFile',context),null);assert.deepEqual(dispatched,['pha-video-reset']);assert.match(get('status').textContent,/Rednote login/);
});
test('Even an explicit shared-stream request downloads only the original source',async()=>{
 const oldFetch=globalThis.fetch,requests=[];
 const media='https://sns-video-bd.xhscdn.com/spectrum/original';
 const page='<script>window.__INITIAL_STATE__='+JSON.stringify({note:{noteDetailMap:{a:{note:{title:'Shared',desc:'Caption',video:{consumer:{originVideoKey:'spectrum/original'},media:{stream:{h264:[{masterUrl:media}]}}}}}}}})+'</script>';
 const bytes=new Uint8Array([0,0,0,16,102,116,121,112,105,115,111,109,0,0,0,0]);
 globalThis.fetch=async(url,init)=>{requests.push([url,init?.headers?.range]);if(url.includes('xiaohongshu.com'))return new Response(page);assert.equal(url,media);return new Response(bytes,{status:206,headers:{'content-range':'bytes 0-15/800000000','content-length':'16'}})};
 try{
  const r=await worker.fetch(new Request('https://site.test/api/dub/fetch-video',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'https://www.xiaohongshu.com/explore/test',preferOriginal:false})}),{});
  assert.equal(r.status,200);const data=await r.json();assert.equal(data.delivery,'attachment');assert.equal(data.mode,'original');assert.equal(data.size,800000000);
  const download=new URL(data.downloadUrl,'https://site.test');assert.equal(download.searchParams.get('url'),media);assert.equal(download.searchParams.get('kind'),'original');
  assert.deepEqual(requests.filter(([url])=>url===media).map(([,range])=>range),['bytes=0-65535']);
 }finally{globalThis.fetch=oldFetch}
});

test('An oversized HTML response cannot become a video attachment',async()=>{
 const oldFetch=globalThis.fetch;
 const page='<script>window.__INITIAL_STATE__='+JSON.stringify({note:{noteDetailMap:{a:{note:{title:'Invalid',video:{consumer:{originVideoKey:'pre_post/test'},media:{stream:{h264:[{masterUrl:'https://sns-video-bd.xhscdn.com/shared.mp4'}]}}}}}}}})+'</script>';
 globalThis.fetch=async url=>url.includes('xiaohongshu.com')?new Response(page):new Response('<html>login required</html>',{headers:{'content-length':'800000000'}});
 try{const r=await worker.fetch(new Request('https://site.test/api/dub/fetch-video',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'https://www.xiaohongshu.com/explore/test',preferOriginal:false})}),{});assert.equal(r.status,502);assert.match((await r.json()).error,/không phải MP4/)}finally{globalThis.fetch=oldFetch}
});

test('Actual phone UI receives a large shared attachment, keeps caption and unlocks without buffering a Blob',async()=>{
 const {context,get}=await actualPageContext(async url=>{
  assert.equal(url,'/api/dub/fetch-video');return Response.json({delivery:'attachment',title:'Shared',caption:'主光',sourceUrl:'https://www.xiaohongshu.com/explore/test',size:800000000,mode:'stream',downloadUrl:'/api/download?kind=stream',previewUrl:'/api/download?kind=stream&inline=1'});
 });
 get('url').value='http://xhslink.com/o/9Q3h3w3Sn6';
 await get('extractForm').events.submit({preventDefault(){}});
 assert.equal(context.PHADownload.getVideoFile(),null);assert.equal(context.PHADownload.isBusy(),false);assert.equal(get('extractBtn').disabled,false);
 assert.equal(get('download').classList.contains('hidden'),true);assert.match(get('download').textContent,/bản chia sẻ/);assert.doesNotMatch(get('download').textContent,/gốc/);
 assert.match(get('videoMessage').textContent,/Chưa tải vào app/);assert.equal(get('original').value,'主光');assert.equal(get('translated'),null);
});

test('Original caption only: no translation UI, provider, Shortcut or API request',async()=>{
 const {context,get}=await actualPageContext(()=>assert.fail('No translation requests allowed'));
 for(const id of ['translateBtn','translated','settingsBtn','apiKey','saveSettings','shortcutName','launchChatGPT'])assert.equal(get(id),null);
 const html=await(await worker.fetch(new Request('https://site.test/'),{})).text();assert.match(html,/Lấy video gốc → Dịch & lồng tiếng/);assert.doesNotMatch(html,/PHAChatGPT|shortcuts:\/\/|translate.googleapis|doTranslate|browserTranslate/);
 assert.equal((await worker.fetch(new Request('https://site.test/api/translate',{method:'POST',body:'{}'}),{})).status,404);
 assert.match(context.PHADownload.getProfile().label,/Pha Light/);
});

test('Large download enters the main app and dispatches its file to Studio, without any caption translation call',async()=>{
 const {mkdtemp,open,rm}=await import('node:fs/promises'),{openAsBlob}=await import('node:fs');
 const temp=await mkdtemp('/tmp/pha-video-handoff-');let file;
 try{
  const fd=await open(temp+'/source.mp4','w');await fd.truncate(678433035);await fd.write(new Uint8Array([0,0,0,16,102,116,121,112,105,115,111,109]),0,12,0);await fd.close();
  file=new File([await openAsBlob(temp+'/source.mp4')],'source.mp4',{type:'video/mp4'});
  const {context,get,dispatched}=await actualPageContext(async url=>{assert.equal(url,'/api/dub/fetch-video');return Response.json({delivery:'attachment',title:'Title',caption:'原始标题\n原始说明',mode:'original',size:file.size,downloadUrl:'/api/download?kind=original',sourceUrl:'https://xhslink.com/o/test'})});
  context.PHAVideoDownload={async attachment(data,{onProgress}){assert.equal(data.size,678433035);onProgress(0,data.size);onProgress(data.size,data.size);return file},release:async()=>{}};
  await get('extractForm').events.submit({preventDefault(){}});
  assert.equal(context.PHADownload.getVideoFile(),file);assert.equal(context.PHADownload.isBusy(),false);assert.deepEqual(dispatched,['pha-video-reset','pha-video-loaded']);
  assert.equal(get('original').value,'原始标题\n原始说明');assert.match(get('videoMessage').textContent,/Video gốc đã vào/);assert.equal(get('download').href,'#');assert.equal(get('translated'),null);
  URL.revokeObjectURL(get('video').src);
 }finally{await rm(temp,{recursive:true,force:true})}
});

test('Original reaches Studio immediately; 1080p encoding only starts when the user requests a saved copy',async()=>{
 const bytes=new Uint8Array([0,0,0,16,102,116,121,112,105,115,111,109,0,0,0,0]);let finish,scrolled=false,encodes=0;
 const {context,get,dispatched}=await actualPageContext(async(_url,init)=>{assert.equal(JSON.parse(init.body).preferOriginal,true);return new Response(bytes,{headers:{'content-type':'video/mp4','content-length':'16','x-video-mode':'original','x-caption-complete':'1','x-rednote-caption':encodeURIComponent('原始说明')}})});
 context.PHAVideo1080.normalise=async file=>{encodes++;await new Promise(resolve=>finish=resolve);return {file:new File(['1080p'],'output-1080p.mp4'),width:1080,height:1920,sourceWidth:2160,sourceHeight:3840,converted:true}};
 get('videoStudio').scrollIntoView=()=>{assert.equal(context.PHADownload.isBusy(),false);scrolled=true};
 await get('extractForm').events.submit({preventDefault(){}});
 const original=context.PHADownload.getVideoFile();assert.ok(original);assert.equal(encodes,0);assert.equal(scrolled,true);assert.deepEqual(dispatched,['pha-video-reset','pha-video-loaded']);assert.equal(get('download').href,'#');
 const pending=get('download').events.click({preventDefault(){}});await new Promise(resolve=>setImmediate(resolve));assert.equal(encodes,1);assert.equal(context.PHADownload.isBusy(),true);assert.equal(context.PHADownload.getVideoFile(),original);
 finish();await pending;assert.equal(context.PHADownload.isBusy(),false);assert.equal(context.PHADownload.getVideoFile(),original);assert.equal(get('download').download,'output-1080p.mp4');assert.match(get('download').href,/blob:/);assert.deepEqual(dispatched,['pha-video-reset','pha-video-loaded']);
 URL.revokeObjectURL(get('video').src);URL.revokeObjectURL(get('download').href);
});
test('Failed saved-copy encoding leaves the original in Studio and never exposes it as a 1080p download',async()=>{
 let clicked=false,released=false;
 const {context,get,dispatched}=await actualPageContext(async()=>Response.json({delivery:'attachment',mode:'original',caption:'原始说明',title:'Title',size:678433035,downloadUrl:'/api/download?kind=original'}));
 const original=new File(['source'],'4k.mp4');context.PHAVideoDownload={attachment:async()=>original,release:async()=>{released=true}};
 context.PHAVideo1080.normalise=async()=>{throw Error('Không thể mã hóa 1080p')};context.navigator.userAgent='Desktop';get('download').click=()=>{clicked=true};
 await get('extractForm').events.submit({preventDefault(){}});assert.equal(clicked,false);released=false;
 await get('download').events.click({preventDefault(){}});
 assert.equal(context.PHADownload.getVideoFile(),original);assert.equal(released,false);assert.equal(get('original').value,'原始说明');assert.equal(get('download').href,'#');assert.equal(get('openVideo').classList.contains('hidden'),true);assert.deepEqual(dispatched,['pha-video-reset','pha-video-loaded']);assert.match(get('status').textContent,/Không thể mã hóa/);assert.equal(context.PHADownload.isBusy(),false);URL.revokeObjectURL(get('video').src);
});
// Dán vào CUỐI file scripts/core.test.mjs (6 test mới)
test('Studio link box uses the main download path and keeps caption, author and source',async()=>{
 const bytes=new Uint8Array([0,0,0,16,102,116,121,112,105,115,111,109,0,0,0,0]);let body;
 const {context,get,dispatched}=await actualPageContext(async(url,init)=>{
  assert.equal(url,'/api/dub/fetch-video');body=JSON.parse(init.body);
  return new Response(bytes,{headers:{'content-type':'video/mp4','content-length':'16','x-video-name':'a.mp4','x-video-mode':'original','x-caption-complete':'1','x-rednote-caption':encodeURIComponent('原始说明'),'x-rednote-author':encodeURIComponent('作者'),'x-rednote-source':encodeURIComponent('https://www.xiaohongshu.com/explore/abcdefabcdefabcdefabcdef')}});
 });
 const result=await context.PHADownload.fetchLink('分享 http://xhslink.com/o/abc');
 assert.equal(result.ok,true);assert.equal(body.url,'分享 http://xhslink.com/o/abc');
 assert.equal(get('original').value,'原始说明');assert.equal(get('author').textContent,'Tác giả: 作者');
 assert.equal(context.PHADownload.getVideoFile().name,'a.mp4');assert.equal(context.PHADownload.isBusy(),false);
 assert.deepEqual(dispatched,['pha-video-reset','pha-video-loaded']);
 URL.revokeObjectURL(get('video').src);
});

test('A phone that can write to app storage gets every original, even small ones, as a disk download instead of RAM bytes',async()=>{
 const originalFetch=globalThis.fetch;const requests=[];
 const bytes=new Uint8Array([0,0,0,16,102,116,121,112,105,115,111,109,0,0,0,0]);
 const html='<script>window.__INITIAL_STATE__='+JSON.stringify({note:{noteDetailMap:{a:{note:{title:'small',desc:'caption',user:{nickname:'作者'},video:{consumer:{originVideoKey:'spectrum/small'}}}}}}})+'</script>';
 globalThis.fetch=async(url,options)=>{requests.push([url,options?.headers?.range]);if(url.includes('xiaohongshu.com'))return new Response(html);if(options?.headers?.range==='bytes=0-')return new Response(bytes,{headers:{'content-length':'16'}});return new Response(bytes,{status:206,headers:{'content-range':'bytes 0-15/30000000','content-length':'16'}})};
 try{
  const disk=await worker.fetch(new Request('https://site.test/api/dub/fetch-video',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'https://www.xiaohongshu.com/explore/test',preferOriginal:true,delivery:'attachment'})}),{});
  assert.equal(disk.status,200);const data=await disk.json();assert.equal(data.delivery,'attachment');assert.equal(data.size,30000000);assert.equal(data.mode,'original');assert.equal(data.caption,'small\n\ncaption');assert.equal(data.author,'作者');
  assert.deepEqual(requests.filter(([url])=>url.includes('xhscdn')).map(([,range])=>range),['bytes=0-65535']);
  requests.length=0;
  const memory=await worker.fetch(new Request('https://site.test/api/dub/fetch-video',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'https://www.xiaohongshu.com/explore/test',preferOriginal:true,delivery:'stream'})}),{});
  assert.equal(memory.status,200);assert.match(memory.headers.get('content-type'),/video\/mp4/);await memory.arrayBuffer();
 }finally{globalThis.fetch=originalFetch}
});

test('Phone page asks for a disk download when app storage works, and falls back to the old path only when it does not',async()=>{
 for(const disk of [true,false]){
  let sent;const bytes=new Uint8Array([0,0,0,16,102,116,121,112,105,115,111,109,0,0,0,0]),stored=new File([bytes],'small.mp4',{type:'video/mp4'});let attached=0;
  const {context,get}=await actualPageContext(async(_url,init)=>{sent=JSON.parse(init.body);
   if(sent.delivery==='attachment')return Response.json({delivery:'attachment',title:'Small',caption:'Small\n\n原始说明',author:'作者',sourceUrl:'https://www.xiaohongshu.com/explore/test',mode:'original',size:16,downloadUrl:'/api/download?kind=original'});
   return new Response(bytes,{headers:{'content-type':'video/mp4','content-length':'16','x-video-name':'small.mp4','x-video-mode':'original','x-caption-complete':'1','x-rednote-caption':encodeURIComponent('Small\n\n原始说明')}});
  });
  context.PHAVideoDownload={canUseDisk:async()=>disk,attachment:async data=>{attached++;assert.equal(data.size,16);return stored},release:async()=>{},CONCURRENCY:4};
  get('url').value='https://xhslink.com/o/small';
  await get('extractForm').events.submit({preventDefault(){}});
  assert.equal(sent.delivery,disk?'attachment':'stream');assert.equal(attached,disk?1:0);
  assert.equal(get('original').value,'Small\n\n原始说明');assert.equal(context.PHADownload.getVideoFile().size,16);assert.equal(context.PHADownload.isBusy(),false);
  if(disk)assert.equal(context.PHADownload.getVideoFile(),stored);
  URL.revokeObjectURL(get('video').src);
 }
});

test('The subtitle font comes from a fixed GitHub version, and notes no longer carry the unused candidate list',async()=>{
 const originalFetch=globalThis.fetch;let requested;
 globalThis.fetch=async url=>{requested=url;return new Response(new Uint8Array([0,1,0,0]))};
 try{
  const r=await worker.fetch(new Request('https://site.test/dub/remote/NotoSans.ttf'),{});
  assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'font/ttf');
  assert.match(requested,/\/notofonts\/noto-fonts\/ffebf8c1ee449e544955a7e813c54f9b73848eac\/hinted\/ttf\/NotoSans\/NotoSans-Regular\.ttf$/);assert.doesNotMatch(requested,/\/main\//);
 }finally{globalThis.fetch=originalFetch}
 const html='<script>window.__INITIAL_STATE__='+JSON.stringify({note:{noteDetailMap:{a:{note:{title:'t',desc:'d',video:{consumer:{originVideoKey:'pre_post/x'},media:{stream:{h264:[{masterUrl:'https://sns-video-bd.xhscdn.com/a.mp4'}]}}}}}}}})+'</script>';
 const note=extractNote(html,'https://www.xiaohongshu.com/explore/abcdefabcdefabcdefabcdef');
 assert.equal('videoCandidates' in note,false);assert.equal(note.originalVideoUrl,'https://sns-video-bd.xhscdn.com/pre_post/x');assert.equal(note.videoUrl,'https://sns-video-bd.xhscdn.com/a.mp4');
});

test('Reading a blocked Rednote post stops within the server time budget and reports the real reason, before the phone gives up at 90 seconds',async()=>{
 const originalFetch=globalThis.fetch,originalNow=Date.now,originalWarn=console.warn;console.warn=()=>{};
 let clock=originalNow(),calls=0;Date.now=()=>clock;
 globalThis.fetch=async()=>{calls++;clock+=25000;return new Response('blocked',{status:403})};
 try{
  const r=await worker.fetch(new Request('https://site.test/api/extract',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'https://www.xiaohongshu.com/explore/abcdefabcdefabcdefabcdef'})}),{});
  const body=await r.json();
  assert.equal(r.status,502);assert.match(body.error,/Rednote chưa cho đọc bài \(403\)/);
  assert.equal(calls,3);assert.ok(clock-originalNow()<90000);
 }finally{globalThis.fetch=originalFetch;Date.now=originalNow;console.warn=originalWarn}
});

test('When every Rednote attempt times out, the phone gets a clear "too slow" message instead of a generic connection error',async()=>{
 const originalFetch=globalThis.fetch,originalNow=Date.now;
 let clock=originalNow();Date.now=()=>clock;
 globalThis.fetch=async()=>{clock+=21000;throw new DOMException('The operation was aborted.','AbortError')};
 try{
  const r=await worker.fetch(new Request('https://site.test/api/extract',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'https://xhslink.com/o/slow'})}),{});
  assert.equal(r.status,504);assert.match((await r.json()).error,/quá chậm/);
 }finally{globalThis.fetch=originalFetch;Date.now=originalNow}
});

test('A successful save logs which storage method was used and whether extra bytes were cut',async()=>{
 const logs=[];const file=new File([new Uint8Array(16)],'a.mp4',{type:'video/mp4'});file.phaStorage={kind:'writable',trimmed:777};
 const {context,get}=await actualPageContext(async()=>Response.json({delivery:'attachment',title:'Gốc',caption:'c',mode:'original',size:16,downloadUrl:'/api/download?kind=original'}));
 context.PHARunLog={add:(stage,message)=>logs.push(stage+' · '+message)};context.PHAVideoDownload={attachment:async()=>file,release:async()=>{},CONCURRENCY:4};
 await get('extractForm').events.submit({preventDefault(){}});
 assert.ok(logs.some(l=>/Hoàn tất · 16 byte · cách ghi: writable · đã cắt 777 byte thừa/.test(l)),logs.join('\n'));
 URL.revokeObjectURL(get('video').src);
});

test('When saving into the app fails, an original still gets a button to download it straight to Files',async()=>{
 for(const [label,failure] of [['broken save',Error('Video lưu chưa đủ dung lượng (đã lưu 671088640 / 678433035 byte · cách ghi: writable).')],['over 2 GB',Error('Video vượt giới hạn hai GB cho xử lý trên điện thoại.')]]){
  const logs=[];const size=label==='over 2 GB'?2563157945:678433035;
  const {context,get}=await actualPageContext(async()=>Response.json({delivery:'attachment',title:'Gốc',caption:'原始说明',mode:'original',size,downloadUrl:'/api/download?url=x&kind=original',sourceUrl:'https://xhslink.com/o/x'}));
  context.PHARunLog={add:(stage,message)=>logs.push(stage+' · '+message)};
  context.PHAVideoDownload={attachment:async()=>{throw failure},release:async()=>{},CONCURRENCY:4};
  await get('extractForm').events.submit({preventDefault(){}});
  assert.equal(get('download').classList.contains('hidden'),false,label);assert.equal(get('download').href,'/api/download?url=x&kind=original');
  assert.match(get('download').textContent,/Tải video gốc về Tệp/);assert.match(get('videoMessage').textContent,/tải video gốc về Tệp/);
  assert.ok(logs.some(l=>l.includes('Đã hiện nút tải video gốc')),label);assert.equal(get('original').value,'原始说明');assert.equal(context.PHADownload.isBusy(),false);
 }
});

// ---- Phần 10: ưu tiên bản ≤1080p Rednote khi nhẹ hơn bản gốc (xử lý trên điện thoại nhanh hơn) ----
const P10_MP4=new Uint8Array([0,0,0,16,102,116,121,112,105,115,111,109,0,0,0,0]);
function p10Page({originKey='spectrum/goc15phut',stream={}}={}){return '<script>window.__INITIAL_STATE__='+JSON.stringify({note:{noteDetailMap:{a:{note:{title:'Video 15 phút',desc:'Caption gốc',user:{nickname:'作者'},video:{consumer:{originVideoKey:originKey},media:{stream}}}}}}})+'</script>';}
const P10_ORIGIN='https://sns-video-bd.xhscdn.com/spectrum/goc15phut',P10_1080='https://sns-video-bd.xhscdn.com/stream/1080.mp4',P10_4K='https://sns-video-bd.xhscdn.com/stream/4k.mp4',P10_H265='https://sns-video-bd.xhscdn.com/stream/1080-h265.mp4',P10_BACKUP='https://sns-video-hw.xhscdn.com/stream/1080-backup.mp4';
// Giả lập Rednote: trang bài + CDN video trả đúng tổng dung lượng cho từng link
function p10Fetch(page,sizes,{blocked=[]}={}){
 const requests=[];
 const fn=async(url,init)=>{
  requests.push([url,init?.headers?.range]);
  if(url.includes('xiaohongshu.com'))return new Response(page);
  if(blocked.includes(url))return new Response('forbidden',{status:403});
  const total=sizes[url];if(!total)return new Response('not found',{status:404});
  const range=init?.headers?.range||'bytes=0-';
  if(range==='bytes=0-')return new Response(P10_MP4,{headers:{'content-length':String(P10_MP4.length)}});
  return new Response(P10_MP4,{status:206,headers:{'content-range':'bytes 0-15/'+total,'content-length':'16'}});
 };
 fn.requests=requests;return fn;
}
async function p10Post(body){return worker.fetch(new Request('https://site.test/api/dub/fetch-video',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:'https://www.xiaohongshu.com/explore/abcdefabcdefabcdefabcdef',preferOriginal:true,...body})}),{});}
const p10Streams={h264:[{masterUrl:P10_4K,width:2160,height:3840,avgBitrate:20000000},{masterUrl:P10_1080,width:1080,height:1920,avgBitrate:4000000}],h265:[{masterUrl:P10_H265,width:1080,height:1920,avgBitrate:3000000}]};

test('A 15-minute original of 3.5 GB is swapped for Rednote\'s own 1080p H.264 copy, so the phone downloads about 400 MB',async()=>{
 const old=globalThis.fetch;globalThis.fetch=p10Fetch(p10Page({stream:p10Streams}),{[P10_ORIGIN]:3500000000,[P10_1080]:420000000,[P10_4K]:3400000000,[P10_H265]:300000000});
 try{
  const r=await p10Post({delivery:'attachment'});assert.equal(r.status,200);const d=await r.json();
  assert.equal(d.delivery,'attachment');assert.equal(d.mode,'p1080');assert.equal(d.size,420000000);assert.equal(d.originalSize,3500000000);
  assert.equal(d.width,1080);assert.equal(d.height,1920);assert.equal(d.codec,'h264');assert.match(d.reason,/Bản gốc 3500 MB/);
  const dl=new URL(d.downloadUrl,'https://site.test');assert.equal(dl.searchParams.get('url'),P10_1080);assert.equal(dl.searchParams.get('kind'),'p1080');
  assert.equal(d.caption,'Video 15 phút\n\nCaption gốc');
  const media=globalThis.fetch.requests.filter(([u])=>u.includes('xhscdn'));assert.deepEqual(media.map(([u,r])=>[u,r]),[[P10_ORIGIN,'bytes=0-65535'],[P10_1080,'bytes=0-65535']]);
 }finally{globalThis.fetch=old}
});
test('A 1-minute 4K original of 80 MB also switches to the lighter 20 MB 1080p copy',async()=>{
 const old=globalThis.fetch;globalThis.fetch=p10Fetch(p10Page({stream:p10Streams}),{[P10_ORIGIN]:80000000,[P10_1080]:20000000});
 try{
  const d=await(await p10Post({delivery:'attachment'})).json();
  assert.equal(d.mode,'p1080');assert.equal(d.size,20000000);assert.equal(d.originalSize,80000000);assert.match(d.reason,/Bản gốc 80 MB/);
 }finally{globalThis.fetch=old}
});
test('The original is kept when it is not heavier than the 1080p copy (equal or lighter)',async()=>{
 for(const [size,mode] of [[20000000,'original'],[15000000,'original'],[20000001,'p1080']]){
  const old=globalThis.fetch;globalThis.fetch=p10Fetch(p10Page({stream:p10Streams}),{[P10_ORIGIN]:size,[P10_1080]:20000000});
  try{assert.equal((await(await p10Post({delivery:'attachment'})).json()).mode,mode,String(size))}finally{globalThis.fetch=old}
 }
});
test('A heavy original with no copy at 1080p or below keeps the original and says why',async()=>{
 const old=globalThis.fetch;globalThis.fetch=p10Fetch(p10Page({stream:{h264:[{masterUrl:P10_4K,width:2160,height:3840}]}}),{[P10_ORIGIN]:900000000,[P10_4K]:850000000});
 try{const d=await(await p10Post({delivery:'attachment'})).json();assert.equal(d.mode,'original');assert.equal(d.size,900000000);assert.match(d.reason,/Không có bản 1080p/);}finally{globalThis.fetch=old}
});
test('If the main 1080p link is refused, its backup link from Rednote is used',async()=>{
 const old=globalThis.fetch;globalThis.fetch=p10Fetch(p10Page({stream:{h264:[{masterUrl:P10_1080,backupUrls:[P10_BACKUP],width:1080,height:1920}]}}),{[P10_ORIGIN]:2000000000,[P10_1080]:400000000,[P10_BACKUP]:400000000},{blocked:[P10_1080]});
 try{const d=await(await p10Post({delivery:'attachment'})).json();assert.equal(d.mode,'p1080');assert.equal(new URL(d.downloadUrl,'https://site.test').searchParams.get('url'),P10_BACKUP);}finally{globalThis.fetch=old}
});
test('When the only 1080p copy is H.265, it is used instead of the 4K H.264 copy',async()=>{
 const old=globalThis.fetch;globalThis.fetch=p10Fetch(p10Page({stream:{h264:[{masterUrl:P10_4K,width:2160,height:3840}],h265:[{masterUrl:P10_H265,width:1080,height:1920}]}}),{[P10_ORIGIN]:2000000000,[P10_4K]:1900000000,[P10_H265]:300000000});
 try{const d=await(await p10Post({delivery:'attachment'})).json();assert.equal(d.mode,'p1080');assert.equal(d.codec,'h265');assert.equal(new URL(d.downloadUrl,'https://site.test').searchParams.get('url'),P10_H265);}finally{globalThis.fetch=old}
});
test('A browser without app storage still gets the small 1080p copy as direct bytes, labelled as 1080p',async()=>{
 const old=globalThis.fetch;globalThis.fetch=p10Fetch(p10Page({stream:p10Streams}),{[P10_ORIGIN]:3000000000,[P10_1080]:16});
 try{const r=await p10Post({delivery:'stream'});assert.equal(r.status,200);assert.equal(r.headers.get('x-video-mode'),'p1080');assert.match(r.headers.get('content-type'),/video\/mp4/);assert.deepEqual(new Uint8Array(await r.arrayBuffer()),P10_MP4);}finally{globalThis.fetch=old}
});
test('A 1080p download that needs a fresh link mid-way gets the 1080p copy again, not the heavy original',async()=>{
 const expired='https://sns-video-bd.xhscdn.com/stream/expired.mp4';
 const old=globalThis.fetch;globalThis.fetch=p10Fetch(p10Page({stream:p10Streams}),{[P10_ORIGIN]:3500000000,[P10_1080]:420000000},{blocked:[expired]});
 try{
  const r=await worker.fetch(new Request('https://site.test/api/download?url='+encodeURIComponent(expired)+'&id=x&kind=p1080&source='+encodeURIComponent('https://www.xiaohongshu.com/explore/abcdefabcdefabcdefabcdef'),{headers:{range:'bytes=8388608-16777215'}}),{});
  assert.equal(r.status,206);const last=globalThis.fetch.requests.at(-1);assert.deepEqual(last,[P10_1080,'bytes=8388608-16777215']);
  assert.equal(globalThis.fetch.requests.some(([u,range])=>u===P10_ORIGIN&&range==='bytes=8388608-16777215'),false);
 }finally{globalThis.fetch=old}
});
test('On the phone, a 1080p copy goes straight into the dubbing section and the log says why',async()=>{
 const logs=[],stored=new File([P10_MP4],'Video 15 phút.mp4',{type:'video/mp4'});let attached;
 const {context,get,dispatched}=await actualPageContext(async()=>Response.json({delivery:'attachment',title:'Video 15 phút',caption:'Video 15 phút\n\nCaption gốc',author:'作者',sourceUrl:'https://xhslink.com/o/x',size:420000000,mode:'p1080',originalSize:3500000000,width:1080,height:1920,codec:'h264',reason:'Bản gốc 3500 MB quá nặng',downloadUrl:'/api/download?kind=p1080'}));
 context.PHARunLog={add:(s,m)=>logs.push(s+' · '+m)};context.PHAVideoDownload={canUseDisk:async()=>true,attachment:async d=>{attached=d;return stored},release:async()=>{},CONCURRENCY:4};
 get('url').value='https://xhslink.com/o/x';await get('extractForm').events.submit({preventDefault(){}});
 assert.equal(attached.mode,'p1080');assert.equal(context.PHADownload.getVideoFile(),stored);assert.deepEqual(dispatched,['pha-video-reset','pha-video-loaded']);
 assert.match(get('videoMessage').textContent,/bản 1080p của Rednote/);assert.equal(get('original').value,'Video 15 phút\n\nCaption gốc');assert.equal(context.PHADownload.isBusy(),false);
 assert.ok(logs.some(l=>/Bản gốc 3500 MB quá nặng → dùng bản 1080p của Rednote \(1080×1920 · h264\)/.test(l)),logs.join('\n'));
 assert.ok(logs.some(l=>/Bản 1080p 420000000 byte/.test(l)));assert.ok(logs.some(l=>/đưa bản 1080p sang Dịch/.test(l)));
 URL.revokeObjectURL(get('video').src);
});
test('If saving the 1080p copy into the app fails, the phone offers to download that 1080p copy to Files',async()=>{
 const {context,get}=await actualPageContext(async()=>Response.json({delivery:'attachment',title:'t',caption:'c',size:420000000,mode:'p1080',reason:'Bản gốc 3500 MB quá nặng',width:1080,height:1920,downloadUrl:'/api/download?kind=p1080'}));
 context.PHAVideoDownload={canUseDisk:async()=>true,attachment:async()=>{throw Error('Video lưu chưa đủ dung lượng (đã lưu 1 / 2 byte · cách ghi: writable).')},release:async()=>{},CONCURRENCY:4};
 await get('extractForm').events.submit({preventDefault(){}});
 assert.equal(get('download').classList.contains('hidden'),false);assert.match(get('download').textContent,/Tải video 1080p về Tệp · 420 MB/);assert.match(get('videoMessage').textContent,/tải video 1080p về Tệp/);
});
test('The phone log shows how many stalled parts were downloaded again',async()=>{
 const logs=[],file=new File([new Uint8Array(16)],'a.mp4',{type:'video/mp4'});
 const {context,get}=await actualPageContext(async()=>Response.json({delivery:'attachment',title:'t',caption:'c',mode:'original',size:64*1048576,downloadUrl:'/api/download?kind=original'}));
 context.PHARunLog={add:(s,m)=>logs.push(s+' · '+m)};
 context.PHAVideoDownload={CONCURRENCY:6,release:async()=>{},attachment:async(d,{onProgress})=>{onProgress(64*1048576,64*1048576,{concurrency:6,bytesPerSecond:5e6,retries:2});return file}};
 await get('extractForm').events.submit({preventDefault(){}});
 assert.ok(logs.some(l=>/6 luồng · đã tải lại 2 phần bị đứng\/lỗi/.test(l)),logs.join('\n'));
 URL.revokeObjectURL(get('video').src);
});
