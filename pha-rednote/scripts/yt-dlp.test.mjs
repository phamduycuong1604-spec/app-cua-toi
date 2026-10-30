import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import {configuredYtdlp,resolveWithYtdlp} from '../worker/yt-dlp.js';
const SOURCE='https://www.xiaohongshu.com/explore/abcdefabcdefabcdefabcdef';
const SERVICE='https://resolver.example.test/v1/rednote/resolve';
const TOKEN='test-private-ytdlp-service-token-not-a-real-secret';
const MEDIA='https://sns-video-bd.xhscdn.com/source/ytdlp.mp4';
const OLD='https://sns-video-bd.xhscdn.com/stream/desktop.mp4';
const EXPIRED='https://sns-video-bd.xhscdn.com/source/expired.mp4';
const MP4=new Uint8Array([0,0,0,16,102,116,121,112,105,115,111,109,0,0,0,0]);
const env={YTDLP_SERVICE_URL:SERVICE,YTDLP_SERVICE_TOKEN:TOKEN};
const candidate=(patch={})=>({url:MEDIA,formatId:'direct',ext:'mp4',watermark:'none',watermarkEvidence:'explicit-rednote-metadata',...patch});
const payload=(candidates=[candidate()])=>({version:1,engine:'yt-dlp',note:{id:'abcdefabcdefabcdefabcdef',title:'yt title',caption:'Original caption',author:'Author'},candidates});
const desktopNote={title:'desktop title',desc:'Desktop caption',video:{media:{stream:{h264:[{masterUrl:OLD,hasWatermark:false,width:1080,height:1920}]}}}};
const desktop='<script>window.__INITIAL_STATE__='+JSON.stringify({note:{noteDetailMap:{a:{note:desktopNote}}}})+'</script>';
const login='<script>window.__INITIAL_STATE__={"login":{}}</script>';
const post=(settings=env,body={})=>worker.fetch(new Request('https://site.test/api/dub/fetch-video',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:SOURCE,delivery:'attachment',...body})}),settings);
async function scenario(callback,{service=()=>Response.json(payload()),size=650000000,noDesktop=false,badMedia=false,redirectMedia,mediaType='mp4'}={}){
 const previous=globalThis.fetch,seen=[],logs=[],info=console.info,warn=console.warn;
 console.info=(...v)=>logs.push(v.join(' '));console.warn=console.info;
 globalThis.fetch=async(url,init={})=>{
  seen.push({url,init});
  if(url===SERVICE)return service(url,init);
  assert.equal(new Headers(init.headers).get('authorization'),null,'Service bearer must never reach Rednote or its CDNs');
  if(url===SOURCE||new URL(url).hostname.endsWith('rednote.com'))return new Response(noDesktop?login:desktop);
  if(url===EXPIRED)return new Response('expired',{status:403});
  if(url===MEDIA&&redirectMedia)return new Response(null,{status:302,headers:{location:redirectMedia}});
  if(url===MEDIA&&badMedia)return new Response('<html>not a video</html>');
  if(url===MEDIA||url===OLD||url===redirectMedia){
   const total=url===OLD?16:size,bytes=mediaType==='webm'&&url===MEDIA?new Uint8Array([26,69,223,163,0,0,0,0,0,0,0,0,0,0,0,0]):MP4;
   return new Response(bytes,{status:206,headers:{'content-range':'bytes 0-15/'+total,'content-type':mediaType==='webm'?'video/webm':'video/mp4','content-length':'16'}});
  }
  throw Error('Unexpected network destination');
 };
 try{return await callback({seen,logs})}finally{globalThis.fetch=previous;console.info=info;console.warn=warn}
}

// The optional bridge module remains available in the source archive, but the
// active app now uses only the restored 600 MB desktop workflow.
for(const settings of [{},env])test('Restored downloader never waits for yt-dlp '+(settings===env?'even when configured':'when unconfigured'),()=>scenario(async({seen,logs})=>{
 const r=await post(settings),d=await r.json();assert.equal(r.status,200);assert.equal(d.sourceResolver,'desktop');assert.equal(d.selectedVideoUrl,OLD);assert.equal(seen.some(v=>v.url===SERVICE),false);assert.doesNotMatch(d.reason,/yt-dlp/);assert.ok(logs.some(l=>l.includes('rednote_source_selected')));
}));
for(const value of [{YTDLP_SERVICE_URL:SERVICE},{...env,YTDLP_SERVICE_URL:'http://resolver.example.test/'},{...env,YTDLP_SERVICE_URL:'https://user:pass@resolver.example.test/'},{...env,YTDLP_SERVICE_URL:SERVICE+'?token=secret'}])test('Archived bridge rejects unsafe configuration '+Object.keys(value).join(','),async()=>{
 assert.equal(configuredYtdlp(value).code,'MISCONFIGURED');assert.equal((await resolveWithYtdlp(SOURCE,value)).ok,false);
});
for(const entry of [candidate(),candidate({watermark:'unknown'}),candidate({watermark:'present'}),candidate({watermarkEvidence:null})])test('Archived bridge still validates evidence '+entry.watermark+' '+entry.watermarkEvidence,()=>scenario(async({seen})=>{
 const r=await resolveWithYtdlp(SOURCE,env);assert.equal(r.ok,entry.watermark==='none'&&entry.watermarkEvidence==='explicit-rednote-metadata');assert.equal(seen.length,1);assert.equal(new Headers(seen[0].init.headers).get('authorization'),'Bearer '+TOKEN);
},{service:()=>Response.json(payload([entry]))}));
test('Archived bridge does not forward bearer on redirects',()=>scenario(async({seen})=>{
 assert.equal((await resolveWithYtdlp(SOURCE,env)).code,'NETWORK_ERROR');assert.equal(seen.length,1);
},{service:()=>new Response(null,{status:302,headers:{location:'https://evil.test/token'}})}));
test('Archived bridge still has a bounded timeout for an abort-ignoring host',{timeout:1000},async()=>{
 const old=globalThis.fetch;globalThis.fetch=()=>new Promise(()=>{});try{assert.equal((await resolveWithYtdlp(SOURCE,env,{timeoutMs:15})).code,'TIMEOUT')}finally{globalThis.fetch=old}
});
test('Login-required source error remains clear and permits selecting a local video',()=>scenario(async()=>{
 const r=await post(),d=await r.json();assert.equal(r.status,422);assert.equal(d.code,'REDNOTE_LOGIN_REQUIRED');assert.match(d.error,/chọn video từ máy/);assert.doesNotMatch(d.error,/yt-dlp/);
 const html=await(await worker.fetch(new Request('https://site.test/'),env)).text();assert.match(html,/id="chooseFile"/);
},{noDesktop:true}));
test('Caption extraction also uses desktop and never the optional bridge',()=>scenario(async({seen})=>{
 const r=await worker.fetch(new Request('https://site.test/api/extract',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({url:SOURCE})}),env),d=await r.json();assert.equal(r.status,200);assert.equal(d.title,'desktop title');assert.equal(d.videoUrl,OLD);assert.equal(d.videoKind,'p1080');assert.equal(seen.some(v=>v.url===SERVICE),false);
}));
