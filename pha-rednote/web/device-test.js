import {AUDIO_ARGS,pcmInfo,isMp4,parseProbe,bounded} from './device-test-core.js';
import {macDinhLop,veLop,xuatHinh} from './lop-phu.js';
import {setRunSignal} from './site-bridge.js';
const $=id=>document.getElementById(id),objects=new Set();let controller=null,ff=null,started=0,tail=[];
const env={ua:navigator.userAgent,viewport:[innerWidth,innerHeight],screen:[screen.width,screen.height],pixelRatio:devicePixelRatio,cores:navigator.hardwareConcurrency,secure:isSecureContext,WebAssembly:typeof WebAssembly!=='undefined',WebGPU:!!navigator.gpu,VideoEncoder:typeof VideoEncoder!=='undefined',VideoDecoder:typeof VideoDecoder!=='undefined',OffscreenCanvas:typeof OffscreenCanvas!=='undefined'};
$('device').textContent='Trình duyệt: '+env.ua+' · '+env.viewport.join('×')+' CSS px · WebGPU: '+env.WebGPU+' · VideoEncoder: '+env.VideoEncoder;
function log(s){const line='['+((performance.now()-started)/1000).toFixed(1)+'s] '+s;if(globalThis.PHARunLog)globalThis.PHARunLog.add('Kiểm tra thiết bị',line);else $('log').value+=line+'\n';$('log').scrollTop=$('log').scrollHeight;}
function url(blob){const u=URL.createObjectURL(blob);objects.add(u);return u;}
function resetMedia(){for(const id of ['video','audio']){$(id).pause();$(id).removeAttribute('src');$(id).load();}for(const u of objects)URL.revokeObjectURL(u);objects.clear();$('previews').hidden=true;$('audio').hidden=true;$('saveVideo').hidden=true;$('saveVideo').removeAttribute('href');}
function showVideo(blob){const u=url(blob);$('video').src=u;$('saveVideo').href=u;$('saveVideo').hidden=false;$('previews').hidden=false;}
$('source').onchange=()=>{const f=$('source').files[0];$('fileInfo').textContent=f?f.name+' · '+(f.size/1048576).toFixed(1)+' MB':'Chưa chọn: dùng video mẫu hai giây do điện thoại tạo.';};
async function step(name,fn,{ms=90000,optional=false,onTimeout=()=>{}}={}){
  const li=document.createElement('li');li.textContent='Đang thử: '+name;$('results').append(li);$('status').textContent=name;log('▶ '+name);const t=performance.now();
  try{const v=await bounded(fn,controller.signal,ms,()=>{controller.abort(new DOMException('Quá thời gian chờ: '+name,'AbortError'));onTimeout();});li.textContent='✅ '+name+' · '+((performance.now()-t)/1000).toFixed(1)+' giây';log(li.textContent);return v;}
  catch(e){const stopped=controller.signal.aborted;li.textContent=(stopped?'⏹ ':e.khongHoTro?'⏭ Chưa hỗ trợ: ':'❌ ')+name+' · '+e.message;log(li.textContent);if(!optional||stopped)throw e;return null;}
}
async function runFF(args){tail=[];const code=await ff.exec(args,90000,{signal:controller.signal});if(code!==0)throw Error('FFmpeg trả mã '+code+'\n'+tail.slice(-18).join('\n'));}
async function loadFF(){
  const signal=controller.signal;signal.throwIfAborted();const {FFmpeg}=await import('/dub/ffmpeg/index.js');signal.throwIfAborted();ff=new FFmpeg();ff.on('log',({message})=>{tail.push(message);if(tail.length>80)tail.shift();});
  const fetchBlob=async(path,type)=>{const r=await fetch(path,{signal});if(!r.ok)throw Error('Tải '+path+': HTTP '+r.status);const bytes=await r.arrayBuffer();signal.throwIfAborted();return url(new Blob([bytes],{type}));};
  const [coreURL,wasmURL]=await Promise.all([fetchBlob('/dub/remote/ffmpeg-core.js','text/javascript'),fetchBlob('/dub/remote/ffmpeg-core.wasm','application/wasm')]);
  try{signal.throwIfAborted();await ff.load({coreURL,wasmURL,classWorkerURL:location.origin+'/dub/ffmpeg/worker.js'},{signal});}
  finally{for(const u of [coreURL,wasmURL]){URL.revokeObjectURL(u);objects.delete(u);}}
}
async function createSample(){
  await runFF(['-hide_banner','-y','-f','lavfi','-i','color=c=0x1c6957:s=320x180:r=10:d=2','-f','lavfi','-i','sine=frequency=440:sample_rate=16000:duration=2','-threads','1','-filter_threads','1','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-b:a','64k','-t','2','-movflags','+faststart','/sample.mp4']);
  const bytes=await ff.readFile('/sample.mp4');if(!isMp4(bytes))throw Error('Mẫu MP4 không hợp lệ.');return new File([bytes],'PHA-mau.mp4',{type:'video/mp4'});
}
async function extract(file){
  if(file.size>256*1048576)throw Error('Bài thử giới hạn file 256 MB để giữ bộ nhớ an toàn.');
  await ff.createDir('/test-input');
  // Read the selected file lazily via WORKERFS, just as the video app does.
  // No fallback that copies a large video into the WASM heap.
  const mounted=await ff.mount('WORKERFS',{files:[file]},'/test-input');if(!mounted)throw Error('WORKERFS chưa gắn được file trên trình duyệt này.');
  try{await runFF(AUDIO_ARGS('/test-input/'+file.name));const bytes=await ff.readFile('/test.pcm');const info=pcmInfo(bytes);log('PCM mono 16 kHz: '+info.samples+' mẫu · '+info.seconds.toFixed(2)+' giây · đỉnh '+info.peak);if(!info.peak)log('Âm thanh hoàn toàn im lặng; tách file thành công, chưa đủ tiếng nói để dịch.');return info;}
  finally{await ff.unmount('/test-input').catch(()=>{});await ff.deleteDir('/test-input').catch(()=>{});}
}
async function probe(path){tail=[];const code=await ff.ffprobe(['-v','error','-show_entries','stream=codec_name,sample_rate,channels,width,height:format=duration','-of','json',path],15000,{signal:controller.signal});return parseProbe(code,tail.join('\n'));}
async function mux(path){
  await runFF(['-hide_banner','-y','-threads','1','-i',path,'-i','/sample.mp4','-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','160k','-t','2','-movflags','+faststart','/result.mp4']);
  const data=await ff.readFile('/result.mp4');if(!isMp4(data))throw Error('Kết quả không phải MP4.');const p=await probe('/result.mp4');if(!p.streams.some(s=>s.codec_name==='aac')||!p.streams.some(s=>s.width)||Number(p.format.duration)<1.9)throw Error('MP4 thiếu hình/tiếng hoặc sai thời lượng.');log('MP4: '+data.length+' byte · '+JSON.stringify(p));showVideo(new Blob([data],{type:'video/mp4'}));
}
async function testEdge(){
  const r=await fetch('/ai/edge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'Xin chào PhaHa.',voice:'vi-VN-HoaiMyNeural'}),signal:controller.signal});
  if(!r.ok)throw Error('Giọng Edge: HTTP '+r.status+' · '+(await r.text()).slice(0,400));const bytes=await r.arrayBuffer();const AC=globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext;if(!AC)throw Object.assign(Error('Chưa có bộ giải mã âm thanh trình duyệt.'),{khongHoTro:true});const ac=new AC(1,1,16000),decoded=await ac.decodeAudioData(bytes.slice(0));if(decoded.duration<=0)throw Error('MP3 không có âm thanh.');log('Edge MP3: '+bytes.byteLength+' byte · Safari giải mã '+decoded.duration.toFixed(2)+' giây');$('audio').src=url(new Blob([bytes],{type:'audio/mpeg'}));$('audio').hidden=false;$('previews').hidden=false;
}
$('start').onclick=async()=>{
  if(controller)return;controller=new AbortController();setRunSignal(controller.signal);started=performance.now();resetMedia();if(!globalThis.PHARunLog)$('log').value='';$('results').replaceChildren();$('start').disabled=true;$('source').disabled=true;$('edgeEnabled').disabled=true;$('stop').disabled=false;log('PHA thiết bị · '+new Date().toISOString());log(JSON.stringify(env));log('Đời máy: do người dùng xác nhận; không suy ra từ UA. Video giữ trên điện thoại.');
  try{
    if(!env.secure||!env.WebAssembly)throw Error('Cần HTTPS và WebAssembly.');
    if(navigator.gpu)await step('WebGPU: xin bộ xử lý đồ hoạ',async()=>{const a=await navigator.gpu.requestAdapter();if(!a)throw Object.assign(Error('Không lấy được GPU adapter.'),{khongHoTro:true});const d=await a.requestDevice();d.destroy();log('Có GPU device. Chưa chạy mô hình tách nhạc AI.');},{ms:15000,optional:true});
    else log('⏭ WebGPU chưa có; chưa kiểm tra tách nhạc AI bằng CPU.');
    await step('Tải FFmpeg trong Safari',loadFF,{ms:120000,onTimeout:()=>ff?.terminate()});
    const sample=await step('Tạo video mẫu H.264/AAC hai giây',createSample,{onTimeout:()=>ff?.terminate()});
    const chosen=$('source').files[0]||sample;log('File tách tiếng: '+chosen.name+' · '+chosen.size+' byte');
    // An extraction failure is recorded but must not hide the other checks.
    await step('Tách tiếng 16 kHz từ '+(chosen===sample?'mẫu':'video đã chọn'),()=>extract(chosen),{optional:true,onTimeout:()=>ff?.terminate()});
    await step('Ghép MP4: giữ hình, tiếng AAC 160k',()=>mux('/sample.mp4'),{onTimeout:()=>ff?.terminate()});
    // Release the WASM worker before hardware video encoding on iPhone.
    ff.terminate();ff=null;log('Đã giải phóng FFmpeg trước khi chèn chữ/logo.');
    const rendered=await step('WebCodecs: phụ đề Việt, che chữ & logo trên mẫu',async()=>{
      const layers=macDinhLop();layers.phuDe.co=9;layers.phuDe.y=77;layers.che={...layers.che,bat:true,kieu:'mau',w:96,h:24,y:78};layers.logo={...layers.logo,bat:true,co:24,mo:100,x:82,y:15};
      const logo=document.createElement('canvas');logo.width=180;logo.height=60;const c=logo.getContext('2d');c.fillStyle='#cef3e5';c.fillRect(0,0,180,60);c.fillStyle='#174e3c';c.font='bold 32px system-ui';c.fillText('PHAHA',18,42);
      const out=await xuatHinh(sample,(ctx,W,H,t)=>veLop(ctx,W,H,t,layers,[{start:0,end:2,vi:'Ánh sáng • Màu sắc tiếng Việt'}],logo),()=>{});if(!isMp4(new Uint8Array(await out.blob.slice(0,12).arrayBuffer())))throw Error('Video chèn chữ không phải MP4.');log('WebCodecs: '+out.codec+' · '+out.W+'×'+out.H+' · '+out.blob.size+' byte');return out.blob;
    },{ms:90000,optional:true,onTimeout:()=>controller.abort(new DOMException('Dừng do chèn chữ quá thời gian','AbortError'))});
    if(rendered){
      await step('Ghép tiếng vào mẫu có phụ đề',async()=>{await loadFF();await ff.writeFile('/sample.mp4',new Uint8Array(await sample.arrayBuffer()));await ff.writeFile('/overlay.mp4',new Uint8Array(await rendered.arrayBuffer()));await mux('/overlay.mp4');},{ms:120000,onTimeout:()=>ff?.terminate()});
    }
    if($('edgeEnabled').checked)await step('Edge: tạo MP3 & giải mã trên điện thoại',testEdge,{ms:120000,optional:true,onTimeout:()=>controller.abort(new DOMException('Dừng do Edge quá thời gian','AbortError'))});
    const failed=[...$('results').children].some(li=>li.textContent.startsWith('❌')),unsupported=[...$('results').children].some(li=>li.textContent.startsWith('⏭'));
    $('status').textContent=failed?'Có bước lỗi. Sao chép nhật ký để tìm nguyên nhân.':unsupported?'Đã chạy; có chức năng chưa hỗ trợ. Xem nhật ký.':'Các bước đã chạy đều đạt. Bấm phát mẫu để kiểm tra hình và tiếng.';log($('status').textContent);log('Chưa thử ASR/dịch bằng API riêng, tách nhạc AI, Piper, toàn bộ video dài hoặc tải RedNote.');
  }catch(e){$('status').textContent=controller.signal.aborted?'Đã dừng kiểm tra.':'Kiểm tra dừng: '+e.message;log($('status').textContent);if(tail.length)log('FFmpeg cuối: '+tail.slice(-18).join('\n'));}
  finally{ff?.terminate();ff=null;setRunSignal(null);controller=null;$('start').disabled=false;$('source').disabled=false;$('edgeEnabled').disabled=false;$('stop').disabled=true;}
};
$('stop').onclick=()=>{controller?.abort(new DOMException('Người dùng dừng','AbortError'));ff?.terminate();};
$('copy').onclick=async()=>{if(globalThis.PHARunLog)return globalThis.PHARunLog.copy('log','copyStatus');try{await navigator.clipboard.writeText($('log').value);$('copyStatus').textContent='Đã sao chép. Dán nhật ký vào cuộc trò chuyện.';}catch{$('log').focus();$('log').select();$('log').setSelectionRange(0,$('log').value.length);$('copyStatus').textContent='Đã chọn nhật ký. Nhấn Sao chép trong menu của Safari, hoặc tải file .txt.';}};
$('clearLog').onclick=()=>{if(globalThis.PHARunLog)globalThis.PHARunLog.clear();else $('log').value='';$('copyStatus').textContent='Đã xóa toàn bộ nhật ký trên máy này.';};
$('saveLog').onclick=()=>{const blob=new Blob([$('log').value],{type:'text/plain;charset=utf-8'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='PHA-iphone-test.txt';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),30000);};
addEventListener('pagehide',()=>{controller?.abort();ff?.terminate();resetMedia();});
