import {runSignal} from "./site-bridge.js";
// =====================================================
// PHỤ ĐỀ, LỚP CHE CHỮ TRUNG & LOGO
// - Vẽ lên từng khung hình (dùng chung cho ô xem thử và lúc xuất video)
// - Xuất video bằng bộ mã hoá có sẵn trong điện thoại (nhanh, không tốn phí)
// =====================================================
const MB = "https://cdn.jsdelivr.net/npm/mediabunny@1.61.1/dist/bundles/mediabunny.min.mjs";
const PHONG = '"Be Vietnam Pro", system-ui, sans-serif';
// Độ nét khi dựng hình (0–1). Trước đây 0,75 (≈6 Mb/giây cho 1080p H.264, có máy còn tự đẩy cao hơn nhiều).
// 0,65 ≈ 4,7 Mb/giây và luôn giữ đúng mức đó (preferBitrate) → file nhẹ hơn, dung lượng đoán trước được.
// Muốn nét hơn: tăng lên 0,75.
const CHAT_LUONG = 0.65;
export const RENDER_DIAG_VERSION = 'HINH-R2';

export function macDinhLop() {
  return {
    phuDe: { bat: true, co: 5, y: 88, mau: "#ffffff", kieu: "vien" },
    che: { bat: false, kieu: "mo", mau: "#000000", x: 50, y: 88, w: 90, h: 10 },
    logo: { bat: false, co: 18, mo: 80, x: 88, y: 10 },
  };
}

// Có cần vẽ gì lên hình không (không thì giữ nguyên hình gốc, xuất rất nhanh)
export function canVe(lop, cacCau, anhLogo) {
  return (lop.phuDe.bat && cacCau.length > 0) || lop.che.bat || (lop.logo.bat && !!anhLogo);
}

let tam = null; // khung phụ để làm mờ
export function veLop(ctx, W, H, t, lop, cacCau, anhLogo, chuMau, trace = () => {}) {
  // 1. Lớp che chữ Trung
  const c = lop.che;
  if (c.bat) {
    trace('mask','begin',{time:t,mode:c.kieu});
    const w = Math.max(2, (c.w / 100) * W), h = Math.max(2, (c.h / 100) * H);
    const x = Math.round(Math.min(W - w, Math.max(0, (c.x / 100) * W - w / 2)));
    const y = Math.round(Math.min(H - h, Math.max(0, (c.y / 100) * H - h / 2)));
    if (c.kieu === "mau") {
      ctx.fillStyle = c.mau;
      ctx.fillRect(x, y, w, h);
    } else {
      // làm mờ: thu nhỏ vùng đó thật bé rồi phóng to lại
      const nho = Math.max(4, Math.round(Math.min(W, H) / 40));
      const sw = Math.max(1, Math.round(w / nho)), sh = Math.max(1, Math.round(h / nho));
      tam ||= new OffscreenCanvas(1, 1);
      if (tam.width !== sw || tam.height !== sh) { tam.width = sw; tam.height = sh; }
      const tc = tam.getContext("2d");
      tc.imageSmoothingEnabled = true;
      tc.imageSmoothingQuality = "high";
      tc.drawImage(ctx.canvas, x, y, w, h, 0, 0, sw, sh);
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(tam, 0, 0, sw, sh, x, y, w, h);
      ctx.restore();
    }
    trace('mask','end',{time:t});
  }

  // 2. Phụ đề tiếng Việt
  const p = lop.phuDe;
  if (p.bat) {
    let chu = chuMau || "";
    for (let i = 0; i < cacCau.length; i++) {
      const cau = cacCau[i];
      const het = Math.min(cau.end + 0.3, cacCau[i + 1]?.start ?? Infinity);
      if (t >= cau.start && t < het) { chu = cau.vi; break; }
    }
    if (chu) {trace('subtitle','begin',{time:t,characters:chu.length});vePhuDe(ctx, W, H, chu, p);trace('subtitle','end',{time:t});}
  }

  // 3. Logo
  const l = lop.logo;
  if (l.bat && anhLogo) {
    trace('logo','begin',{time:t,width:anhLogo.width,height:anhLogo.height});
    const w = (l.co / 100) * W;
    const h = w * (anhLogo.height / anhLogo.width);
    const x = Math.min(W - w, Math.max(0, (l.x / 100) * W - w / 2));
    const y = Math.min(H - h, Math.max(0, (l.y / 100) * H - h / 2));
    ctx.save();
    ctx.globalAlpha = l.mo / 100;
    ctx.drawImage(anhLogo, x, y, w, h);
    ctx.restore();
    trace('logo','end',{time:t});
  }
}

