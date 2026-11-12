// =====================================================
// GIỌNG ĐỌC GEMINI (TTS) – tối ưu cho mã miễn phí (Free Tier)
// - Mã miễn phí: mỗi lúc chỉ gửi 1 yêu cầu (gửi dồn là bị 429 ngay); mã trả phí mới gửi 3 cùng lúc
// - Ghi nhớ trên máy theo từng cặp (mã + loại Gemini): đã dùng bao nhiêu lượt hôm nay, hết ngày chưa, đang khoá tạm đến lúc nào
// - Google bảo chờ ≤ 15 giây → chờ rồi gửi lại CÙNG mã; lâu hơn → khoá tạm cặp đó, đổi sang mã khác
// - Báo hết lượt ngày (…PerDay…) → cặp đó nghỉ tới hôm sau (giờ Mỹ), không thử lại nữa
// - Loại đọc được đoạn đầu tiên được ưu tiên cho cả video; hết lượt ở MỌI mã mới đổi loại, chỉ cho các đoạn còn thiếu
// - Hết sạch mọi loại ở mọi mã → báo HET_NGAY ngay để app chuyển sang giọng kế tiếp (không chờ)
// =====================================================
import { API_GEMINI, caiDat, nhat, cho, docLuu, ghiLuu, demDung, ngayMy, vanTayMa, maHopLe, LOI_MA_LA } from "./nen.js";
import { dsKhoaDoc, maNghe, gioLamMoiGemini } from "./gemini.js";
import { tuBase64 } from "./am-thanh.js";

// Thứ tự ưu tiên (loại không có / đã ngừng → Google báo 404, app tự bỏ qua 30 ngày)
export const MO_HINH_DOC = ["gemini-3.8-flash-tts", "gemini-3.1-flash-tts-preview", "gemini-2.5-flash-preview-tts"];
const LUOT_UOC = 10; // lượt/ngày ước tính của 1 cặp mã + loại (Free Tier); hết lượt thật thì nhớ con số đúng
const CHO_TOI_DA = 15; // giây
const LUU = "phaha-dv-tts";

// ----- Trạng thái lưu trên máy -----
// { ngay, cap: { "vt:loại": { dung, het, khoaDen } }, hoc: { "vt:loại": số lượt thật }, ngung: { "vt:loại": hạn }, traPhi: { vt: true } }
let tt = null;
function st() {
  if (tt && tt.ngay === ngayMy()) return tt;
  const d = docLuu(LUU);
  if (d.ngay !== ngayMy()) { d.ngay = ngayMy(); d.cap = {}; }
  d.cap ||= {}; d.hoc ||= {}; d.ngung ||= {}; d.traPhi ||= {};
  for (const k of Object.keys(d.ngung)) if (d.ngung[k] < Date.now()) delete d.ngung[k];
  return (tt = d);
}
const luu = () => ghiLuu(LUU, st());
const ten = (k, mh) => k.vt + ":" + mh;
const cap = (k, mh) => (st().cap[ten(k, mh)] ||= { dung: 0 });

// ----- Trạng thái của 1 lần lồng tiếng -----
let mhUuTien = null; // loại đọc được đoạn đầu tiên → ưu tiên cho cả video
let conCan = 0; // số đoạn còn phải đọc trong lần này
let soMa = 0; // mã đang dùng (giữ nguyên tới khi mã đó không dùng được)
const maBo = new Set(); // mã sai / không có quyền / có ký tự lạ (bỏ trong lần này)
let loiMa = null;

export function batDauDocGemini(soDoan = 0) {
  mhUuTien = null;
  conCan = soDoan;
  soMa = 0;
  maBo.clear();
  loiMa = null;
  tt = null;
}
// Đoạn lấy lại từ bộ nhớ (đọc ở lần trước) → ưu tiên luôn loại đã đọc đoạn đó cho giọng đồng nhất
export function uuTienMoHinh(mh) {
  conCan = Math.max(0, conCan - 1);
  if (!mhUuTien && mh) mhUuTien = mh;
}
// Đổi mã / bấm Lưu (có thể vừa nâng lên trả phí) → quên hết lượt / khoá tạm, thử lại thật
export function quenLuotDoc() {
  const d = st();
  d.cap = {};
  d.hoc = {};
  luu();
}

