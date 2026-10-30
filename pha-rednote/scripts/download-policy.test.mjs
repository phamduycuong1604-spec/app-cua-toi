import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{extractNote} from '../worker/index.js';

const POST='https://www.xiaohongshu.com/explore/abcdefabcdefabcdefabcdef';
const ORIGIN='https://sns-video-bd.xhscdn.com/spectrum/original';
const CLEAN='https://sns-video-bd.xhscdn.com/stream/clean.mp4';
const BACKUP='https://sns-video-hw.xhscdn.com/stream/backup.mp4';
const BAD='https://sns-video-bd.xhscdn.com/stream/marked.mp4';
const H265='https://sns-video-bd.xhscdn.com/stream/hevc.mp4';
const MP4=new Uint8Array([0,0,0,16,102,116,121,112,105,115,111,109,0,0,0,0]);
const clean=(overrides={})=>({masterUrl:CLEAN,width:1080,height:1920,hasWatermark:false,...overrides});
function page(stream,{originKey='spectrum/original',originalFlags={}}={}){
 return '<script>window.__INITIAL_STATE__='+JSON.stringify({note:{noteDetailMap:{a:{note:{noteId:'abcdefabcdefabcdefabcdef',title:'Tiêu đề 原文',desc:'Caption gốc 原文',user:{nickname:'作者'},video:{consumer:{originVideoKey:originKey,...originalFlags},media:{stream}}}}}}})+'</script>';
}
function fixture({size=900000000,stream={h264:[clean()]},sizes={},blocked=[],html=[],originKey,originalFlags={},redirects={}}={}){
 const requests=[],headersSeen=[],source=page(stream,{...(originKey===undefined?{}:{originKey}),originalFlags});
 const request=async(url,init={})=>{
  requests.push([url,init.headers?.range]);headersSeen.push(new Headers(init.headers));
  if(redirects[url])return new Response(null,{status:302,headers:{location:redirects[url]}});
  if(new URL(url).hostname.endsWith('xiaohongshu.com')||new URL(url).hostname.endsWith('rednote.com'))return new Response(source);
  if(blocked.includes(url))return new Response('forbidden',{status:403});
  if(html.includes(url))return new Response('<html>login</html>');
  const total=url===ORIGIN?size:(sizes[url]??(url===CLEAN||url===BACKUP||url===H265||url===BAD?200000000:0));
  if(!total&&!(url===ORIGIN&&size===0))return new Response('missing',{status:404});
  const range=init.headers?.range;
  if(range==='bytes=0-65535')return new Response(MP4,{status:total?206:200,headers:total?{'content-range':'bytes 0-15/'+total}:{}});
  return new Response(MP4,{status:range&&range!=='bytes=0-'?206:200,headers:{'content-type':'video/mp4','content-length':'16',...(range&&range!=='bytes=0-'?{'content-range':range.replace('=',' ')+'/'+total}:{})}});
 };
 return {request,requests,source,headersSeen};
}
async function withFetch(options,fn){const old=globalThis.fetch,f=fixture(options);globalThis.fetch=f.request;try{return await fn(f)}finally{globalThis.fetch=old}}
const post=(body={})=>worker.fetch(new Request('https://site.test/api/dub/fetch-video',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:POST,preferOriginal:true,delivery:'attachment',...body})}),{});
const mediaUrl=d=>new URL(d.downloadUrl,'https://site.test').searchParams.get('url');

