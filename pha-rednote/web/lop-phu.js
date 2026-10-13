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
export function veLop(ctx, W, H, t, lop, cacCau, anhLogo, chuMau) {
  // 1. Lớp che chữ Trung
  const c = lop.che;
  if (c.bat) {
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
    if (chu) vePhuDe(ctx, W, H, chu, p);
  }

  // 3. Logo
  const l = lop.logo;
  if (l.bat && anhLogo) {
    const w = (l.co / 100) * W;
    const h = w * (anhLogo.height / anhLogo.width);
    const x = Math.min(W - w, Math.max(0, (l.x / 100) * W - w / 2));
    const y = Math.min(H - h, Math.max(0, (l.y / 100) * H - h / 2));
    ctx.save();
    ctx.globalAlpha = l.mo / 100;
    ctx.drawImage(anhLogo, x, y, w, h);
    ctx.restore();
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
export async function xuatHinh(tep, ve, baoTienDo, signal = runSignal(), baoNhatKy = () => {}) {
  // Capture this run before loading fonts/modules. A cancelled conversion
  // cannot inherit the signal of a later run while those imports resolve.
  const assertRunning = () => signal?.throwIfAborted();
  assertRunning();
  if (typeof VideoEncoder === "undefined" || typeof OffscreenCanvas === "undefined") {
    throw Object.assign(new Error("Điện thoại chưa hỗ trợ chèn chữ/logo (cần iOS 17 trở lên)."), { khongHoTro: true });
  }
  try { await document.fonts.load(`700 40px ${PHONG}`); } catch {}
  assertRunning();
  const mb = await import(MB);
  assertRunning();
  const storage=globalThis.PHAVideoDownload;
  let stage='mở nguồn video',disk,conv,completed=false,output;
  const source=storage?.mediaSource?.(mb,tep,{signal,onRetry:r=>baoNhatKy('Đọc lại video: '+r.name+' · byte '+r.start+'–'+r.end+' · lần '+r.attempt)})||new mb.BlobSource(tep,{useStreamReader:false,maxCacheSize:4*1048576});
  const input = new mb.Input({ source, formats: mb.ALL_FORMATS });
  try{
  assertRunning();
  stage='đọc thông tin hình';const vt = await input.getPrimaryVideoTrack();
  if (!vt) throw new Error("Video không có hình.");
  const ratio=Math.min(1,1080/Math.min(vt.displayWidth,vt.displayHeight),1920/Math.max(vt.displayWidth,vt.displayHeight));
  const W=Math.max(2,Math.floor(vt.displayWidth*ratio/2)*2),H=Math.max(2,Math.floor(vt.displayHeight*ratio/2)*2);
  stage='chọn bộ mã hoá';const codec = await mb.getFirstEncodableVideoCodec(["avc", "hevc", "vp9", "av1"], { width: W, height: H });
  if (!codec) throw Object.assign(new Error("Điện thoại không dựng lại được video cỡ này."), { khongHoTro: true });
  // Video 60 hình/giây: dựng 30 hình/giây là đủ xem trên điện thoại, đỡ một nửa số khung phải vẽ và mã hoá.
  stage='đo số hình mỗi giây';let fps=0;try{fps=(await vt.computePacketStats(90)).averagePacketRate||0}catch{}
  const fpsRa=fps>32?30:undefined;if(fpsRa)baoNhatKy('Dựng hình: video gốc '+Math.round(fps)+' hình/giây → dựng 30 hình/giây (nhanh gần gấp đôi)');
  const khung = new OffscreenCanvas(W, H);
  const ctx = khung.getContext("2d");
  stage='mở bộ lưu hình';
  if(storage?.outputFile&&await storage.canUseDisk?.()){
    disk=await storage.outputFile('PHA-hinh-1080p.mp4');
    const stream=new WritableStream({write:chunk=>{assertRunning();return disk.write(chunk.data,chunk.position);}});
    output=new mb.Output({format:new mb.Mp4OutputFormat({fastStart:false}),target:new mb.StreamTarget(stream,{chunked:true,chunkSize:1048576})});
    baoNhatKy('Dựng hình: ghi từng phần xuống bộ lưu trữ app');
  }else{
    if(tep.size>256*1048576)throw new Error('Safari chưa cho lưu hình dựng vào app. Hãy mở ngoài chế độ riêng tư rồi thử lại.');
    output=new mb.Output({format:new mb.Mp4OutputFormat({fastStart:'in-memory'}),target:new mb.BufferTarget()});
  }
  assertRunning();stage='khởi động dựng hình';
  conv = await mb.Conversion.init({
    input,
    output,
    showWarnings: false,
    audio: { discard: true },
    video: {
      codec,
      forceTranscode: true,
      allowTransformationMetadata: false,
      quality: new mb.Quality({ quality: CHAT_LUONG, preferBitrate: true }),
      frameRate: fpsRa,
      processedWidth: W,
      processedHeight: H,
      process: (mau) => {
        assertRunning();
        mau.drawWithFit(ctx, { fit: "fill" });
        ve(ctx, W, H, mau.timestamp);
        return khung;
      },
    },
  });
  if (!conv.isValid) {
    throw Object.assign(new Error("Điện thoại không đọc được hình của video này."), { khongHoTro: true });
  }
  conv.onProgress = baoTienDo;
  const abort=()=>{Promise.resolve(conv.cancel()).catch(()=>{});};signal?.addEventListener("abort",abort,{once:true});
  if(signal?.aborted){await conv.cancel();assertRunning();}
  stage='dựng các khung hình';
  try{await conv.execute();assertRunning();}finally{signal?.removeEventListener("abort",abort);}
  stage='hoàn tất file hình';const blob=disk?await disk.finish():new Blob([output.target.buffer],{type:'video/mp4'});
  assertRunning();completed=true;return {blob,codec,W,H};
  }catch(e){
    if(e.name!=='AbortError'){const detail=new Error('Chèn chữ/logo · '+stage+' · '+(e.name||'Error')+': '+e.message,{cause:e});detail.name=e.name;detail.khongHoTro=e.khongHoTro;throw detail;}
    throw e;
  }finally{input.dispose();if(disk&&!completed){try{await conv?.cancel()}catch{}await disk.abort().catch(()=>{});}}
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