// Danh sách mã đọc: ô "Mã Gemini riêng cho giọng đọc" (tối đa 10), không có thì dùng mã nghe & dịch
function dsMa() {
  const ds = dsKhoaDoc().length ? dsKhoaDoc() : [maNghe()].filter(Boolean);
  return ds.map((khoa, i) => ({ khoa, vt: vanTayMa(khoa), so: i + 1, tong: ds.length }));
}
const tenMa = (k) => (k.tong > 1 ? `mã ${k.so}/${k.tong}` : "mã đọc");
const cacLoai = () => (caiDat.mhDoc ? [caiDat.mhDoc] : MO_HINH_DOC);
const laTraPhi = (k) => !!st().traPhi[k.vt];
const biNgung = (k, mh) => (st().ngung[ten(k, mh)] || 0) > Date.now();
// Cặp còn dùng được hôm nay (chưa hết ngày, loại có thật, mã không hỏng)
const dungDuoc = (k, mh) => !maBo.has(k.vt) && !biNgung(k, mh) && !cap(k, mh).het;
// Ước tính lượt còn lại của 1 cặp (ít nhất 1 nếu chưa biết hạn mức thật – vẫn đáng thử)
function conLuot(k, mh) {
  if (!dungDuoc(k, mh)) return 0;
  if (laTraPhi(k)) return 1000;
  const hoc = st().hoc[ten(k, mh)];
  return Math.max(hoc ? 0 : 1, (hoc || LUOT_UOC) - cap(k, mh).dung);
}

// Chọn loại Gemini: loại đang ưu tiên nếu còn dùng được ở ít nhất 1 mã; không thì loại đầu tiên (theo thứ tự)
// còn đủ lượt cho mọi đoạn còn lại (cả video 1 giọng); không loại nào đủ thì loại còn nhiều lượt nhất
function chonLoai(cacMa) {
  if (mhUuTien && cacLoai().includes(mhUuTien) && cacMa.some((k) => dungDuoc(k, mhUuTien))) return mhUuTien;
  const luot = cacLoai().map((mh) => [mh, cacMa.reduce((s, k) => s + conLuot(k, mh), 0)]).filter(([, n]) => n > 0);
  const du = luot.find(([, n]) => n >= Math.max(1, conCan));
  const tot = (du || luot.reduce((a, b) => (b[1] > a[1] ? b : a), luot[0]) || [null])[0];
  if (tot && mhUuTien && tot !== mhUuTien) nhat(`↪️ ${mhUuTien} đã hết lượt ở mọi mã → các đoạn CÒN THIẾU đọc bằng ${tot} (đoạn đã đọc giữ nguyên)`);
  if (tot && mhUuTien !== tot) mhUuTien = null;
  return tot;
}
// Chọn mã cho loại đó: giữ mã đang dùng nếu còn được; mã nào cũng đang khoá tạm → trả về thời điểm mở khoá sớm nhất
function chonMa(cacMa, mh) {
  const dung = cacMa.filter((k) => dungDuoc(k, mh));
  const sapXep = [...dung.filter((k) => k.so - 1 >= soMa), ...dung.filter((k) => k.so - 1 < soMa)];
  const san = sapXep.find((k) => (cap(k, mh).khoaDen || 0) <= Date.now());
  if (san) return { k: san };
  return { moKhoa: Math.min(...dung.map((k) => cap(k, mh).khoaDen || 0)) };
}

// Mã miễn phí: 1 yêu cầu mỗi lúc. Mã đã đọc quá hạn mức miễn phí trong 1 ngày → là mã trả phí → 3 cùng lúc
export const soLuongDocGemini = () => (dsMa().some(laTraPhi) ? 3 : 1);

// Tổng lượt còn lại hôm nay (mọi mã, mọi loại). null = chưa biết chắc (có cặp chưa từng hết lượt) → cứ thử
export function luotDocConLai() {
  const cacMa = dsMa().filter((k) => maHopLe(k.khoa));
  let tong = 0, chuaBiet = false;
  for (const k of cacMa) for (const mh of cacLoai()) {
    if (!dungDuoc(k, mh)) continue;
    if (laTraPhi(k) || !st().hoc[ten(k, mh)]) chuaBiet = true;
    else tong += conLuot(k, mh);
  }
  return chuaBiet ? null : tong;
}