for(const size of [16,80000000,256*1024*1024,599999999,600000000,600000001,631307421,2147483648,3500000000])test('600 MB policy chooses the original or clean 1080p at '+size,()=>withFetch({size},async f=>{
 const r=await post(),d=await r.json();assert.equal(r.status,200);assert.equal(d.mode,size<=600000000?'original':'p1080');assert.equal(d.originalSize,size);assert.equal(d.size,size<=600000000?size:200000000);assert.equal(mediaUrl(d),size<=600000000?ORIGIN:CLEAN);
 assert.match(d.reason,size<=600000000?/≤ 600 MB/:/1080p.*không watermark/);
 assert.equal(d.caption,'Tiêu đề 原文\n\nCaption gốc 原文');assert.equal(d.author,'作者');assert.equal(d.sourceUrl,POST);
 assert.equal(f.requests.filter(([u])=>u===ORIGIN).length,1);assert.equal(f.requests.some(([u])=>u===CLEAN),size>600000000);
}));
for(const size of [16,80000000,399999999,400000000,599999999,600000000])test('Confirmed clean original stays original through 600 MB at '+size,()=>withFetch({size,stream:{},originalFlags:{hasWatermark:false}},async()=>{
 const r=await post(),d=await r.json();assert.equal(r.status,200);assert.equal(d.mode,'original');assert.equal(mediaUrl(d),ORIGIN);assert.equal(d.size,size);assert.match(d.reason,/≤ 600 MB/);
}));
for(const size of [600000001,629145600,3500000000])test('Original above 600 MB cannot bypass clean low-resolution requirement at '+size,()=>withFetch({size,stream:{},originalFlags:{hasWatermark:false}},async()=>{
 const r=await post();assert.equal(r.status,422);assert.match((await r.json()).error,/1080p hoặc 720p/);
}));
for(const [field,value] of [['hasWatermark',false],['has_watermark',false],['watermark',false],['waterMark',false],['hasWatermark',0],['hasWatermark','0'],['watermark','false']])test('Download policy accepts explicit no-watermark flag '+field+'='+JSON.stringify(value),()=>{
 const v={masterUrl:CLEAN,width:1080,height:1920,[field]:value};return withFetch({stream:{h264:[v]}},async()=>{const r=await post();assert.equal(r.status,200);assert.equal((await r.json()).mode,'p1080')});
});
for(const flags of [{},{hasWatermark:true},{hasWatermark:1},{hasWatermark:'1'},{watermark:'true'},{hasWatermark:false,watermark:true},{watermark:null},{hasWatermark:'no'},{hasWatermark:{}},{hasWatermark:false,watermark:null}])test('Download policy rejects marked or unverified variant '+JSON.stringify(flags),()=>withFetch({stream:{h264:[{masterUrl:CLEAN,width:1080,height:1920,...flags}]}},async f=>{
 const r=await post(),d=await r.json();assert.equal(r.status,422);assert.match(d.error,/Không có bản 1080p hoặc 720p/);assert.match(d.error,/watermark/);assert.equal(f.requests.some(([u])=>u===CLEAN),false);assert.equal(d.downloadUrl,undefined);
}));

