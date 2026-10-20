// =====================================================
// XỬ LÝ ÂM THANH & CHỮ ĐỌC (không gọi mạng, không đụng giao diện)
// =====================================================
import { TAN_SO_DOC } from "./nen.js";

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

// Cắt khoảng lặng đầu/cuối, làm mềm 2 đầu, chỉnh âm lượng vừa phải
export function lamGon(mau) {
  const nguong = 0.01;
  let a = 0, b = mau.length - 1;
  while (a < b && Math.abs(mau[a]) < nguong) a++;
  while (b > a && Math.abs(mau[b]) < nguong) b--;
  const ra = mau.slice(Math.max(0, a - 120), Math.min(mau.length, b + 240));
  let dinh = 0;
  for (const x of ra) dinh = Math.max(dinh, Math.abs(x));
  const tang = dinh > 0 ? Math.min(3, 0.89 / dinh) : 1;
  const mem = Math.min(120, ra.length >> 1);
  for (let i = 0; i < ra.length; i++) {
    let he = tang;
    if (i < mem) he *= i / mem;
    if (i > ra.length - mem) he *= (ra.length - i) / mem;
    ra[i] *= he;
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
  return String(chu)
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