// Nhớ sẵn cách xuống dòng của từng câu: một câu hiện trên ~60–150 khung hình liền nhau,
// không cần đo chữ lại ở mỗi khung (video 15 phút ≈ 27.000 khung).
const dongDaChia = new Map();
function vePhuDe(ctx, W, H, chu, p) {
  const co = Math.max(8, (p.co / 100) * H);
  ctx.save();
  ctx.font = `700 ${co}px ${PHONG}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const khoa = W + "|" + co + "|" + chu;
  let nho = dongDaChia.get(khoa);
  if (!nho) {
    // xuống dòng khi câu dài quá 90% chiều ngang
    const dong = [];
    let hien = "";
    for (const tu of chu.split(/\s+/)) {
      const thu = hien ? hien + " " + tu : tu;
      if (hien && ctx.measureText(thu).width > W * 0.9) { dong.push(hien); hien = tu; }
      else hien = thu;
    }
    if (hien) dong.push(hien);
    nho = { dong, rong: Math.max(...dong.map((d) => ctx.measureText(d).width)) };
    if (dongDaChia.size > 400) dongDaChia.clear();
    dongDaChia.set(khoa, nho);
  }
  const dong = nho.dong;
  const cao = co * 1.3;
  const giua = Math.min(H - (cao * dong.length) / 2, Math.max((cao * dong.length) / 2, (p.y / 100) * H));
  const dau = giua - (cao * (dong.length - 1)) / 2;
  if (p.kieu === "nen") {
    const rong = nho.rong + co;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect?.(W / 2 - rong / 2, dau - cao / 2 - co * 0.15, rong, cao * dong.length + co * 0.3, co * 0.3);
    if (!ctx.roundRect) ctx.rect(W / 2 - rong / 2, dau - cao / 2 - co * 0.15, rong, cao * dong.length + co * 0.3);
    ctx.fill();
  }
  dong.forEach((d, i) => {
    const y = dau + i * cao;
    if (p.kieu !== "nen") {
      ctx.lineJoin = "round";
      ctx.lineWidth = co * 0.2;
      ctx.strokeStyle = "#000";
      ctx.strokeText(d, W / 2, y);
    }
    ctx.fillStyle = p.mau;
    ctx.fillText(d, W / 2, y);
  });
  ctx.restore();
}

// Xuất phần HÌNH (không tiếng) có phụ đề/lớp che/logo
async function choDungHinh(work, signal, stage, timeout = 30000, activity, late) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    let done = false, timer;
    const finish = (fn, value) => {
      if (done) return;
      done = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); fn(value);
    };
    const abort = () => finish(reject, signal.reason);
    const check = () => {
      const remaining = activity ? timeout - (Date.now() - activity()) : 0;
      if (remaining > 0) { timer = setTimeout(check, remaining); return; }
      const error = new Error('Không có phản hồi khi ' + stage() + ' trong ' + Math.round(timeout / 1000) + ' giây.');
      error.name = 'TimeoutError'; finish(reject, error);
    };
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(check, timeout);
    Promise.resolve().then(() => { signal?.throwIfAborted(); return work(); }).then(value => {
      if (done) { void Promise.resolve().then(()=>late?.(value)).catch(()=>{}); return; }
      if (signal?.aborted) abort(); else finish(resolve, value);
    }, error => finish(reject, error));
  });
}

// Safari can stop producing frames without rejecting execute(). Every wait below
// is bounded; a stalled conversion is disposed before trying the sequential path.
export async function xuatHinh(tep, ve, baoTienDo, signal = runSignal(), baoNhatKy = () => {}, baoChanDoan = () => {}, options = {}) {
  // Capture this run before loading fonts/modules. A cancelled conversion
  // cannot inherit the signal of a later run while those imports resolve.
  const assertRunning = () => signal?.throwIfAborted();
  assertRunning();
  if (typeof VideoEncoder === "undefined" || typeof OffscreenCanvas === "undefined") {
    throw Object.assign(new Error("Điện thoại chưa hỗ trợ chèn chữ/logo (cần iOS 17 trở lên)."), { khongHoTro: true });
  }
  baoNhatKy('Dựng hình: chuẩn bị phông chữ');
  try { await choDungHinh(() => (typeof document==='undefined'?globalThis.fonts:document.fonts)?.load(`700 40px ${PHONG}`), signal, () => 'tải phông chữ', 10000); }
  catch (error) { assertRunning(); baoNhatKy('Phông chữ chưa tải được → dùng phông dự phòng của máy'); }
  assertRunning();
  baoNhatKy('Dựng hình: tải thư viện xử lý hình');
  const mb = await choDungHinh(() => import(MB), signal, () => 'tải thư viện xử lý hình', 45000);
  assertRunning();
  let screen, ended = false;
  const hold = async () => {
    try { const lock = await globalThis.navigator?.wakeLock?.request('screen'); if (ended) await lock?.release(); else screen = lock; } catch {}
  };
  const visible = () => { if (globalThis.document?.visibilityState === 'visible' && (!screen || screen.released)) void hold(); };
  void hold(); globalThis.document?.addEventListener?.('visibilitychange', visible);
  try {
    if(options.compatible)return await dungMotLan(true);
    try { return await dungMotLan(false); }
    catch (error) {
      assertRunning();
      if (!['TimeoutError', 'EncodingError', 'UnknownError', 'OperationError', 'InvalidStateError', 'NotReadableError'].includes(error.name)) throw error;
      baoNhatKy('⚠️ ' + error.message + ' → dựng lại từng khung hình bằng chế độ tương thích, giữ phụ đề/lớp che/logo');
      baoTienDo(0);
      return await dungMotLan(true);
    }
  } finally {
    ended = true; globalThis.document?.removeEventListener?.('visibilitychange', visible);
    try { await choDungHinh(()=>screen?.release(),null,()=> 'trả khóa màn hình',3000); } catch {}
  }

  async function dungMotLan(tuongThich) {
  const controller = new AbortController();
  const localSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  const check = () => localSignal.throwIfAborted();
  const storage=globalThis.PHAVideoDownload;
  let stage='mở nguồn video',disk,conv,completed=false,output;
  let lastActivity=Date.now(),frames=0,lastProgress=-1,lastLog=Date.now(),iterator,heartbeat,frameIndex=0;
  const trace = (phase,event,details={}) => { try{baoChanDoan({phase,event,frame:frameIndex||frames+1,stage,...details});}catch{} };
  const touch = () => { lastActivity = Date.now(); };
  const wait = async (work, timeout=30000, idle=false, late, phase='prepare') => {
    const detail={stage},started=Date.now();trace(phase,'begin',detail);
    try{const result=await choDungHinh(work,localSignal,()=>stage,timeout,idle?()=>lastActivity:undefined,late);trace(phase,'end',{...detail,ms:Date.now()-started});return result;}
    catch(error){trace(phase,'error',{...detail,name:error.name,message:error.message,ms:Date.now()-started});throw error;}
  };
  // Cancellation itself can hang in WebKit. Never await it without a deadline.
  const cleanup = async work => { try { await choDungHinh(work,null,()=> 'dọn bộ dựng hình',3000); } catch {} };
  const lateAbort = value => { Promise.resolve().then(()=>value?.abort?.()).catch(()=>{}); };
  const source=storage?.mediaSource?.(mb,tep,{signal:localSignal,onRetry:r=>baoNhatKy('Đọc lại video: '+r.name+' · byte '+r.start+'–'+r.end+' · lần '+r.attempt),onRead:r=>trace('read',r.event,r)})||new mb.BlobSource(tep,{useStreamReader:false,maxCacheSize:4*1048576});
  const input = new mb.Input({ source, formats: mb.ALL_FORMATS });
  try{
  check();
  stage='đọc thông tin hình';baoNhatKy('Dựng hình: '+stage+(tuongThich?' · chế độ tương thích':''));
  const vt = await wait(()=>input.getPrimaryVideoTrack());
  if (!vt) throw new Error("Video không có hình.");
  const ratio=Math.min(1,1080/Math.min(vt.displayWidth,vt.displayHeight),1920/Math.max(vt.displayWidth,vt.displayHeight));
  const W=Math.max(2,Math.floor(vt.displayWidth*ratio/2)*2),H=Math.max(2,Math.floor(vt.displayHeight*ratio/2)*2);
  const quality = new mb.Quality({ quality: CHAT_LUONG, preferBitrate: true });
  stage='chọn bộ mã hoá';let acceleration = tuongThich ? 'prefer-software' : 'no-preference';
  const pick = () => mb.getFirstEncodableVideoCodec(["avc", "hevc"], { width: W, height: H, quality, hardwareAcceleration: acceleration });
  let codec = await wait(pick);
  if(!codec&&tuongThich){acceleration='no-preference';codec=await wait(pick);}
  if (!codec) throw Object.assign(new Error("Điện thoại không dựng lại được video cỡ này."), { khongHoTro: true });
  // Video 60 hình/giây: dựng 30 hình/giây là đủ xem trên điện thoại, đỡ một nửa số khung phải vẽ và mã hoá.
  stage='đo số hình mỗi giây';let fps=0;try{fps=(await wait(()=>vt.computePacketStats(90),15000)).averagePacketRate||0}catch{check();}
  const fpsRa=fps>32?30:undefined;if(fpsRa)baoNhatKy('Dựng hình: video gốc '+Math.round(fps)+' hình/giây → dựng 30 hình/giây (nhanh gần gấp đôi)');
  const khung = new OffscreenCanvas(W, H);
  const ctx = khung.getContext("2d", { alpha:false, willReadFrequently:tuongThich });
  if(!ctx)throw new Error('Không mở được vùng vẽ phụ đề/logo.');
  const draw = (mau,time=mau.timestamp) => {
    check();frameIndex=frames+1;trace('video','begin',{time,width:W,height:H});mau.drawWithFit(ctx,{fit:'fill'});trace('video','end',{time});
    trace('overlay','begin',{time});ve(ctx,W,H,time,trace);trace('overlay','end',{time});frames++;touch();return khung;
  };
  stage='mở bộ lưu hình';
  if(storage?.outputFile&&await wait(()=>storage.canUseDisk?.())){
    disk=await wait(()=>storage.outputFile('PHA-hinh-1080p.mp4'),30000,false,lateAbort);
    const stream=new WritableStream({write:async chunk=>{check();trace('write','begin',{bytes:chunk.data.length,position:chunk.position});await wait(()=>disk.write(chunk.data,chunk.position),30000,false,undefined,'storage');check();trace('write','end',{bytes:chunk.data.length,position:chunk.position});touch();}});
    output=new mb.Output({format:new mb.Mp4OutputFormat({fastStart:false}),target:new mb.StreamTarget(stream,{chunked:true,chunkSize:1048576})});
    baoNhatKy('Dựng hình: ghi từng phần xuống bộ lưu trữ app');
  }else{
    if(tep.size>256*1048576)throw new Error('Safari chưa cho lưu hình dựng vào app. Hãy mở ngoài chế độ riêng tư rồi thử lại.');
    output=new mb.Output({format:new mb.Mp4OutputFormat({fastStart:'in-memory'}),target:new mb.BufferTarget()});
  }
  check();stage='khởi động dựng hình';
  baoNhatKy('Dựng hình: '+W+'×'+H+' · '+codec+' · '+(tuongThich?'từng khung, '+acceleration:'chế độ nhanh'));
  const progress = p => { check();if(p>lastProgress){lastProgress=p;touch();baoTienDo(p);} };
  heartbeat=setInterval(()=>{if(Date.now()-lastLog>=10000){lastLog=Date.now();baoNhatKy('Dựng hình: '+stage+' · '+frames+' khung · '+Math.max(0,Math.round(lastProgress*100))+'% · '+Math.round((Date.now()-lastActivity)/1000)+' giây chưa có tiến triển');}},10000);
  if(tuongThich){
    stage='đọc thời lượng hình';const duration=await wait(()=>vt.computeDuration());
    if(!(duration>0&&Number.isFinite(duration)))throw new Error('Không đọc được thời lượng hình.');
    const firstTimestamp=Math.max(0,await wait(()=>vt.getFirstTimestamp?.())||0);
    const rate=fps>0?Math.min(30,fps):30,count=Math.ceil(duration*rate);
    let decoder={optimizeForLatency:true};
    if(globalThis.VideoDecoder?.isConfigSupported&&vt.getDecoderConfig){
      try{
        const config=await wait(()=>vt.getDecoderConfig());
        const supported=await wait(()=>globalThis.VideoDecoder.isConfigSupported({...config,hardwareAcceleration:'prefer-software'}));
        if(supported.supported)decoder.hardwareAcceleration='prefer-software';
      }catch{check();baoNhatKy('Dựng hình: dùng bộ giải mã mặc định của máy');}
    }
    const samples=new mb.VideoSampleSink(vt,decoder),encoded=new mb.VideoSampleSource({codec,quality,hardwareAcceleration:acceleration});
    output.addVideoTrack(encoded,{frameRate:rate});
    await wait(()=>output.start());
    const times=Array.from({length:count},(_,i)=>i/rate);
    // A track may begin after zero. Hold its first frame across that initial gap,
    // while keeping captions, audio and the output timeline at their original times.
    iterator=samples.samplesAtTimestamps(times.map(time=>Math.max(firstTimestamp,time)))[Symbol.asyncIterator]();
    for(let i=0;i<count;i++){
      frameIndex=i+1;stage='giải mã khung '+(i+1)+'/'+count;
      const next=await wait(()=>iterator.next(),45000,false,r=>r?.value?.close(),'decode');
      if(next.done||!next.value)throw new Error('Thiếu khung hình ở giây '+times[i].toFixed(2)+'.');
      const sample=next.value;let painted;
      try{
        // Use the requested timeline, including when the same source frame is repeated.
        // Overlay time follows output time rather than the source frame's timestamp.
        draw(sample,times[i]);
        painted=new mb.VideoSample(khung,{timestamp:times[i],duration:Math.min(1/rate,duration-times[i])});
        stage='mã hoá khung '+(i+1)+'/'+count;
        await wait(()=>encoded.add(painted),45000,false,undefined,'encode');check();
      }finally{painted?.close();sample.close();}
      progress((i+1)/count*.99);
    }
    encoded.close();stage='hoàn tất mã hoá hình';await wait(()=>output.finalize(),45000,false,undefined,'finalize');
  }else{
  conv = await wait(()=>mb.Conversion.init({
    input,
    output,
    showWarnings: false,
    audio: { discard: true },
    video: {
      codec,
      forceTranscode: true,
      allowTransformationMetadata: false,
      quality,
      frameRate: fpsRa,
      width: W,
      height: H,
      fit: 'fill',
      processedWidth: W,
      processedHeight: H,
      process: draw,
    },
  }),30000,false,value=>{Promise.resolve().then(()=>value.cancel()).catch(()=>{});});
  if (!conv.isValid) {
    throw Object.assign(new Error("Điện thoại không đọc được hình của video này."), { khongHoTro: true });
  }
  conv.onProgress = progress;
  stage='dựng các khung hình';
  touch();await wait(()=>conv.execute(),45000,true,undefined,'conversion');check();
  }
  stage='hoàn tất file hình';baoNhatKy('Dựng hình: '+stage+' · '+frames+' khung');
  const blob=disk?await wait(()=>disk.finish(),30000,false,file=>{Promise.resolve(storage.release?.(file)).catch(()=>{});},'finalize'):new Blob([output.target.buffer],{type:'video/mp4'});
  check();completed=true;baoTienDo(1);return {blob,codec,W,H};
  }catch(e){
    controller.abort(e);
    if(e.name!=='AbortError'){const detail=new Error('Chèn chữ/logo · '+stage+' · '+(e.name||'Error')+': '+e.message,{cause:e});detail.name=e.name;detail.khongHoTro=e.khongHoTro;throw detail;}
    throw e;
  }finally{
    clearInterval(heartbeat);controller.abort();input.dispose();
    if(!completed){
      await cleanup(()=>conv?conv.cancel():output?.cancel?.());
      if(disk)await cleanup(()=>disk.abort());
    }
    if(iterator)void Promise.resolve().then(()=>iterator.return?.()).catch(()=>{});
  }
  }
}

// The page supervises a separate worker. A synchronous GPU/canvas call can block
// a render thread and its own timers, but cannot block this page's watchdog.
export async function xuatLop(tep, lop, cau, logo, baoTienDo, signal=runSignal(), log=()=>{}) {
  signal?.throwIfAborted();
  const id=globalThis.crypto?.randomUUID?.()||String(Date.now());
  const prefix=RENDER_DIAG_VERSION+' · '+id.slice(0,8)+' · ';
  const nhat=message=>log(prefix+message);
  const safari=/AppleWebKit/.test(globalThis.navigator?.userAgent||'')&&!/Chrome|Chromium|Edg|OPR|Android/.test(globalThis.navigator?.userAgent||'');
  nhat('bắt đầu · '+tep.size+' byte · phụ đề '+(lop.phuDe.bat?cau.length+' câu':'tắt')+' · lớp che '+(lop.che.bat?lop.che.kieu:'tắt')+' · logo '+(lop.logo.bat&&logo?logo.width+'×'+logo.height:'tắt'));
  if(typeof globalThis.Worker!=='function'||typeof VideoEncoder==='undefined'){
    nhat('không có Worker/WebCodecs ở môi trường này → dựng trên luồng hiện tại');
    return xuatHinh(tep,(ctx,w,h,t,trace)=>veLop(ctx,w,h,t,lop,cau,logo,undefined,trace),baoTienDo,signal,nhat,undefined,{compatible:safari});
  }
  const labels={prepare:'chuẩn bị',read:'đọc nguồn',decode:'giải mã',video:'vẽ hình',overlay:'vẽ lớp',mask:'lớp che',subtitle:'phụ đề',logo:'logo',encode:'mã hóa',write:'ghi file',storage:'chờ bộ lưu',finalize:'đóng file',conversion:'đường dựng nhanh'};
  const counters=new Map(),partials=new Map();let lastEvent='khởi động Worker',lastAdvance=Date.now(),lastPrinted=Date.now(),lastProgress=-1,worker,bitmap,ready=false,stopped=false,keepName=null,timer;
  const state=()=>[...counters].filter(([,v])=>v.started).map(([k,v])=>labels[k]+' '+v.ended+'/'+v.started+(v.active?' [đang chờ '+Math.round((Date.now()-v.since)/1000)+'s]':'')).join(' · ');
  const snapshot=reason=>nhat(reason+' · cuối: '+lastEvent+' · '+(state()||'chưa có khung hình')+' · '+Math.round((Date.now()-lastAdvance)/1000)+'s chưa tiến triển · tab '+(globalThis.document?.visibilityState||'không rõ'));
  let screen;
  const hold=async()=>{try{const lock=await globalThis.navigator?.wakeLock?.request('screen');if(stopped)await lock?.release();else screen=lock;}catch{}};
  const visible=()=>{if(globalThis.document?.visibilityState==='visible'&&(!screen||screen.released))void hold();};
  const stop=()=>{if(stopped)return;stopped=true;clearInterval(timer);signal?.removeEventListener('abort',abort);globalThis.document?.removeEventListener?.('visibilitychange',visible);try{screen?.release?.()?.catch?.(()=>{});}catch{}worker?.terminate();bitmap?.close?.();bitmap=null;};
  let rejectJob;
  const abort=()=>{snapshot('Đã bấm Dừng');stop();rejectJob?.(signal.reason);};
  try{
    void hold();globalThis.document?.addEventListener?.('visibilitychange',visible);
    const payload=await new Promise((resolve,reject)=>{
      rejectJob=reject;
      const fail=error=>{if(stopped)return;snapshot('LỖI '+error.name+': '+error.message);stop();reject(error);};
      worker=new Worker(new URL('./render-worker.js',import.meta.url),{type:'module'});
      signal?.addEventListener('abort',abort,{once:true});
      if(signal?.aborted){abort();return;}
      timer=setInterval(()=>{
        if(Date.now()-lastPrinted>=5000){lastPrinted=Date.now();snapshot('THEO DÕI');}
        if(Date.now()-lastAdvance>(ready?60000:15000)){
          const error=new Error('Worker dựng hình không tiến triển: '+lastEvent+'. '+state()+'. Đã dừng Worker; sao chép log '+RENDER_DIAG_VERSION+' để kiểm tra.');error.name='TimeoutError';fail(error);
        }
      },2000);
      worker.onerror=event=>{const error=new Error('Worker: '+(event.message||'không tải được mã hoặc Worker bị kết thúc')+(event.lineno?' · dòng '+event.lineno+':'+event.colno:''));error.name='RenderWorkerError';fail(error);};
      worker.onmessageerror=()=>fail(new Error('Không chuyển được dữ liệu video/logo giữa trang và Worker.'));
      worker.onmessage=async({data:d})=>{
        if(stopped||!d)return;
        try{
          if(d.type==='ready'){
            if(ready)return;
            if(d.version!==RENDER_DIAG_VERSION)throw new Error('Mã Worker khác phiên bản trang. Hãy tải lại trang.');
            nhat('Worker sẵn sàng · VideoDecoder '+d.decoder+' · VideoEncoder '+d.encoder+' · OffscreenCanvas '+d.canvas+' · OPFS '+d.storage);
            if(!d.decoder||!d.encoder||!d.canvas)throw new Error('Trình duyệt chưa hỗ trợ dựng video trong Worker. '+JSON.stringify({decoder:d.decoder,encoder:d.encoder,canvas:d.canvas}));
            ready=true;lastAdvance=Date.now();
            if(lop.logo.bat&&logo){
              lastEvent='tạo ImageBitmap logo';nhat('BẮT ĐẦU '+lastEvent);
              const scale=Math.min(1,1080/logo.width,1080/logo.height),w=Math.max(1,Math.round(logo.width*scale)),h=Math.max(1,Math.round(logo.height*scale));
              bitmap=await choDungHinh(()=>globalThis.createImageBitmap(logo,{resizeWidth:w,resizeHeight:h,resizeQuality:'high'}),signal,()=>lastEvent,30000,undefined,b=>b.close());
              if(stopped){bitmap.close();bitmap=null;return;}nhat('XONG logo ImageBitmap '+bitmap.width+'×'+bitmap.height);lastAdvance=Date.now();
            }
            signal?.throwIfAborted();lastEvent='gửi video vào Worker';
            const reference=globalThis.PHAVideoDownload?.reference?.(tep);
            nhat((reference?'đọc lại video từ OPFS':'đọc file bằng BlobSource')+' · '+(safari?'Safari: dựng tuần tự ngay từ đầu':'đường dựng nhanh')+' · đồng hồ giám sát ở luồng giao diện');
            worker.postMessage({type:'render',id,reference,file:reference?null:tep,lop,cau,logo:bitmap,compatible:safari},bitmap?[bitmap]:[]);bitmap=null;
          }else if(d.id===id){
            if(d.type==='created'){partials.set(d.reference.cacheName,d.reference);}
            else if(d.type==='log'){nhat(d.message);}
            else if(d.type==='progress'){
              if(d.value>lastProgress){lastProgress=d.value;lastAdvance=Date.now();}baoTienDo(d.value);
            }else if(d.type==='trace'){
              const e=d.trace,k=e.phase,v=counters.get(k)||{started:0,ended:0,active:0,since:0};
              lastEvent=(labels[k]||k)+(e.stage?' · '+e.stage:'')+(e.frame?' · khung '+e.frame:'')+(Number.isFinite(e.time)?' · giây '+e.time.toFixed(3):'')+(Number.isFinite(e.start)?' · byte '+e.start+'–'+e.end:'');
              if(e.event==='begin'){v.started++;if(!v.active)v.since=Date.now();v.active++;}
              else{v.active=Math.max(0,v.active-1);if(e.event==='end'){v.ended++;lastAdvance=Date.now();}}
              counters.set(k,v);
              if((e.frame<=3&&['video','subtitle','mask','logo','decode','encode'].includes(k))||e.event==='error'||['prepare','finalize'].includes(k))nhat((e.event==='begin'?'BẮT ĐẦU':e.event==='end'?'XONG':'LỖI')+' '+lastEvent+(Number.isFinite(e.ms)?' · '+e.ms+'ms':'')+(e.message?' · '+e.name+': '+e.message:''));
            }else if(d.type==='result'){snapshot('XONG Worker');stop();resolve(d);}
            else if(d.type==='error'){
              if(d.stack)nhat('STACK '+String(d.stack).split('\n').slice(0,6).join(' / '));
              const error=new Error(d.message);error.name=d.name||'Error';error.khongHoTro=d.khongHoTro;fail(error);
            }
          }
        }catch(error){fail(error);}
      };
    });
    lastEvent='mở file kết quả Worker';nhat('BẮT ĐẦU '+lastEvent);
    const storage=globalThis.PHAVideoDownload;
    const file=payload.reference?await choDungHinh(()=>storage.restore(payload.reference),signal,()=>lastEvent,30000,undefined,f=>storage.release(f)):payload.blob;
    signal?.throwIfAborted();if(!file?.size)throw new Error('Worker chưa trả file hình hợp lệ.');
    keepName=payload.reference?.cacheName||null;nhat('XONG kết quả · '+file.size+' byte · '+payload.W+'×'+payload.H+' · '+payload.codec);
    return {blob:file,codec:payload.codec,W:payload.W,H:payload.H};
  }finally{
    stop();
    for(const ref of partials.values()){if(ref.cacheName===keepName)continue;
      try{await choDungHinh(()=>globalThis.PHAVideoDownload?.discard?.(ref),null,()=> 'xóa hình dựng dở',3000);}catch{}
    }
  }
}

// Ghép HÌNH (giữ nguyên, không mã hoá lại) với TIẾNG (AAC) thành MP4 và ghi thẳng xuống bộ nhớ app.
// Thay cho bước ghép bằng ffmpeg: ffmpeg ghi cả video kết quả vào RAM rồi chép ra thêm một bản nữa,
// video dài (vài trăm MB) làm iPhone tràn bộ nhớ → Safari tải lại trang. Cách này chỉ giữ vài MB trong RAM.
// Trả về null khi máy không cho dùng bộ nhớ app (vd. chế độ riêng tư) → nơi gọi dùng cách cũ.
export async function ghepVideo(tepHinh, tepAm, ten, signal = runSignal(), baoNhatKy = () => {}, baoTienDo = () => {}) {
  const assertRunning = () => signal?.throwIfAborted();
  const storage = globalThis.PHAVideoDownload;
  if (!storage?.outputFile || !(await storage.canUseDisk?.())) return null;
  const mb = await import(MB);
  assertRunning();
  const nguonHinh = storage.mediaSource?.(mb, tepHinh, { signal, onRetry: r => baoNhatKy('Đọc lại hình: byte ' + r.start + '–' + r.end + ' · lần ' + r.attempt) })
    || new mb.BlobSource(tepHinh, { useStreamReader: false, maxCacheSize: 4 * 1048576 });
  const vIn = new mb.Input({ source: nguonHinh, formats: mb.ALL_FORMATS });
  const aIn = new mb.Input({ source: new mb.BlobSource(tepAm), formats: mb.ALL_FORMATS });
  let stage = 'đọc hình và tiếng', disk, output, xong = false;
  try {
    const [vt, at] = await Promise.all([vIn.getPrimaryVideoTrack(), aIn.getPrimaryAudioTrack()]);
    if (!vt) throw new Error('Không thấy hình để ghép.');
    if (!at) throw new Error('Không thấy tiếng để ghép.');
    const [vCodec, aCodec, vCfg, aCfg, xoay, dai] = await Promise.all([
      vt.getCodec(), at.getCodec(), vt.getDecoderConfig(), at.getDecoderConfig(), vt.getRotation(), vt.computeDuration(),
    ]);
    if (!vCodec || !aCodec || !vCfg || !aCfg) throw new Error('Không đọc được kiểu nén của hình/tiếng.');
    assertRunning();
    stage = 'mở bộ lưu video';
    disk = await storage.outputFile(ten);
    const stream = new WritableStream({ write: (c) => { assertRunning(); return disk.write(c.data, c.position); } });
    output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: false }), target: new mb.StreamTarget(stream, { chunked: true, chunkSize: 1048576 }) });
    const vs = new mb.EncodedVideoPacketSource(vCodec), as = new mb.EncodedAudioPacketSource(aCodec);
    output.addVideoTrack(vs, { rotation: xoay });
    output.addAudioTrack(as);
    await output.start();
    stage = 'chép hình và tiếng';
    const vIt = new mb.EncodedPacketSink(vt).packets(), aIt = new mb.EncodedPacketSink(at).packets();
    let v = (await vIt.next()).value, a = (await aIt.next()).value, vDau = true, aDau = true, moc = -1;
    // Xen kẽ hình và tiếng theo thời gian (như lúc quay) để file được ghi tuần tự, không phải giữ chờ trong RAM.
    while (v || a) {
      assertRunning();
      if (v && (!a || v.timestamp <= a.timestamp)) {
        await vs.add(v, vDau ? { decoderConfig: vCfg } : undefined); vDau = false;
        if (dai > 0) { const p = Math.min(0.99, Math.max(0, v.timestamp / dai)), n = Math.floor(p * 20); if (n !== moc) { moc = n; baoTienDo(p); } }
        v = (await vIt.next()).value;
      } else {
        await as.add(a, aDau ? { decoderConfig: aCfg } : undefined); aDau = false;
        a = (await aIt.next()).value;
      }
    }
    stage = 'hoàn tất file';
    await output.finalize();
    const tep = await disk.finish();
    assertRunning();
    xong = true;
    baoNhatKy('Ghép video: ghi thẳng xuống bộ nhớ app · ' + (tep.size / 1048576).toFixed(1) + 'MB');
    return tep;
  } catch (e) {
    if (e.name !== 'AbortError') { const d = new Error('Ghép video · ' + stage + ' · ' + (e.name || 'Error') + ': ' + e.message, { cause: e }); d.name = e.name; throw d; }
    throw e;
  } finally {
    vIn.dispose(); aIn.dispose();
    if (!xong) { await output?.cancel?.().catch?.(() => {}); if (disk) await disk.abort().catch(() => {}); }
  }
}
