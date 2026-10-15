// =====================================================
// PHỤ ĐỀ, LỚP CHE CHỮ TRUNG & LOGO
// - Vẽ lên từng khung hình (dùng chung cho ô xem thử và lúc xuất video)
// - Xuất video bằng bộ mã hoá có sẵn trong điện thoại (nhanh, không tốn phí)
// =====================================================
const MB = "https://cdn.jsdelivr.net/npm/mediabunny@1.61.1/dist/bundles/mediabunny.min.mjs";
const PHONG = '"Be Vietnam Pro", system-ui, sans-serif';

export function macDinhLop() {
  return {
    phuDe: { bat: true, co: 5, y: 88, mau: "#ffffff", kieu: "vien" },
    che: { bat: false, kieu: "mo", mau: "#000000", x: 50, y: 88, w: 90, h: 10 },
    che2: { bat: false, kieu: "mo", mau: "#000000", x: 50, y: 12, w: 90, h: 10 }, // thanh che thứ 2 (vd tiêu đề ở trên)
    logo: { bat: false, co: 18, mo: 80, x: 88, y: 10 },
  };
}

// Có cần vẽ gì lên hình không (không thì giữ nguyên hình gốc, xuất rất nhanh)
export function canVe(lop, cacCau, anhLogo) {
  return (lop.phuDe.bat && cacCau.length > 0) || lop.che.bat || !!lop.che2?.bat || (lop.logo.bat && !!anhLogo);
}