test('Download policy skips a higher-bitrate marked stream and picks the explicitly clean copy',()=>withFetch({stream:{h264:[clean({masterUrl:BAD,hasWatermark:true,avgBitrate:9000000}),clean({avgBitrate:1000000})]}},async f=>{
 const d=await(await post()).json();assert.equal(d.mode,'p1080');assert.equal(mediaUrl(d),CLEAN);assert.equal(f.requests.some(([u])=>u===BAD),false);
}));
for(const marked of ['https://sns-video-bd.xhscdn.com/watermark/video.mp4','https://sns-video-bd.xhscdn.com/stream/wm/video.mp4',CLEAN+'?watermark=1',CLEAN+'?wm=true',CLEAN+'?x-oss-process=video/watermark,text_X'])test('Download policy does not trust contradictory watermark URL '+new URL(marked).pathname+new URL(marked).search,()=>withFetch({stream:{h264:[clean({masterUrl:marked,backupUrls:[BACKUP]})]}},async f=>{
 const d=await(await post()).json();assert.equal(d.mode,'p1080');assert.equal(mediaUrl(d),BACKUP);assert.equal(f.requests.some(([u])=>u===marked),false);
}));
test('Download policy does not mistake a request for watermark=0 for verified clean metadata',()=>withFetch({stream:{h264:[{masterUrl:CLEAN+'?watermark=0',width:1080,height:1920}]}},async()=>assert.equal((await post()).status,422)));
test('Download policy retries the clean backup when the primary is forbidden',()=>withFetch({stream:{h264:[clean({backupUrls:[BACKUP]})]},blocked:[CLEAN]},async()=>{const d=await(await post()).json();assert.equal(mediaUrl(d),BACKUP)}));
test('Download policy rejects HTML from a clean-labelled URL and uses the clean backup',()=>withFetch({stream:{h264:[clean({backupUrls:[BACKUP]})]},html:[CLEAN]},async()=>{const d=await(await post()).json();assert.equal(mediaUrl(d),BACKUP)}));
test('Download policy uses clean H.265 when H.264 is marked',()=>withFetch({stream:{h264:[clean({masterUrl:BAD,hasWatermark:true})],h265:[clean({masterUrl:H265})]}},async()=>{const d=await(await post()).json();assert.equal(d.codec,'h265');assert.equal(mediaUrl(d),H265)}));
test('Download policy rejects missing, unsupported and oversized clean variants',async()=>{
 for(const stream of [{},{av1:[clean()]},{h264:[clean({width:2160,height:3840})]},{h264:[clean({width:640,height:360})]},{h264:[clean({width:1080,height:3500})]}])await withFetch({stream},async()=>{const r=await post();assert.equal(r.status,422);assert.match((await r.json()).error,/Không có bản 1080p hoặc 720p/)});
});
test('Download policy does not choose a marked copy when every clean CDN URL fails',()=>withFetch({stream:{h264:[clean({backupUrls:[BACKUP]}),clean({masterUrl:BAD,hasWatermark:true})]},blocked:[CLEAN,BACKUP]},async f=>{
 const r=await post();assert.equal(r.status,422);assert.equal(f.requests.some(([u])=>u===BAD),false);assert.match((await r.json()).error,/Nguồn không cho tải/);
}));
test('Download policy falls back to a verified clean small original when web variants are marked',()=>withFetch({size:599999999,originalFlags:{hasWatermark:false},stream:{h264:[clean({hasWatermark:true})]}},async()=>assert.equal((await(await post()).json()).mode,'original')));
test('Download policy will not infer an original below 400 MB when its size is missing',()=>withFetch({size:0,originalFlags:{hasWatermark:false},stream:{h264:[{masterUrl:CLEAN,width:1080,height:1920}]}},async()=>{const r=await post();assert.equal(r.status,422);assert.match((await r.json()).error,/Không đọc được dung lượng bản gốc/)}));
test('Download policy can use an explicitly clean 1080p copy when original size is unknown',()=>withFetch({size:0},async()=>{const d=await(await post()).json();assert.equal(d.mode,'p1080');assert.equal(d.originalSize,null)}));
test('Download policy uses 1080p above 600 MB even if that verified clean copy is not smaller',()=>withFetch({size:600000001,sizes:{[CLEAN]:610000000}},async()=>{const d=await(await post()).json();assert.equal(d.mode,'p1080');assert.equal(d.size,610000000)}));
test('Download policy preserves the streaming response and caption headers without app storage',()=>withFetch({size:80000000,stream:{},originalFlags:{hasWatermark:false}},async()=>{
 const r=await post({delivery:'stream'});assert.equal(r.status,200);assert.equal(r.headers.get('x-video-mode'),'original');assert.equal(decodeURIComponent(r.headers.get('x-rednote-caption')),'Tiêu đề 原文\n\nCaption gốc 原文');assert.deepEqual(new Uint8Array(await r.arrayBuffer()),MP4);
}));
test('Download policy streams the small verified clean 1080p copy without app storage',()=>withFetch({sizes:{[CLEAN]:16}},async()=>{
 const r=await post({delivery:'stream'});assert.equal(r.status,200);assert.equal(r.headers.get('x-video-mode'),'p1080');assert.deepEqual(new Uint8Array(await r.arrayBuffer()),MP4);
}));
test('Desktop policy can choose a verified clean 1080p stream without an original URL',()=>withFetch({originKey:null},async f=>{const r=await post();assert.equal(r.status,200);assert.equal((await r.json()).mode,'p1080');assert.equal(f.requests.some(([u])=>u===ORIGIN),false)}));
for(const verified of [true,false])test('Download policy expired 1080p URL refresh '+(verified?'keeps a clean replacement and byte range':'fails closed when replacement is unverified'),()=>withFetch({stream:{h264:[verified?clean():{masterUrl:CLEAN,width:1080,height:1920}]},blocked:[BAD]},async f=>{
 const query=new URLSearchParams({url:BAD,source:POST,kind:'p1080'}),range='bytes=8388608-16777215';
 const r=await worker.fetch(new Request('https://site.test/api/download?'+query,{headers:{range}}),{});
 if(verified){assert.equal(r.status,206);assert.deepEqual(f.requests.at(-1),[CLEAN,range]);await r.body.cancel();}
 else{assert.equal(r.status,422);assert.match(await r.text(),/không có watermark/);assert.equal(f.requests.filter(([u])=>u===BAD).length,1);}
}));
test('Download policy parser retains source watermark evidence rather than inventing it from resolution',()=>{
 const n=extractNote(page({h264:[clean(),clean({masterUrl:BAD,hasWatermark:true}),{masterUrl:BACKUP,width:1080,height:1920}]}),POST);
 assert.deepEqual(n.variants.map(v=>v.watermark),['none','present','unknown']);
});

