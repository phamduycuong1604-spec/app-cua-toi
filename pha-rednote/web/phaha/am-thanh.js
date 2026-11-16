// =====================================================
// XỬ LÝ ÂM THANH & CHỮ ĐỌC (không gọi mạng, không đụng giao diện)
// =====================================================
import { TAN_SO_DOC } from "./nen.js";
import { boChuThichAmThanh } from "./loi-noi.js";

// Đóng gói mẫu âm thanh (Float32 -1..1 hoặc Int16) thành file WAV 16 bit, 1 kênh
export function taoWav(mau, tanSo) {
  const n = mau.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const chu = (o, s) => [...s].forEach((k, i) => v.setUint8(o + i, k.charCodeAt(0)));
  chu(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); chu(8, "WAVE");
  chu(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, tanSo, true); v.setUint32(28, tanSo * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  chu(36, "data"); v.setUint32(40, n * 2, true);
  const ra = new Int16Array(buf, 44, n);
  if (mau instanceof Int16Array) ra.set(mau);
  else for (let i = 0; i < n; i++) ra[i] = Math.max(-1, Math.min(1, mau[i])) * 32767;
  return new Uint8Array(buf);
}

// Lấy phần âm thanh (Int16) trong file WAV; không phải WAV thì coi cả file là âm thanh thô
export function docWav(byte) {
  const v = new DataView(byte.buffer, byte.byteOffset, byte.byteLength);
  let tanSo = TAN_SO_DOC;
  if (byte.length > 12 && String.fromCharCode(...byte.subarray(0, 4)) === "RIFF") {
    for (let o = 12; o + 8 <= byte.length; ) {
      const ten = String.fromCharCode(...byte.subarray(o, o + 4));
      const dai = v.getUint32(o + 4, true);
      if (ten === "fmt ") tanSo = v.getUint32(o + 12, true);
      if (ten === "data") {
        const doan = byte.slice(o + 8, Math.min(byte.length, o + 8 + dai));
        return { pcm: new Int16Array(doan.buffer, 0, doan.length >> 1), tanSo };
      }
      o += 8 + dai + (dai & 1);
    }
  }
  const ban = byte.slice(0, byte.length & ~1);
  return { pcm: new Int16Array(ban.buffer), tanSo };
}

// Giải nén MP3 thành âm thanh 24.000 mẫu/giây, 1 kênh bằng bộ giải mã có sẵn của trình duyệt
export async function giaiMp3(byte) {
  const ctx = new OfflineAudioContext(1, 1, TAN_SO_DOC);
  const b = await ctx.decodeAudioData(byte.buffer.slice(byte.byteOffset, byte.byteOffset + byte.byteLength));
  if (b.numberOfChannels === 1) return b.getChannelData(0);
  const ra = new Float32Array(b.length);
  for (let k = 0; k < b.numberOfChannels; k++) b.getChannelData(k).forEach((v, i) => (ra[i] += v / b.numberOfChannels));
  return ra;
}

export const tuBase64 = (chu) => Uint8Array.from(atob(chu), (k) => k.charCodeAt(0));
export function sangBase64(byte) {
  return new Promise((xong, hong) => {
    const fr = new FileReader();
    fr.onload = () => xong(String(fr.result).split(",")[1]);
    fr.onerror = hong;
    fr.readAsDataURL(new Blob([byte]));
  });
}

// Làm sạch 1 đoạn giọng đọc trước khi ghép vào video (TAN_SO_DOC = 24.000 mẫu/giây):
// - Bỏ lệch DC (đoạn sau nối đoạn trước bị "tách" một tiếng)
// - Cắt khoảng lặng VÀ tiếng rè "xoẹt" ở 2 đầu: Gemini hay kèm một chút tạp âm ngay trước / ngay sau lời đọc mỗi lượt.
//   Khung có tiếng nói = đủ to và không rè (tiếng rè đổi dấu liên tục). Phụ âm s, x… liền với tiếng nói thì giữ
//   (tối đa 0,15 giây); tạp âm cách lời đọc bởi khoảng lặng hoặc dài hơn thì cắt bỏ
// - Làm mềm 2 đầu (vào 10 ms, ra 30 ms) cho khỏi "bụp/tách"
// - Chỉnh âm lượng theo mức to thật của lời (bỏ qua vài mẫu vọt), khuếch đại tối đa 2 lần để không thổi to tạp âm
export function lamGon(mau) {
  const n = mau.length;
  if (!n) return new Float32Array(0);
  let tb = 0, e0 = 0;
  for (let i = 0; i < n; i++) { tb += mau[i]; e0 += mau[i] * mau[i]; }
  tb /= n;
  // cả đoạn gần như chỉ là lệch DC (không phải lời nói) → giữ nguyên, không trừ
  if (tb * tb > 0.9 * (e0 / n)) tb = 0;
  const KHUNG = Math.round(TAN_SO_DOC / 100); // 10 ms
  const soKhung = Math.ceil(n / KHUNG);
  const rms = new Float32Array(soKhung), doiDau = new Float32Array(soKhung);
  for (let k = 0; k < soKhung; k++) {
    const a = k * KHUNG, b = Math.min(n, a + KHUNG);
    let e = 0, z = 0;
    for (let i = a; i < b; i++) {
      const x = mau[i] - tb;
      e += x * x;
      if (i > a && (x >= 0) !== (mau[i - 1] - tb >= 0)) z++;
    }
    rms[k] = Math.sqrt(e / (b - a));
    doiDau[k] = z / (b - a);
  }
  const xep = Float32Array.from(rms).sort();
  const nguong = Math.max(0.008, xep[Math.floor(xep.length * 0.9)] * 0.08);
  let khongRe = true;
  const coTieng = (k) => rms[k] >= nguong && (!khongRe || doiDau[k] < 0.3);
  let dau = 0, cuoi = soKhung - 1;
  while (dau < soKhung && !coTieng(dau)) dau++;
  // không thấy khung nào "nói rõ" → chỉ xét độ to; vẫn không có → giữ cả đoạn (không bao giờ trả về rỗng)
  if (dau >= soKhung) { khongRe = false; dau = 0; while (dau < soKhung && !coTieng(dau)) dau++; }
  if (dau >= soKhung) { dau = 0; cuoi = soKhung - 1; }
  else while (cuoi > dau && !coTieng(cuoi)) cuoi--;
  // nới ra phụ âm liền kề (đủ to, không có khoảng lặng chen giữa), tối đa 15 khung
  for (let t = 0; t < 15 && dau > 0 && rms[dau - 1] >= nguong * 0.5; t++) dau--;
  for (let t = 0; t < 15 && cuoi < soKhung - 1 && rms[cuoi + 1] >= nguong * 0.5; t++) cuoi++;
  const tu = Math.max(0, dau * KHUNG - Math.round(TAN_SO_DOC * 0.02));
  const den = Math.min(n, (cuoi + 1) * KHUNG + Math.round(TAN_SO_DOC * 0.04));
  const ra = new Float32Array(den - tu);
  for (let i = 0; i < ra.length; i++) ra[i] = mau[tu + i] - tb;
  // mức to thật: mẫu thứ 99,9% (bỏ qua vài mẫu vọt lên do tạp âm)
  const tuyetDoi = Float32Array.from(ra, Math.abs).sort();
  const dinh = tuyetDoi[Math.floor((tuyetDoi.length - 1) * 0.999)] || 0;
  const tang = dinh > 0 ? Math.min(2, 0.85 / dinh) : 1;
  const vao = Math.min(Math.round(TAN_SO_DOC * 0.01), ra.length >> 1), ra2 = Math.min(Math.round(TAN_SO_DOC * 0.03), ra.length >> 1);
  for (let i = 0; i < ra.length; i++) {
    let he = tang;
    if (i < vao) he *= 0.5 - 0.5 * Math.cos((Math.PI * i) / vao);
    const conLai = ra.length - 1 - i;
    if (conLai < ra2) he *= 0.5 - 0.5 * Math.cos((Math.PI * conLai) / ra2);
    // không để vọt quá ±0,98 (vỡ tiếng)
    const x = ra[i] * he;
    ra[i] = x > 0.98 ? 0.98 : x < -0.98 ? -0.98 : x;
  }
  return ra;
}

export function doiTanSo(mau, tu, sang) {
  const ra = new Float32Array(Math.round((mau.length * sang) / tu));
  for (let i = 0; i < ra.length; i++) {
    const x = (i * tu) / sang, k = Math.floor(x), t = x - k;
    ra[i] = (mau[k] || 0) * (1 - t) + (mau[k + 1] || 0) * t;
  }
  return ra;
}

// Đọc nhanh hơn mà không bị "giọng chuột" (WSOLA): tiSo 1.3 = nhanh hơn 30%
export function coGian(x, tiSo) {
  const N = 1024, Hs = N / 2, dung = 256;
  const Ha = Hs * tiSo;
  const w = Float32Array.from({ length: N }, (_, n) => 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / N));
  const soKhung = Math.max(1, Math.floor((x.length - N - dung) / Ha));
  const ra = new Float32Array(soKhung * Hs + N);
  let truoc = 0;
  for (let k = 0; k < soKhung; k++) {
    const goc = Math.round(k * Ha);
    let lech = 0;
    if (k > 0) {
      // tìm chỗ cắt khớp nhịp nhất với đoạn vừa ghép
      const mau = truoc + Hs;
      let tot = -Infinity;
      for (let d = -dung; d <= dung; d += 8) {
        const p = goc + d;
        if (p < 0 || p + N > x.length) continue;
        let s = 0;
        for (let n = 0; n < N; n += 2) s += x[p + n] * (x[mau + n] || 0);
        if (s > tot) { tot = s; lech = d; }
      }
    }
    const p = Math.max(0, Math.min(x.length - N, goc + lech));
    for (let n = 0; n < N; n++) ra[k * Hs + n] += (x[p + n] || 0) * w[n];
    truoc = p;
  }
  return ra;
}