let tam = null; // khung phụ để làm mờ
export function veLop(ctx, W, H, t, lop, cacCau, anhLogo, chuMau) {
  // 1. Lớp che chữ Trung (2 thanh)
  veChe(ctx, W, H, lop.che);
  if (lop.che2) veChe(ctx, W, H, lop.che2);

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

// Vẽ 1 thanh che (làm mờ hoặc tô màu) lên vùng chữ Trung
function veChe(ctx, W, H, c) {
  if (!c?.bat) return;
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

// Cách ngắt dòng của từng câu (tính 1 lần rồi dùng lại cho mọi khung hình của câu đó)
const boNhoDong = new Map();
function vePhuDe(ctx, W, H, chu, p) {
  const co = Math.max(8, (p.co / 100) * H);
  ctx.save();
  ctx.font = `700 ${co}px ${PHONG}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // xuống dòng khi câu dài quá 90% chiều ngang
  const khoa = `${W}|${co}|${chu}`;
  let dong = boNhoDong.get(khoa);
  if (!dong) {
    dong = [];
    let hien = "";
    for (const tu of chu.split(/\s+/)) {
      const thu = hien ? hien + " " + tu : tu;
      if (hien && ctx.measureText(thu).width > W * 0.9) { dong.push(hien); hien = tu; }
      else hien = thu;
    }
    if (hien) dong.push(hien);
    if (boNhoDong.size > 2000) boNhoDong.clear();
    boNhoDong.set(khoa, dong);
  }
  const cao = co * 1.3;
  const giua = Math.min(H - (cao * dong.length) / 2, Math.max((cao * dong.length) / 2, (p.y / 100) * H));
  const dau = giua - (cao * (dong.length - 1)) / 2;
  if (p.kieu === "nen") {
    const rong = Math.max(...dong.map((d) => ctx.measureText(d).width)) + co;
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

// Thư viện dựng video: tải từ jsDelivr, chậm/kẹt thì lấy bản giống hệt từ unpkg
const MB_DU_PHONG = "https://unpkg.com/mediabunny@1.61.1/dist/bundles/mediabunny.min.mjs";
let thuVien = null;
const henGio = (hua, giay, ten) => Promise.race([hua, new Promise((_, loi) => setTimeout(() => loi(new Error(ten + " quá " + giay + " giây")), giay * 1000))]);
async function taiThuVien(ghi) {
  if (thuVien) return thuVien;
  for (const [url, giay] of [[MB, 25], [MB_DU_PHONG, 40]]) {
    try { return (thuVien = await henGio(import(url), giay, "tải thư viện")); }
    catch (loi) { ghi(`tải thư viện từ ${new URL(url).hostname} không được (${loi.message})`); }
  }
  throw new Error("Không tải được thư viện dựng video (mạng chậm hoặc bị chặn). Thử lại sau, hoặc đổi mạng Wi-Fi/4G.");
}

// Safari thỉnh thoảng kẹt ở câu hỏi "mã hoá được cấu hình này không?" (VideoEncoder.isConfigSupported không bao giờ trả lời).
// Khi đó dùng bộ mã hoá H.264 của máy TRỰC TIẾP, bỏ qua câu hỏi đó (thư viện chỉ hỏi khi không có bộ mã hoá riêng).
let dungMaThang = false, daDangKy = false;
const maThang = () => globalThis.__phahaMaThang || "avc"; // máy kiểm tra (Chromium không có H.264) đổi sang vp9
function batMaThang(mb) {
  dungMaThang = true;
  if (daDangKy) return;
  daDangKy = true;
  class MaThang extends mb.CustomVideoEncoder {
    static supports(codec) { return dungMaThang && codec === maThang(); }
    init() {
      this.enc = new VideoEncoder({
        output: (chunk, meta) => this.onPacket(mb.EncodedPacket.fromEncodedChunk(chunk), meta),
        error: (e) => this.onError?.(e),
      });
      this.enc.configure(this.config);
    }
    async encode(mau, tuyChon) {
      const khung = mau.toVideoFrame();
      try { this.enc.encode(khung, tuyChon); } finally { khung.close(); mau.close(); }
      // đừng dồn quá nhiều khung chờ mã hoá (tốn bộ nhớ)
      while (this.enc.encodeQueueSize > 6) await new Promise((x) => setTimeout(x, 5));
    }
    async flush() { await this.enc.flush(); }
    close() { if (this.enc && this.enc.state !== "closed") this.enc.close(); }
  }
  mb.registerEncoder(MaThang);
}

// Xuất phần HÌNH (không tiếng) có phụ đề/lớp che/logo
// Canh treo cả quá trình: quá choToiDa giây không nhích (lúc trang đang mở) thì huỷ và báo treo để làm lại
export async function xuatHinh(tep, ve, baoTienDo, choToiDa = 60, ghi = () => {}) {
  if (typeof VideoEncoder === "undefined" || typeof OffscreenCanvas === "undefined") {
    throw Object.assign(new Error("Điện thoại chưa hỗ trợ chèn chữ/logo (cần iOS 17 trở lên)."), { khongHoTro: true });
  }
  let lanCuoi = Date.now(), canh = 0, conv = null, dangLam = "chuẩn bị";
  const nhich = (viec) => { lanCuoi = Date.now(); if (viec) { dangLam = viec; ghi(viec); } };
  const hienLai = () => { if (!document.hidden) lanCuoi = Date.now(); };
  document.addEventListener("visibilitychange", hienLai);
  // Không chờ conv.cancel() xong: bộ mã hoá đã kẹt thì cancel cũng có thể kẹt theo
  const biTreo = new Promise((_, loi) => {
    canh = setInterval(() => {
      if (document.hidden) { lanCuoi = Date.now(); return; }
      if (Date.now() - lanCuoi > choToiDa * 1000) {
        clearInterval(canh);
        conv?.cancel().catch(() => {});
        loi(Object.assign(new Error(`Chèn chữ/logo đứng im quá ${choToiDa} giây (lúc ${dangLam})`), { treo: true }));
      }
    }, 2000);
  });
  const lam = async () => {
    nhich("tải phông chữ");
    try { await henGio(document.fonts.load(`700 40px ${PHONG}`), 8, "tải phông chữ"); } catch {}
    nhich("tải thư viện dựng video");
    const mb = await taiThuVien(ghi);
    nhich("đọc hình video");
    const input = new mb.Input({ source: new mb.BlobSource(tep), formats: mb.ALL_FORMATS });
    const vt = await input.getPrimaryVideoTrack();
    if (!vt) throw new Error("Video không có hình.");
    const W = vt.displayWidth - (vt.displayWidth % 2), H = vt.displayHeight - (vt.displayHeight % 2);
    nhich(`tìm bộ mã hoá cho ${W}×${H}`);
    let codec;
    if (dungMaThang) codec = maThang();
    else {
      try {
        codec = await henGio(mb.getFirstEncodableVideoCodec(["avc", "hevc", "vp9", "av1"], { width: W, height: H }), 10, "hỏi bộ mã hoá");
      } catch {
        nhich("bộ mã hoá không trả lời câu hỏi → dùng thẳng bộ mã hoá H.264 của máy");
        batMaThang(mb);
        codec = maThang();
      }
    }
    if (!codec) throw Object.assign(new Error("Điện thoại không dựng lại được video cỡ này."), { khongHoTro: true });
    const khung = new OffscreenCanvas(W, H);
    const ctx = khung.getContext("2d");
    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target: new mb.BufferTarget() });
    nhich(`khởi động bộ mã hoá ${codec}`);
    conv = await mb.Conversion.init({
      input,
      output,
      showWarnings: false,
      audio: { discard: true },
      video: {
        codec,
        forceTranscode: true,
        allowTransformationMetadata: false,
        quality: mb.QUALITY_HIGH,
        processedWidth: W,
        processedHeight: H,
        process: (mau) => {
          if (globalThis.__phahaTreoVe > 0 && mau.timestamp > 1) { globalThis.__phahaTreoVe--; return new Promise(() => {}); } // chỉ dùng khi kiểm tra
          mau.drawWithFit(ctx, { fit: "fill" });
          ve(ctx, W, H, mau.timestamp);
          return khung;
        },
      },
    });
    if (!conv.isValid) {
      throw Object.assign(new Error("Điện thoại không đọc được hình của video này."), { khongHoTro: true });
    }
    conv.onProgress = (p) => { nhich(); baoTienDo(p); };
    nhich("dựng hình");
    try {
      await conv.execute();
    } catch (loi) {
      // Dùng thẳng bộ mã hoá mà vẫn hỏng → máy này không dựng lại được hình lúc này: xuất video không chữ/logo
      if (dungMaThang) throw Object.assign(new Error("Bộ mã hoá video của máy bị lỗi (" + loi.message + ")."), { khongHoTro: true });
      throw loi;
    }
    return { blob: new Blob([output.target.buffer], { type: "video/mp4" }), codec, W, H };
  };
  const chay = lam();
  chay.catch(() => {});
  try {
    return await Promise.race([chay, biTreo]);
  } finally {
    clearInterval(canh);
    document.removeEventListener("visibilitychange", hienLai);
  }
}