const DESKTOP='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
test('Desktop headers apply to short-link redirects, note pages, CDN probes and subsequent byte ranges',()=>withFetch({redirects:{[POST]:'https://www.rednote.com/explore/abcdefabcdefabcdefabcdef?xsec_token=public'}},async f=>{
 const d=await(await post()).json();assert.equal(d.sourceUserAgent,'desktop');assert.equal(d.selectedVideoUrl,CLEAN);
 const r=await worker.fetch(new Request('https://site.test'+d.downloadUrl,{headers:{range:'bytes=8388608-16777215'}}),{});assert.equal(r.status,206);await r.body.cancel();
 for(const headers of f.headersSeen){assert.equal(headers.get('user-agent'),DESKTOP);assert.equal(headers.get('accept-language'),'zh-CN,zh;q=0.9,en;q=0.8');assert.equal(headers.get('referer'),'https://www.rednote.com/');}
 assert.ok(f.requests.some(([u])=>u.startsWith('https://www.rednote.com/')));assert.equal(f.requests.at(-1)[1],'bytes=8388608-16777215');
}));
test('Desktop policy prefers verified H.264 over verified H.265 even at a lower bitrate',()=>withFetch({stream:{h264:[clean({avgBitrate:1000000})],h265:[clean({masterUrl:H265,avgBitrate:9000000})]}},async f=>{
 const d=await(await post()).json();assert.equal(d.codec,'h264');assert.equal(mediaUrl(d),CLEAN);assert.equal(f.requests.some(([u])=>u===H265),false);
}));
test('Desktop policy records the final redirected clean CDN link rather than the old URL',()=>withFetch({redirects:{[CLEAN]:BACKUP}},async()=>{
 const d=await(await post()).json();assert.equal(mediaUrl(d),BACKUP);assert.equal(d.selectedVideoUrl,BACKUP);assert.match(d.reason,/1080p.*không watermark/);
}));
test('Desktop policy rejects a clean-labelled URL redirecting to a watermark path',()=>withFetch({redirects:{[CLEAN]:BAD+'/watermark/video.mp4'},sizes:{[BAD+'/watermark/video.mp4']:1000000}},async()=>{
 const r=await post();assert.equal(r.status,422);assert.match((await r.json()).error,/link cuối có watermark/);
}));
for(const originalFlags of [{hasWatermark:true},{hasWatermark:false,watermark:true}])test('Desktop original fallback refuses absent or contradictory clean evidence '+JSON.stringify(originalFlags),()=>withFetch({size:16,stream:{},originalFlags},async f=>{
 const r=await post(),d=await r.json();assert.equal(r.status,422);assert.match(d.error,/watermark/);assert.equal(d.downloadUrl,undefined);assert.equal(f.requests.some(([u])=>u===ORIGIN),false);
}));
test('Original evidence is never inferred from the cleanliness of a different web stream',()=>{
 const n=extractNote(page({h264:[clean()]}),POST);assert.equal(n.originalWatermark,'unknown');
 const matched=extractNote(page({h264:[clean({masterUrl:ORIGIN,width:3840,height:2160})]}),POST);assert.equal(matched.originalWatermark,'none');
 const conflict=extractNote(page({h264:[clean({masterUrl:ORIGIN})]},{originalFlags:{watermark:true}}),POST);assert.equal(conflict.originalWatermark,'present');
});
for(const verified of [true,false])test('Expired original refresh '+(verified?'keeps verified original and byte ranges':'stops when clean verification is lost'),()=>withFetch({stream:{},originalFlags:verified?{hasWatermark:false}:{hasWatermark:true},size:590000000,blocked:[BAD]},async f=>{
 const query=new URLSearchParams({url:BAD,source:POST,kind:'original'}),range='bytes=8388608-16777215';
 const r=await worker.fetch(new Request('https://site.test/api/download?'+query,{headers:{range}}),{});
 if(verified){assert.equal(r.status,206);assert.deepEqual(f.requests.at(-1),[ORIGIN,range]);await r.body.cancel();}else{assert.equal(r.status,422);assert.match(await r.text(),/không.*watermark/);assert.equal(f.requests.filter(([u])=>u===BAD).length,1);}
}));
test('Streaming output also includes desktop profile, chosen URL and reason headers',()=>withFetch({sizes:{[CLEAN]:16}},async()=>{
 const r=await post({delivery:'stream'});assert.equal(r.status,200);assert.equal(r.headers.get('x-source-user-agent'),'desktop');assert.equal(decodeURIComponent(r.headers.get('x-video-final-url')),CLEAN);assert.match(decodeURIComponent(r.headers.get('x-video-reason')),/1080p.*không watermark/);await r.body.cancel();
}));
test('A selected byte-range download cannot follow a later CDN redirect to a watermark variant',()=>withFetch({redirects:{[CLEAN]:BAD+'/watermark/video.mp4'},sizes:{[BAD+'/watermark/video.mp4']:1000000}},async()=>{
 const query=new URLSearchParams({url:CLEAN,kind:'p1080'});
 const r=await worker.fetch(new Request('https://site.test/api/download?'+query,{headers:{range:'bytes=0-15'}}),{});
 assert.equal(r.status,422);assert.match(await r.text(),/dấu hiệu watermark/);
}));

