import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{extractNote} from '../worker/index.js';
const POST='https://www.xiaohongshu.com/explore/abcdefabcdefabcdefabcdef';
const ORIGINAL='https://sns-video-bd.xhscdn.com/source/original.mp4';
const CLEAN='https://sns-video-bd.xhscdn.com/stream/clean.mp4';
const BACKUP='https://sns-video-hw.xhscdn.com/source/backup.mp4';
const MP4=new Uint8Array([0,0,0,16,102,116,121,112,105,115,111,109,0,0,0,0]);
const stream=(more={})=>({masterUrl:CLEAN,width:1080,height:1920,hasWatermark:false,...more});
const page=video=>'<script>window.__INITIAL_STATE__='+JSON.stringify({note:{noteDetailMap:{a:{note:{title:'A note',desc:'Original caption',video}}}}})+'</script>';
const note=video=>extractNote(page(video),POST);
async function run(video,callback,{sizes={},bad=[],redirects={},hanging=[]}={}){
 const before=globalThis.fetch,requests=[];
 globalThis.fetch=async(url,init={})=>{
  requests.push([url,init]);assert.equal(new Headers(init.headers).get('cookie'),null);
  if(url===POST)return new Response(page(video));
  if(redirects[url])return new Response(null,{status:302,headers:{location:redirects[url]}});
  if(bad.includes(url))return new Response('<html>not video</html>');
  if(hanging.includes(url))return new Response(new ReadableStream({pull(){return new Promise(()=>{})},cancel(){return new Promise(()=>{})}}),{status:206,headers:{'content-range':'bytes 0-15/1000000'}});
  const size=sizes[url]??(url===ORIGINAL?500000001:1000000);
  return new Response(MP4,{status:206,headers:{'content-range':'bytes 0-15/'+size,'content-type':'video/mp4'}});
 };
 const post=(path='/api/dub/fetch-video',body={})=>worker.fetch(new Request('https://site.test'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:POST,delivery:'attachment',...body})}),{});
 try{return await callback(post,requests)}finally{globalThis.fetch=before}
}
for(const [name,video] of [
 ['origin object',{origin:{url:ORIGINAL,hasWatermark:false}}],
 ['origin string',{origin:ORIGINAL,hasWatermark:false}],
 ['origin_url',{origin_url:ORIGINAL,has_watermark:false}],
 ['originalUrl',{originalUrl:ORIGINAL,watermark:0}],
 ['originVideoUrl',{originVideoUrl:ORIGINAL,waterMark:'false'}],
 ['master_url',{master_url:ORIGINAL,hasWatermark:false}],
 ['mediaV2 master_url',{mediaV2:{master_url:ORIGINAL,hasWatermark:false}}],
 ['media_v2 masterUrl',{media_v2:{masterUrl:ORIGINAL,hasWatermark:false}}],
 ['mediaV2 labelled source',{mediaV2:{stream:{h265:[{master_url:ORIGINAL,quality:'origin',hasWatermark:false}]}}}],
 ['mediaV2 original flag',{mediaV2:[{master_url:ORIGINAL,isOriginal:true,hasWatermark:false}]}],
 ['legacy clean url',{url:ORIGINAL,hasWatermark:false}],
])test('Source extraction: '+name+' original below 600 MB is preferred over 1080p',()=>run({...video,media:{stream:{h264:[stream()]}}},async(post,requests)=>{
 const r=await post(),d=await r.json();assert.equal(r.status,200);assert.equal(d.mode,'original');assert.equal(d.selectedVideoUrl,ORIGINAL);assert.equal(d.size,500000001);assert.match(d.reason,/≤ 600 MB/);assert.equal(requests.some(([u])=>u===CLEAN),false);
}));
for(const field of ['origin','origin_url','master_url'])test('A small '+field+' below 600 MB stays original without inventing a clean flag',()=>run({[field]:ORIGINAL},async(post,requests)=>{
 const r=await post(),d=await r.json();assert.equal(r.status,200);assert.equal(d.mode,'original');assert.equal(d.selectedVideoUrl,ORIGINAL);assert.equal(note({[field]:ORIGINAL}).originalWatermark,'unknown');assert.equal(requests.some(([u])=>u===ORIGINAL),true);
},{sizes:{[ORIGINAL]:399999999}}));
test('An unrelated clean consumer cannot verify a top-level master URL',()=>{
 const n=note({consumer:{originVideoKey:'source/other',hasWatermark:false},master_url:ORIGINAL});
 assert.equal(n.originals.find(v=>v.urls.includes(ORIGINAL)).watermark,'unknown');
});
test('mediaV2 H.264 streams and snake_case backup URLs work with H.264 preferred over H.265',()=>run({mediaV2:{stream:{h265:[{...stream({masterUrl:BACKUP}),codec:'hvc1.1.6.L120.B0'}],h264:[{...stream(),masterUrl:null,master_url:CLEAN,backup_urls:[BACKUP],codec:'avc1.640028'}]}}},async(post)=>{
 const d=await(await post()).json();assert.equal(d.mode,'p1080');assert.equal(d.codec,'h264');assert.equal(d.selectedVideoUrl,CLEAN);
}));
test('mediaV2 array streams retain per-record watermark claims rather than treating the field name as clean',()=>run({mediaV2:[stream({masterUrl:ORIGINAL,hasWatermark:true,codec:'h264'}),stream({codec:'h264'})]},async(post)=>{
 const d=await(await post()).json();assert.equal(d.mode,'p1080');assert.equal(d.selectedVideoUrl,CLEAN);
}));
test('Group clean flags are inherited, but malformed child flags do not become a clean claim',()=>{
 const n=note({mediaV2:{hasWatermark:false,stream:{h264:[stream({masterUrl:ORIGINAL,hasWatermark:null}),{master_url:CLEAN,width:1080,height:1920}]}}});
 assert.equal(n.variants.find(v=>v.urls.includes(ORIGINAL)).watermark,'unknown');assert.equal(n.variants.find(v=>v.urls.includes(CLEAN)).watermark,'none');
});
test('Explicit watermark contradictions on the same URL make both source and stream unsafe',()=>run({origin:{url:ORIGINAL,hasWatermark:false},media:{stream:{h264:[stream({masterUrl:ORIGINAL,hasWatermark:true})]}}},async(post,requests)=>{
 const r=await post();assert.equal(r.status,422);assert.equal(requests.some(([u])=>u===ORIGINAL),false);
}));
test('The first unverified origin does not hide another verified master source',()=>run({consumer:{originVideoKey:'source/unknown'},master_url:ORIGINAL,hasWatermark:false},async(post)=>{
 const d=await(await post()).json();assert.equal(d.mode,'original');assert.equal(d.selectedVideoUrl,ORIGINAL);
}));
test('Origin fallback uses a source backup that is still verified clean',()=>run({origin:{master_url:ORIGINAL,backup_urls:[BACKUP],hasWatermark:false}},async(post,requests)=>{
 const d=await(await post()).json();assert.equal(d.mode,'original');assert.equal(d.selectedVideoUrl,BACKUP);assert.ok(requests.some(([u])=>u===ORIGINAL));
},{bad:[ORIGINAL]}));
test('An inaccessible clean original falls back to a clean 1080p copy',()=>run({origin:{url:ORIGINAL,hasWatermark:false},media:{stream:{h264:[stream()]}}},async(post)=>{
 const d=await(await post()).json();assert.equal(d.mode,'p1080');assert.equal(d.selectedVideoUrl,CLEAN);assert.match(d.reason,/Bản gốc không dùng được/);
},{bad:[ORIGINAL]}));
for(const url of [ORIGINAL+'?watermark=1','https://sns-video-bd.xhscdn.com/watermark/source.mp4'])test('Watermark URL cannot bypass source verification '+url,()=>run({origin:{url,hasWatermark:false},media:{stream:{h264:[stream()]}}},async(post,requests)=>{
 const d=await(await post()).json();assert.equal(d.mode,'p1080');assert.equal(requests.some(([u])=>u===url),false);
}));
test('A clean original redirecting to a watermark URL is rejected before choosing the 1080p fallback',()=>run({origin:{url:ORIGINAL,hasWatermark:false},media:{stream:{h264:[stream()]}}},async(post)=>{
 const d=await(await post()).json();assert.equal(d.mode,'p1080');assert.match(d.reason,/link cuối có watermark/);
},{redirects:{[ORIGINAL]:'https://sns-video-bd.xhscdn.com/watermark/source.mp4'}}));
test('Unknown untrusted URLs, credentials in URLs, poster and audio containers are not harvested as original video',()=>{
 const n=note({origin:{url:'https://evil.test/media.mp4',hasWatermark:false},master_url:'https://user:pass@sns-video-bd.xhscdn.com/a.mp4',mediaV2:{audio:{url:ORIGINAL},poster:{url:BACKUP}}});assert.equal(n.originals.length,0);assert.equal(n.variants.length,0);
});
test('HTTP and protocol-relative source URLs are upgraded then validated against the media host allowlist',()=>{
 for(const value of ['http://sns-video-bd.xhscdn.com/source/original.mp4','//sns-video-bd.xhscdn.com/source/original.mp4'])assert.equal(note({origin:{url:value,hasWatermark:false}}).originalVideoUrl,ORIGINAL);
});
test('An origin with unreadable size cannot be downloaded as a validated attachment',()=>run({origin:{url:ORIGINAL,hasWatermark:false}},async(post)=>{
 const r=await post();assert.equal(r.status,422);assert.match((await r.json()).error,/Không đọc được dung lượng bản gốc/);
},{sizes:{[ORIGINAL]:0}}));
test('The caption extraction endpoint cannot provide an auto-download URL for a marked original',()=>run({origin:{url:ORIGINAL,hasWatermark:true}},async(post)=>{
 const r=await post('/api/extract'),d=await r.json();assert.equal(r.status,200);assert.equal(d.caption,'A note\n\nOriginal caption');assert.equal(d.downloadUrl,null);assert.equal(d.videoUrl,null);assert.match(d.videoSelectionError,/watermark/);
}));
test('Source candidate traversal remains bounded for repeated containers',()=>{
 const v={mediaV2:{stream:{h264:[]}}};for(let i=0;i<1000;i++)v.mediaV2.stream.h264.push(stream({masterUrl:CLEAN+'?v='+i}));assert.ok(note(v).variants.length<=64);
});
test('A CDN returning headers but no first bytes cannot hang source selection or its clean 1080p fallback',{timeout:2000},async()=>{
 const previous=globalThis.setTimeout;globalThis.setTimeout=(fn,ms,...args)=>previous(fn,ms===8000?20:ms,...args);
 try{await run({origin:{url:ORIGINAL,hasWatermark:false},media:{stream:{h264:[stream()]}}},async(post)=>{
  const r=await post(),d=await r.json();assert.equal(r.status,200);assert.equal(d.mode,'p1080');assert.match(d.reason,/không gửi dữ liệu đầu/);
 },{hanging:[ORIGINAL]})}finally{globalThis.setTimeout=previous}
});