// Mô tả lượt đọc của 1 mã (cho nút 🔎 Kiểm tra các mã)
export function moTaLuotDoc(khoa) {
  const k = { khoa, vt: vanTayMa(khoa) };
  if (laTraPhi(k)) return "đọc: mã trả phí (không giới hạn 10 lượt/ngày)";
  const phan = cacLoai().filter((mh) => !biNgung(k, mh)).map((mh) => {
    const c = cap(k, mh), hoc = st().hoc[ten(k, mh)];
    const ngan = mh.replace(/^gemini-|-preview|-tts/g, "");
    return c.het ? `${ngan} hết` : `${ngan} ${c.dung}/${hoc || LUOT_UOC}${hoc ? "" : "~"}`;
  });
  const hetSach = phan.length && phan.every((p) => p.endsWith(" hết"));
  return `${hetSach ? "HẾT lượt đọc hôm nay · " : ""}đọc hôm nay: ${phan.join(" · ") || "chưa rõ"} (làm mới lúc ${gioLamMoiGemini()})`;
}

function ghiDung(k, mh) {
  const c = cap(k, mh);
  c.dung++;
  conCan = Math.max(0, conCan - 1);
  // Free Tier chỉ ~10 lượt/ngày mỗi loại: đọc được hơn 15 lượt mà chưa hết → mã trả phí
  if (c.dung > 15 && !st().hoc[ten(k, mh)]) st().traPhi[k.vt] = true;
  luu();
  demDung(`gm:${k.vt}:doc`, 1, ngayMy());
  if (!mhUuTien) {
    mhUuTien = mh;
    nhat(`🎙️ Ưu tiên ${mh} cho cả video (giọng đồng nhất; mã hết lượt thì đổi mã, chưa đổi loại)`);
  }
}
function ghiHetNgay(k, mh) {
  const c = cap(k, mh);
  c.het = true;
  if (c.dung > 0) st().hoc[ten(k, mh)] = c.dung;
  delete st().traPhi[k.vt];
  luu();
  nhat(`🔒 ${mh} trên ${tenMa(k)} đã hết lượt hôm nay → không thử lại đến ${gioLamMoiGemini()}`);
}
function khoaTam(k, mh, giay) {
  cap(k, mh).khoaDen = Date.now() + giay * 1000;
  luu();
  nhat(`🔑 Khoá tạm ${mh} trên ${tenMa(k)} ${Math.round(giay)} giây → đổi sang mã khác`);
}
function ghiNgung(k, mh) {
  st().ngung[ten(k, mh)] = Date.now() + 30 * 86400000;
  luu();
  nhat(`↪️ ${mh} không dùng được với ${tenMa(k)} (Google báo không có loại này) → bỏ qua`);
}