for(const [name,stream,blocked,expected] of [
 ['720p only',{h264:[clean({width:1280,height:720})]},[],CLEAN],
 ['marked 1080p plus clean 720p',{h264:[clean({masterUrl:BAD,hasWatermark:true}),clean({width:720,height:1280})]},[],CLEAN],
 ['broken 1080p plus clean 720p',{h264:[clean(),clean({masterUrl:BACKUP,width:720,height:1280})]},[CLEAN],BACKUP],
 ['1080p H265 preferred over 720p H264',{h265:[clean({masterUrl:H265})],h264:[clean({width:1280,height:720})]},[],H265]
])test('600 MB resolution fallback: '+name,()=>withFetch({size:900000000,stream,blocked},async()=>{
 const r=await post(),d=await r.json();assert.equal(r.status,200);assert.equal(mediaUrl(d),expected);assert.equal(d.mode,expected===H265?'p1080':'p720');
}));
for(const flags of [{},{hasWatermark:true}])test('Unverified or marked 720p never becomes a fallback '+JSON.stringify(flags),()=>withFetch({stream:{h264:[{masterUrl:CLEAN,width:1280,height:720,...flags}]}},async()=>assert.equal((await post()).status,422)));
test('Unusable original can fall back to clean 720p',()=>withFetch({size:80000000,blocked:[ORIGIN],stream:{h264:[clean({width:720,height:1280})]}},async()=>{const d=await(await post()).json();assert.equal(d.mode,'p720')}));
test('A 720p refresh preserves resolution and byte Range',()=>withFetch({stream:{h264:[clean(),clean({masterUrl:BACKUP,width:720,height:1280})]},blocked:[BAD]},async f=>{
 const query=new URLSearchParams({url:BAD,source:POST,kind:'p720'}),range='bytes=8388608-16777215';
 const r=await worker.fetch(new Request('https://site.test/api/download?'+query,{headers:{range}}),{});assert.equal(r.status,206);assert.deepEqual(f.requests.at(-1),[BACKUP,range]);await r.body.cancel();
}));
test('Refreshing an original cannot silently download more than 600 MB',()=>withFetch({size:600000001,stream:{} ,blocked:[BAD]},async()=>{
 const query=new URLSearchParams({url:BAD,source:POST,kind:'original'});assert.equal((await worker.fetch(new Request('https://site.test/api/download?'+query),{})).status,422);
}));

