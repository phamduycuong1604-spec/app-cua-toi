import {runSignal} from './nen.js';
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

// Rendering uses the existing bounded OPFS implementation; the preview painter above keeps both masks.
let loadRenderer=()=>import('/dub/lop-phu.js');
export async function xuatHinh(tep,ve,baoTienDo,choToiDa=60,ghi=()=>{}){
 const {xuatHinh:render}=await loadRenderer();
 const safari=/AppleWebKit/.test(navigator.userAgent)&&!/Chrome|Chromium|Edg|OPR|Android/.test(navigator.userAgent);
 return render(tep,ve,baoTienDo,runSignal(),ghi,undefined,{compatible:safari});
}