// ----- Sửa chữ trước khi đọc để máy đọc đúng (số, ký hiệu, chữ Trung sót lại) -----
const SO = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
function docBaSo(n, dayDu) {
  const tram = Math.floor(n / 100), chuc = Math.floor((n % 100) / 10), dv = n % 10, ra = [];
  if (tram || dayDu) ra.push(SO[tram], "trăm");
  if (chuc > 1) ra.push(SO[chuc], "mươi");
  else if (chuc === 1) ra.push("mười");
  else if (dv && (tram || dayDu)) ra.push("linh");
  if (dv) ra.push(dv === 1 && chuc > 1 ? "mốt" : dv === 5 && chuc ? "lăm" : dv === 4 && chuc > 1 ? "tư" : SO[dv]);
  return ra.join(" ");
}
function docSo(so) {
  let n = Number(so);
  if (!Number.isFinite(n) || n > 999999999999) return so.split("").map((k) => SO[k] ?? k).join(" ");
  if (n === 0) return "không";
  const hang = ["", "nghìn", "triệu", "tỷ"], nhom = [];
  for (; n > 0; n = Math.floor(n / 1000)) nhom.push(n % 1000);
  return nhom.map((g, i) => (g ? `${docBaSo(g, i < nhom.length - 1)} ${hang[i]}` : "")).reverse().filter(Boolean).join(" ").trim();
}
const DON_VI = { kg: "ki lô gam", g: "gam", ml: "mi li lít", l: "lít", cm: "xen ti mét", mm: "mi li mét", m: "mét", km: "ki lô mét" };
export function chuanHoaDoc(chu) {
  return boChuThichAmThanh(chu)
    .replace(/[㐀-鿿]+/g, " ") // chữ Trung còn sót
    .replace(/(\d)[.,](\d{3})(?!\d)/g, "$1$2") // 1.500 / 1,500 → 1500
    .replace(/(\d+)[.,](\d+)/g, (_, a, b) => `${docSo(a)} phẩy ${docSo(b)}`)
    .replace(/(\d+)\s*%/g, (_, a) => `${docSo(a)} phần trăm`)
    .replace(/(\d+)\s*[kK]\b/g, (_, a) => `${docSo(a)} nghìn`)
    .replace(/(\d+)\s*(kg|g|ml|l|cm|mm|m|km)\b/gi, (_, a, d) => `${docSo(a)} ${DON_VI[d.toLowerCase()]}`)
    .replace(/\d+/g, (a) => docSo(a))
    .replace(/&/g, " và ").replace(/\+/g, " cộng ").replace(/[#~*_|<>\[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