test('Large original is offered but never selected automatically when no clean small version exists',()=>withFetch({size:1270570159,stream:{}},async()=>{
 const r=await post(),d=await r.json();assert.equal(r.status,422);assert.equal(d.code,'LARGE_ORIGINAL_AVAILABLE');assert.equal(d.largeOriginal.size,1270570159);assert.equal(d.downloadUrl,undefined);
}));
test('Only explicit boolean consent enables the large-original fallback and survives download URL creation',()=>withFetch({size:1270570159,stream:{}},async()=>{
 for(const allowLargeOriginal of [false,'true',1])assert.equal((await post({allowLargeOriginal})).status,422);
 const r=await post({allowLargeOriginal:true}),d=await r.json();assert.equal(r.status,200);assert.equal(d.mode,'original');assert.equal(d.size,1270570159);assert.equal(d.allowLargeOriginal,true);assert.match(d.downloadUrl,/largeOriginal=1/);assert.match(d.reason,/không bảo đảm/);
}));
test('Opting into large fallback still prefers an available verified clean 1080p',()=>withFetch({size:1270570159},async()=>{
 const d=await(await post({allowLargeOriginal:true})).json();assert.equal(d.mode,'p1080');assert.equal(d.allowLargeOriginal,false);assert.doesNotMatch(d.downloadUrl,/largeOriginal=1/);
}));
test('Large-original opt-in does not select an original explicitly marked with watermark',()=>withFetch({size:1270570159,stream:{},originalFlags:{hasWatermark:true}},async()=>{
 const r=await post({allowLargeOriginal:true}),d=await r.json();assert.equal(r.status,422);assert.equal(d.largeOriginal,undefined);assert.equal(d.downloadUrl,undefined);
}));

test('Explicit large-original choice survives a CDN URL refresh while normal requests keep the cap',()=>withFetch({size:1270570159,stream:{}},async()=>{
 const d=await(await post({allowLargeOriginal:true})).json(),upstream=globalThis.fetch;let refused=false;
 globalThis.fetch=async(url,init)=>{if(new Headers(init.headers).get('range')==='bytes=0-15'&&!refused){refused=true;return new Response('Expired',{status:403})}return upstream(url,init)};
 const r=await worker.fetch(new Request(new URL(d.downloadUrl,'https://site.test'),{headers:{range:'bytes=0-15'}}),{});assert.equal(r.status,206);assert.equal((await r.arrayBuffer()).byteLength,16);assert.equal(refused,true);
 refused=false;const without=new URL(d.downloadUrl,'https://site.test');without.searchParams.delete('largeOriginal');const blocked=await worker.fetch(new Request(without,{headers:{range:'bytes=0-15'}}),{});assert.equal(blocked.status,422);
}));