// Gửi 1 đoạn cho 1 cặp mã + loại. Trả về phần âm thanh, hoặc null = cặp này không dùng được lúc này (đã ghi nhớ) → chọn lại
async function goiMot(k, mh, chu) {
  let mang = 0, quaLau = 0, loiMay = 0, thieuTieng = 0, daCho = 0;
  for (;;) {
    const huy = new AbortController();
    const hen = setTimeout(() => huy.abort(), 60000);
    const bd = Date.now();
    const giay = () => ((Date.now() - bd) / 1000).toFixed(1);
    let r;
    try {
      r = await fetch(`${API_GEMINI}/models/${mh}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": k.khoa },
        // Chỉ gửi đúng câu cần đọc (không kèm lời dặn: Gemini đời mới đọc to luôn lời dặn vào video)
        body: JSON.stringify({
          contents: [{ parts: [{ text: chu }] }],
          generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: caiDat.giong } } } },
        }),
        signal: huy.signal,
      });
    } catch (loi) {
      if (huy.signal.aborted) {
        nhat(`⏱️ Gemini đọc ${mh} quá lâu (${giay()} giây)`);
        if (++quaLau <= 1) continue;
        khoaTam(k, mh, 60);
        return null;
      }
      nhat(`⚠️ Gemini đọc ${mh} (${tenMa(k)}): lỗi mạng sau ${giay()} giây (${loi?.message || loi})`);
      if (++mang <= 3) { await cho(3); continue; }
      throw new Error("Mất kết nối mạng khi gọi Gemini.");
    } finally {
      clearTimeout(hen);
    }
    if (r.ok) {
      const j = await r.json().catch(() => ({}));
      const phan = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
      if (!phan) {
        // Gemini thỉnh thoảng trả lời mà không kèm tiếng (lỗi ngẫu nhiên) → gửi lại
        if (++thieuTieng <= 2) { nhat(`Gemini đọc thiếu tiếng (${j.candidates?.[0]?.finishReason || "?"}) → gửi lại đoạn này`); continue; }
        throw new Error("Gemini không trả về giọng đọc. Thử lại sau ít phút.");
      }
      ghiDung(k, mh);
      const u = j.usageMetadata;
      nhat(`Gemini đọc (${mh}, ${tenMa(k)}): xong sau ${giay()} giây${u ? ` · ${u.promptTokenCount || 0}→${u.candidatesTokenCount || 0} token` : ""}`);
      return phan;
    }
    const j = await r.json().catch(() => ({}));
    const tb = String(j.error?.message || r.statusText || r.status);
    nhat(`⚠️ Gemini đọc ${mh} (${tenMa(k)}): mã ${r.status} sau ${giay()} giây · ${tb.slice(0, 120)}`);
    if (r.status === 429) {
      const chiTiet = JSON.stringify(j.error?.details || "");
      const quota = /quotaId\":\"([^\"]+)/.exec(chiTiet)?.[1] || "";
      const tre = Number(/(\d+(?:\.\d+)?)s/.exec(j.error?.details?.find((d) => d.retryDelay)?.retryDelay || "")?.[1]) || Number(r.headers.get("retry-after")) || 0;
      if (quota) nhat(`Giới hạn bị chạm: ${quota}${tre ? `, Google bảo chờ ${tre} giây` : ""}`);
      if (/PerDay/i.test(quota) || /per ?day/i.test(tb)) { ghiHetNgay(k, mh); return null; }
      if (tre && tre <= CHO_TOI_DA && ++daCho <= 3) {
        nhat(`⏳ Chờ ${tre} giây rồi gửi lại cùng ${tenMa(k)}`);
        await cho(tre + 1, "long");
        continue;
      }
      khoaTam(k, mh, tre || 60);
      return null;
    }
    if (/location is not supported/i.test(tb))
      throw Object.assign(new Error("Google đang chặn Gemini theo vị trí mạng của bạn (thường do VPN/proxy hoặc mạng nước ngoài). Tắt VPN hoặc đổi mạng (wifi ↔ 4G) rồi thử lại. Mã Gemini vẫn đúng."), { status: 400, viTri: true });
    if (r.status === 404 || (r.status === 400 && /not found|not supported|is not/i.test(tb))) { ghiNgung(k, mh); return null; }
    if (r.status === 401 || r.status === 403 || /API key not valid|API_KEY_INVALID/i.test(tb)) {
      maBo.add(k.vt);
      loiMa = Object.assign(new Error(tb), { status: r.status });
      nhat(`🔑 Bỏ qua ${tenMa(k)}: mã sai hoặc không có quyền dùng giọng đọc`);
      return null;
    }
    if (r.status >= 500) {
      if (++loiMay <= 2) { await cho(r.status === 503 ? 3 : 5); continue; }
      khoaTam(k, mh, 30);
      return null;
    }
    throw Object.assign(new Error(tb), { status: r.status });
  }
}

// Đọc 1 đoạn → { pcm, tanSo, moHinh }
export async function docGeminiTTS(chu) {
  const cacMa = dsMa();
  for (const k of cacMa) if (!maHopLe(k.khoa) && !maBo.has(k.vt)) {
    maBo.add(k.vt);
    loiMa = new Error(LOI_MA_LA);
    nhat(`🔑 Bỏ qua ${tenMa(k)}: mã có ký tự lạ – xoá mã này trong ⚙️ rồi chép – dán lại`);
  }
  for (let vong = 0; vong < 100; vong++) {
    if (cacMa.every((k) => maBo.has(k.vt))) throw loiMa || new Error("Chưa có mã Gemini cho giọng đọc.");
    const mh = chonLoai(cacMa);
    if (!mh) throw Object.assign(new Error("HET_NGAY"), { hetGemini: true });
    const { k, moKhoa } = chonMa(cacMa, mh);
    if (!k) {
      const giay = Math.max(1, Math.ceil((moKhoa - Date.now()) / 1000));
      nhat(`⏳ ${mh}: mọi mã đang bị khoá tạm → chờ ${giay} giây`);
      await cho(Math.min(giay, 120), "long");
      continue;
    }
    if (k.so - 1 !== soMa) {
      if (vong) nhat(`🔑 Chuyển sang ${tenMa(k)}`);
      soMa = k.so - 1;
    }
    const phan = await goiMot(k, mh, chu);
    if (!phan) continue;
    const byte = tuBase64(phan.inlineData.data);
    return {
      pcm: new Int16Array(byte.buffer, 0, byte.length >> 1),
      tanSo: Number(/rate=(\d+)/.exec(phan.inlineData.mimeType || "")?.[1]) || 24000,
      moHinh: mh,
    };
  }
  throw new Error("Gemini đọc thử quá nhiều lần không được. Bấm 🔁 Làm lại sau ít phút.");
}
