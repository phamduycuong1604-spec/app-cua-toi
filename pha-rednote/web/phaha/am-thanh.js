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
// - Lọc tiếng nhiễu (rè "xoẹt", nhiễu kiểu radio) ở 2 đầu VÀ ở các khoảng nghỉ giữa câu:
//   tiếng nói có NHỊP RUNG ĐỀU (cao độ giọng 70–400 Hz) và không đổi dấu liên tục; nhiễu thì không đủ cả hai –
//   dù nhiễu chói ("xì") hay trầm (kiểu radio).
//   Giữ: khung có nhịp rung + phụ âm đầu (s, x, ph, th…) liền trước nó (tối đa 0,15 giây) + đuôi vang
//   nhỏ dần còn nhịp (tối đa 0,1 giây) + chỗ ngắt rất ngắn trong từ (≤ 80 ms). Phần còn lại tắt tiếng (mở/tắt 10 ms)
// - Làm mềm 2 đầu (vào 10 ms, ra 50 ms) cho khỏi "bụp/tách"
// - Chỉnh âm lượng theo độ to TRUNG BÌNH của lời nói (mọi đoạn to đều nhau, không chỗ to chỗ nhỏ khi chuyển đoạn),
//   khuếch đại tối đa 2 lần để không thổi to tạp âm, không để đỉnh vượt 0,95
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
    doiDau[k] = z / (b - a); // rè chói (kiểu "xì") đổi dấu liên tục
  }
  const xep = Float32Array.from(rms).sort();
  const nguong = Math.max(0.008, xep[Math.floor(xep.length * 0.9)] * 0.08);

  // Độ "có nhịp rung" từng khung: tự tương quan trên bản hạ còn ~8.000 mẫu/giây, cửa sổ 30 ms
  const H = Math.max(1, Math.round(TAN_SO_DOC / 8000)), f8 = TAN_SO_DOC / H;
  const n8 = Math.floor(n / H), x8 = new Float32Array(n8);
  for (let i = 0; i < n8; i++) { let s = 0; for (let j = 0; j < H; j++) s += mau[i * H + j]; x8[i] = s / H - tb; }
  const tre1 = Math.floor(f8 / 400), tre2 = Math.ceil(f8 / 70), cs = Math.round(f8 * 0.03);
  const nhip = new Float32Array(soKhung), tuTuong = new Float32Array(tre2 + 2);
  for (let k = 0; k < soKhung; k++) {
    if (rms[k] < nguong * 0.3) continue;
    const a = Math.min(Math.max(0, Math.round(((k + 0.5) * KHUNG) / H) - (cs >> 1)), n8 - cs - tre2 - 1);
    if (a < 0) continue;
    let ea = 0;
    for (let i = 0; i < cs; i++) ea += x8[a + i] * x8[a + i];
    if (ea <= 0) continue;
    // tự tương quan r(L), L = 1…tre2. Giọng thật: có ĐỈNH rõ ở chu kỳ cao độ, trước đó có chỗ trũng.
    // Nhiễu trầm: r giảm dần đều từ L nhỏ, không có đỉnh → không tính là giọng
    for (let L = 1; L <= tre2 + 1; L++) {
      let tich = 0, eb = 0;
      for (let i = 0; i < cs; i++) { const y = x8[a + i + L]; tich += x8[a + i] * y; eb += y * y; }
      tuTuong[L] = eb > 0 ? tich / Math.sqrt(ea * eb) : 0;
    }
    let tot = 0, trung = 1;
    for (let L = 1; L <= tre2; L++) {
      trung = Math.min(trung, tuTuong[L]);
      if (L >= tre1 && tuTuong[L] >= tuTuong[L - 1] && tuTuong[L] >= tuTuong[L + 1] && tuTuong[L] - trung >= 0.3) tot = Math.max(tot, tuTuong[L]);
    }
    nhip[k] = tot;
  }

  // Khung giữ lại
  let noi = (k) => rms[k] >= nguong && nhip[k] >= 0.5 && doiDau[k] < 0.3;
  let soNoiRo = 0;
  for (let k = 0; k < soKhung; k++) if (noi(k)) soNoiRo++;
  // không thấy khung nào có nhịp rung (âm thanh lạ, quá ngắn) → chỉ xét độ to; vẫn không có → giữ cả đoạn
  const coNhip = soNoiRo > 0;
  if (!coNhip) noi = (k) => rms[k] >= nguong;
  const giu = new Uint8Array(soKhung);
  for (let k = 0; k < soKhung; k++) if (noi(k)) giu[k] = 1;
  if (!giu.some((g) => g)) giu.fill(1);
  else if (coNhip) {
    for (let k = 0; k < soKhung; k++) {
      if (!noi(k)) continue;
      // phụ âm đầu liền trước (đủ to, không có khoảng lặng chen giữa)
      // (3 khung sát nhất giữ luôn; xa hơn chỉ giữ tiếng "xì" của phụ âm s, x, ph, th…, không giữ nhiễu trầm)
      if (k > 0 && !noi(k - 1)) for (let t = 1; t <= 15 && k - t >= 0 && rms[k - t] >= nguong * 0.5 && (t <= 3 || doiDau[k - t] >= 0.3); t++) giu[k - t] = 1;
      // đuôi vang nhỏ dần còn nhịp rung
      if (k < soKhung - 1 && !noi(k + 1)) for (let t = 1; t <= 10 && k + t < soKhung && rms[k + t] >= nguong * 0.3 && nhip[k + t] >= 0.3 && doiDau[k + t] < 0.25; t++) giu[k + t] = 1;
    }
    // chỗ ngắt rất ngắn trong từ (t, c, p, ch…) giữa 2 phần giữ lại
    for (let k = 0, cuoiGiu = -1; k < soKhung; k++) {
      if (!giu[k]) continue;
      if (cuoiGiu >= 0 && k - cuoiGiu - 1 <= 8) for (let j = cuoiGiu + 1; j < k; j++) giu[j] = 1;
      cuoiGiu = k;
    }
  }
  let dau = 0, cuoi = soKhung - 1;
  while (!giu[dau]) dau++;
  while (!giu[cuoi]) cuoi--;
  const tu = dau * KHUNG, den = Math.min(n, (cuoi + 1) * KHUNG);
  const ra = new Float32Array(den - tu);
  // tắt tiếng phần không giữ (nhiễu ở khoảng nghỉ), chuyển mở/tắt từ từ trong 10 ms
  let g = giu[dau] ? 1 : 0;
  const buoc = 1 / KHUNG;
  for (let i = 0; i < ra.length; i++) {
    const dich = giu[Math.floor((tu + i) / KHUNG)] ? 1 : 0;
    g = dich > g ? Math.min(dich, g + buoc) : Math.max(dich, g - buoc);
    ra[i] = (mau[tu + i] - tb) * g;
  }
  // độ to trung bình của các khung có tiếng nói (không tính khoảng nghỉ)
  let eNoi = 0, soNoi = 0;
  for (let k = dau; k <= cuoi; k++) if (noi(k)) { eNoi += rms[k] * rms[k]; soNoi++; }
  const toNoi = soNoi ? Math.sqrt(eNoi / soNoi) : 0;
  // đỉnh thật: mẫu thứ 99,9% (bỏ qua vài mẫu vọt lên do tạp âm)
  const tuyetDoi = Float32Array.from(ra, Math.abs).sort();
  const dinh = tuyetDoi[Math.floor((tuyetDoi.length - 1) * 0.999)] || 0;
  const tang = toNoi > 0 && dinh > 0 ? Math.min(2, 0.16 / toNoi, 0.95 / dinh) : 1;
  const vao = Math.min(Math.round(TAN_SO_DOC * 0.01), ra.length >> 1), ra2 = Math.min(Math.round(TAN_SO_DOC * 0.05), ra.length >> 1);
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