test('Serialized mobile mediaV2 exposes 720p without inventing a no-watermark flag',()=>{
 const n=note({mediaV2:JSON.stringify({stream:{h264:[{master_url:CLEAN,width:1280,height:720,video_codec:'h264',size:78015774}]}})});
 assert.equal(n.variants.length,1);assert.equal(n.variants[0].height,720);assert.equal(n.variants[0].codec,'h264');assert.equal(n.variants[0].watermark,'unknown');
});
test('Serialized mediaV2 can provide verified 720p when the original exceeds 600 MB',()=>run({origin:ORIGINAL,mediaV2:JSON.stringify({stream:{h264:[stream({width:1280,height:720})]}})},async post=>{
 const r=await post(),d=await r.json();assert.equal(r.status,200);assert.equal(d.mode,'p720');assert.equal(d.codec,'h264');
},{sizes:{[ORIGINAL]:1270570159}}));
test('Unknown serialized 720p fails with an accurate watermark reason, not missing streams',()=>run({origin:ORIGINAL,mediaV2:JSON.stringify({stream:{h264:[{master_url:CLEAN,width:1280,height:720,video_codec:'h264'}]}})},async(post,requests)=>{
 const r=await post(),d=await r.json();assert.equal(r.status,422);assert.match(d.error,/h264 1280×720: chưa xác minh không watermark/);assert.doesNotMatch(d.error,/không gửi kèm|Không tìm thấy danh sách/);assert.equal(requests.some(([url])=>url===CLEAN),false);
},{sizes:{[ORIGINAL]:1270570159}}));
test('Malformed, oversized and primitive serialized media containers are ignored safely',()=>{
 for(const value of ['{broken','null','42','"nested string"',' '.repeat(1000001)]){
  const n=note({mediaV2:value});assert.equal(n.variants.length,0);assert.equal(n.originals.length,0);
 }
});
test('Serialized duplicate streams cannot overrule a watermark mark on the same URL',()=>{
 const n=note({media:{stream:{h264:[stream({hasWatermark:true})]}},mediaV2:JSON.stringify({stream:{h264:[stream()]}})});
 assert.ok(n.variants.length);assert.ok(n.variants.every(v=>v.watermark==='present'));
});
