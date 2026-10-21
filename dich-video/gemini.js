// =====================================================
// GỌI GEMINI: tự chờ khi bị giới hạn mỗi phút, tự đổi loại Gemini khi hết lượt,
// xoay vòng nhiều mã giọng đọc, ghi nhớ loại nào hết lượt hôm nay (theo từng mã)
// loai = "nghe" (nghe & dịch) hoặc "doc" (đọc giọng)
// =====================================================
import { API_GEMINI, caiDat, nhat, cho, docLuu, ghiLuu, demDung, daDung, ngayMy, vanTayMa, lamSachMa, maHopLe, LOI_MA_LA } from "./nen.js";

// Mỗi loại Gemini có lượt miễn phí riêng → loại này quá tải/hết lượt thì chuyển loại khác
const MO_HINH = {
  nghe: ["gemini-flash-latest", "gemini-2.5-flash", "gemini-flash-lite-latest", "gemini-2.5-flash-lite", "gemini-2.0-flash"],
  doc: ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"],
};
const moHinhDung = {}; // loại đã chạy được gần nhất → lần sau thử trước

// Giọng đọc đồng nhất: cùng tên giọng (vd Kore) nhưng mỗi loại Gemini đọc nghe vẫn khác → cả video chỉ dùng 1 loại.
// Loại đầu tiên đọc được sẽ được chốt; mã nào hết lượt loại đó thì đổi MÃ, không đổi sang loại khác.
let moHinhDocCoDinh = null;
export const moHinhDocDaChot = () => moHinhDocCoDinh;
export const chotMoHinhDoc = (mh) => (moHinhDocCoDinh = mh);
// Loại Gemini đã chốt mà hết lượt ở MỌI mã → bỏ hẳn loại đó trong lần chạy này, đọc lại cả video bằng loại khác
const moHinhDocBo = new Set();
export const boMoHinhDoc = (mh) => moHinhDocBo.add(mh);
export const moHinhDocBiBo = (mh) => moHinhDocBo.has(mh);

// ----- Ghi nhớ "loại Gemini nào hết lượt/ngừng" theo từng mã, lưu trên máy để lần sau khỏi thử lại -----
const moHinhNghi = new Set();
let daBaoNghi = new Set(); // đã ghi nhật ký "bỏ qua vì ghi nhớ" (mỗi lần chạy 1 lần)
function napMoHinhNghi() {
  moHinhNghi.clear();
  // Bản cũ ghi nhầm lỗi "Google chặn theo vị trí mạng" thành "mô hình đã ngừng" (bỏ qua 30 ngày) → xoá 1 lần các ghi nhớ dài hạn
  try {
    if (!localStorage.getItem("phaha-sua-gemini-vi-tri")) {
      const cu = docLuu("phaha-dv-gemini-nghi");
      for (const k of Object.keys(cu)) if (cu[k] > Date.now() + 2 * 86400000) delete cu[k];
      ghiLuu("phaha-dv-gemini-nghi", cu);
      localStorage.setItem("phaha-sua-gemini-vi-tri", "1");
    }
  } catch {}
  for (const [m, han] of Object.entries(docLuu("phaha-dv-gemini-nghi"))) if (han > Date.now()) moHinhNghi.add(m);
}
function luuMoHinhNghi(m, giay) {
  const d = docLuu("phaha-dv-gemini-nghi");
  for (const k of Object.keys(d)) if (d[k] < Date.now()) delete d[k];
  d[m] = Date.now() + giay * 1000;
  ghiLuu("phaha-dv-gemini-nghi", d);
}
// Bắt đầu 1 lần chạy mới: nạp lại ghi nhớ, nhật ký "bỏ qua" ghi lại từ đầu
export function batDauLanMoiGemini() {
  daBaoNghi = new Set();
  moHinhDocBo.clear();
  napMoHinhNghi();
}
// Đổi mã / bấm Lưu (có thể vừa nâng mã lên trả phí) → quên mọi ghi nhớ hết lượt để thử lại thật
export function quenGhiNhoGemini(caHanMuc = false) {
  moHinhNghi.clear();
  try { localStorage.removeItem("phaha-dv-gemini-nghi"); } catch {}
  if (!caHanMuc) return;
  const d = docLuu("phaha-dv-dung");
  for (const k of Object.keys(d)) if (/^(max|het):gm:/.test(k)) delete d[k];
  ghiLuu("phaha-dv-dung", d);
}

// ----- Mã dùng cho từng việc -----
// Ô "Gemini riêng cho giọng đọc" nhận tối đa 10 mã (cách nhau bằng dấu phẩy, khoảng trắng hoặc xuống dòng):
// mã đang dùng hết lượt thì tự chuyển sang mã kế tiếp
export const dsKhoaDoc = () => [...new Set(lamSachMa(caiDat.khoaDoc).split(/[\s,;]+/).filter(Boolean))].slice(0, 10);
let soMaDoc = 0; // vị trí mã đọc đang dùng trong danh sách
const khoaGemini = (loai) => (loai === "doc" && (dsKhoaDoc()[soMaDoc] || dsKhoaDoc()[0])) || lamSachMa(caiDat.khoa);
const tenNghi = (m, loai) => vanTayMa(khoaGemini(loai) || "") + ":" + m;

// Gọi Gemini; giọng đọc có nhiều mã thì xoay vòng khi mã đang dùng hết lượt / bị giới hạn mỗi phút
export async function goiGemini(loai, noiDung) {
  const ds = loai === "doc" ? dsKhoaDoc() : [];
  if (ds.length < 2) return goiMotMa(loai, noiDung);
  if (soMaDoc >= ds.length) soMaDoc = 0;
  for (let daThu = 0; ; daThu++) {
    const dang = soMaDoc;
    try {
      // Chưa thử hết các mã: gặp giới hạn mỗi phút thì đổi ngay sang mã kế tiếp thay vì ngồi chờ
      return await goiMotMa(loai, noiDung, { doiMaKhiCho: daThu < ds.length - 1 });
    } catch (loi) {
      if ((loi?.message !== "HET_NGAY" && !loi?.doiMa) || daThu >= ds.length - 1 || ds.every((k, i) => i === soMaDoc || !maHopLe(k))) throw loi;
      if (soMaDoc !== dang) continue; // luồng đọc khác vừa đổi mã rồi → dùng luôn mã mới
      const cu = soMaDoc;
      // bỏ qua luôn các mã có ký tự lạ (gửi đi chắc chắn hỏng)
      do {
        soMaDoc = (soMaDoc + 1) % ds.length;
        if (!maHopLe(ds[soMaDoc]) && soMaDoc !== cu) nhat(`🔑 Bỏ qua mã Gemini đọc số ${soMaDoc + 1}/${ds.length}: mã có ký tự lạ – xoá mã này trong ⚙️ rồi chép – dán lại`);
      } while (!maHopLe(ds[soMaDoc]) && soMaDoc !== cu);
      daBaoNghi = new Set();
      const ma = `🔑 Mã Gemini đọc số ${cu + 1}/${ds.length}`, sang = `sang mã số ${soMaDoc + 1}`;
      if (loi.message === "CHO_PHUT") nhat(`${ma} đang bị giới hạn mỗi phút (Google bảo chờ ${loi.choGiay} giây) → chuyển ngay ${sang}`);
      else if (loi.doiMa) nhat(`${ma}: ${loi.message} → chuyển ${sang}`);
      else nhat(`${ma} hết lượt hôm nay → chuyển ${sang}`);
    }
  }
}

// Gọi bằng mã đang dùng: thử lần lượt các loại Gemini
async function goiMotMa(loai, noiDung, tuyChon = {}) {
  const tuChon = loai === "nghe" ? caiDat.mhNghe : caiDat.mhDoc;
  if (tuChon) return goiMoHinh(tuChon, noiDung, loai, tuyChon);
  const coDinh = loai === "doc" ? moHinhDocCoDinh : null;
  const conDung = (m) => loai !== "doc" || !moHinhDocBo.has(m);
  let ds = coDinh ? [coDinh] : [...new Set([moHinhDung[loai], ...MO_HINH[loai]].filter(Boolean))].filter(conDung);
  let daHoi = !!coDinh, loiCuoi = null, hetNgay = null;
  for (let i = 0; i < ds.length; i++) {
    // luồng đọc khác vừa chốt loại Gemini cho video → bỏ danh sách cũ, chỉ dùng loại đã chốt
    if (loai === "doc" && moHinhDocCoDinh && moHinhDocCoDinh !== coDinh) return goiMotMa(loai, noiDung, tuyChon);
    const nghi = tenNghi(ds[i], loai);
    if (moHinhNghi.has(nghi)) {
      if (!daBaoNghi.has(nghi)) {
        daBaoNghi.add(nghi);
        const han = docLuu("phaha-dv-gemini-nghi")[nghi];
        nhat(`Bỏ qua ${ds[i]}: mã này đã hết lượt ở lần trước${han ? ` (thử lại sau ${new Date(han).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })})` : ""}`);
      }
      continue;
    }
    try {
      const kq = await goiMoHinh(ds[i], noiDung, loai, tuyChon);
      moHinhDung[loai] = ds[i];
      if (loai === "doc") {
        // luồng đọc khác vừa chốt loại khác → đọc lại đoạn này bằng đúng loại đã chốt cho giọng khỏi lệch
        if (moHinhDocCoDinh && moHinhDocCoDinh !== ds[i]) {
          nhat(`↻ Đọc lại đoạn này bằng ${moHinhDocCoDinh} cho giọng đồng nhất`);
          return goiMotMa(loai, noiDung, tuyChon);
        }
        if (!moHinhDocCoDinh) {
          moHinhDocCoDinh = ds[i];
          nhat(`🎙️ Cả video đọc bằng ${ds[i]} (giữ 1 loại Gemini cho giọng đồng nhất; mã hết lượt thì đổi mã, không đổi loại)`);
        }
        Object.defineProperty(kq, "moHinh", { value: ds[i] }); // loại Gemini thật sự đã đọc đoạn này
      }
      return kq;
    } catch (loi) {
      if (loi.status !== 404 && !loi.doiMoHinh) throw loi;
      loiCuoi = loi;
      if (loi.status === 404) { moHinhNghi.add(nghi); luuMoHinhNghi(nghi, 30 * 86400); }
      if (loi.goiY && !ds.includes(loi.goiY)) {
        ds.splice(i + 1, 0, loi.goiY);
        nhat(`↪️ ${ds[i]} đã ngừng, Google gợi ý dùng ${loi.goiY} → thử ngay`);
      }
      if (loi.message === "HET_NGAY") hetNgay = loi;
      if (loi.doiMoHinh) {
        moHinhNghi.add(nghi);
        if (loi.message === "HET_NGAY") luuMoHinhNghi(nghi, Math.min(loi.choGiay || 3600, 86400));
        if (moHinhDung[loai] === ds[i]) delete moHinhDung[loai];
        nhat(`↪️ Bỏ qua ${ds[i]} (${loi.message === "HET_NGAY" ? "hết lượt miễn phí hôm nay" : "đang quá tải"}), thử loại Gemini khác`);
      }
    }
    // Hết danh sách: hỏi Google xem hiện có loại nào khác
    if (i === ds.length - 1 && !daHoi) {
      daHoi = true;
      ds = ds.concat((await timMoHinh(loai)).filter((t) => !ds.includes(t) && conDung(t)));
    }
  }
  // Có loại báo hết lượt hôm nay (các loại khác ngừng/không có) → coi là mã này hết lượt, để xoay sang mã kế tiếp
  if (hetNgay) { ghiHetGemini(loai); throw hetNgay; }
  // Mọi loại đều đang được nhớ là ngừng/hết lượt, trong đó có loại hết lượt (ghi nhớ ngắn, ≤ 1 ngày) → hết lượt hôm nay
  const nho = docLuu("phaha-dv-gemini-nghi");
  const hetLuotNho = (m) => moHinhNghi.has(tenNghi(m, loai)) && (nho[tenNghi(m, loai)] || 0) - Date.now() <= 2 * 86400000;
  if (ds.every((m) => moHinhNghi.has(tenNghi(m, loai))) && (!loiCuoi || loiCuoi.status === 404) && ds.some(hetLuotNho))
    throw Object.assign(new Error("HET_NGAY"), { doiMoHinh: true });
  // Đang giữ 1 loại cho giọng đồng nhất mà loại đó không dùng được với mã này → đổi sang mã kế tiếp
  if (coDinh) throw Object.assign(new Error(`${coDinh} không dùng được với mã này`), { doiMa: true, choGiay: loiCuoi?.choGiay || 0 });
  if (loiCuoi?.doiMoHinh) throw new Error("Gemini đang quá tải ở mọi loại. Chờ vài phút rồi bấm Bắt đầu lại.");
  throw new Error("Không tìm thấy mô hình Gemini phù hợp. Vào Cài đặt → Nâng cao để nhập tên mô hình.");
}

async function timMoHinh(loai) {
  try {
    const r = await fetch(`${API_GEMINI}/models?pageSize=200`, { headers: { "x-goog-api-key": khoaGemini(loai) } });
    const j = await r.json();
    return (j.models || [])
      .map((m) => m.name.replace("models/", ""))
      .filter((t) => (loai === "doc" ? /tts/.test(t) : /flash/.test(t) && !/tts|image|live|audio|lite/.test(t)))
      .sort((a, b) => /flash/.test(b) - /flash/.test(a));
  } catch {
    return [];
  }
}

// Các loại không nhận tuỳ chọn tắt "suy nghĩ" (lưu trên máy để lần sau khỏi thử)
const khongTatSuyNghi = new Set(Array.isArray(docLuu("phaha-dv-khong-tat-suy-nghi")) ? docLuu("phaha-dv-khong-tat-suy-nghi") : []);

// Gọi 1 loại Gemini: chờ/gửi lại khi mạng chập chờn, quá lâu, giới hạn mỗi phút; báo lỗi rõ để bên ngoài đổi loại/mã
async function goiMoHinh(moHinh, noiDung, loai, tuyChon = {}) {
  let quaLau = 0;
  for (let lan = 0; ; lan++) {
    // Nghe & dịch: tắt chế độ "suy nghĩ" để trả lời nhanh hơn nhiều
    const guiDi = loai === "nghe" && !khongTatSuyNghi.has(moHinh)
      ? { ...noiDung, generationConfig: { ...noiDung.generationConfig, thinkingConfig: { thinkingBudget: 0 } } }
      : noiDung;
    // Bình thường Gemini nghe 1 đoạn ~1,5 phút chỉ mất 5–10 giây; quá 60 giây là máy chủ Google đang nghẽn → huỷ, gửi lại
    const huy = new AbortController();
    const hen = setTimeout(() => huy.abort(), (loai === "nghe" ? 60 : 45) * 1000);
    const khoa = khoaGemini(loai);
    if (khoa && !maHopLe(khoa)) throw Object.assign(new Error(LOI_MA_LA), { doiMa: true, maLa: true });
    const bd = Date.now();
    const thoiGian = () => ((Date.now() - bd) / 1000).toFixed(1) + " giây";
    let r;
    try {
      r = await fetch(`${API_GEMINI}/models/${moHinh}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": khoa },
        body: JSON.stringify(guiDi),
        signal: huy.signal,
      });
      if (r.ok) {
        const j = await r.json();
        demDung(`gm:${vanTayMa(khoaGemini(loai))}:${loai}`, 1, ngayMy());
        if (loai === "nghe" || Date.now() - bd > 8000) {
          const u = j.usageMetadata;
          nhat(`Gemini ${moHinh} (${loai === "nghe" ? "nghe & dịch" : "đọc"}): xong sau ${thoiGian()}${u ? ` · ${u.promptTokenCount || 0}→${u.candidatesTokenCount || 0} token${u.thoughtsTokenCount ? `, suy nghĩ ${u.thoughtsTokenCount}` : ""}` : ""}`);
        }
        return j;
      }
    } catch (loiMang) {
      if (huy.signal.aborted) {
        nhat(`⏱️ Gemini ${moHinh} quá lâu (${thoiGian()}), huỷ và gửi lại (lần ${quaLau + 1})`);
        if (++quaLau <= 2) continue;
        throw new Error("Gemini trả lời quá lâu. Kiểm tra mạng rồi bấm Bắt đầu để thử lại.");
      }
      nhat(`⚠️ Gemini ${moHinh}: lỗi mạng sau ${thoiGian()} (${loiMang?.message || loiMang})`);
      if (lan < 3) { await cho(3); continue; }
      throw new Error("Mất kết nối mạng khi gọi Gemini.");
    } finally {
      clearTimeout(hen);
    }
    const j = await r.json().catch(() => ({}));
    const thongBao = j.error?.message || r.statusText;
    nhat(`⚠️ Gemini ${moHinh}: mã ${r.status} sau ${thoiGian()} · ${String(thongBao).slice(0, 150)}`);
    if (r.status === 400 && guiDi !== noiDung && /thinking|invalid argument/i.test(thongBao)) {
      khongTatSuyNghi.add(moHinh);
      ghiLuu("phaha-dv-khong-tat-suy-nghi", [...khongTatSuyNghi]);
      nhat(`${moHinh} không nhận tuỳ chọn tắt suy nghĩ → gửi lại không kèm`);
      continue;
    }
    if (r.status === 429) {
      const chiTiet = JSON.stringify(j.error?.details || "");
      const giay = Number(/(\d+(?:\.\d+)?)s/.exec(j.error?.details?.find((d) => d.retryDelay)?.retryDelay || "")?.[1]);
      const quota = /quotaId\":\"([^\"]+)/.exec(chiTiet)?.[1];
      if (quota) nhat(`Giới hạn bị chạm: ${quota}${giay ? `, Google bảo chờ ${giay} giây` : ""}`);
      // Hết lượt trong ngày (hoặc phải chờ quá lâu) → đổi sang loại Gemini khác
      if (/per ?day|PerDay/i.test(thongBao + chiTiet) || !giay || giay > 60 || lan >= 3)
        throw Object.assign(new Error("HET_NGAY"), { chiTiet: thongBao, doiMoHinh: true, choGiay: giay });
      // Giới hạn mỗi phút: còn mã khác chưa thử thì đổi mã ngay (không ghi nhớ là hết lượt), hết mã mới ngồi chờ
      if (tuyChon.doiMaKhiCho) throw Object.assign(new Error("CHO_PHUT"), { doiMa: true, choGiay: giay });
      await cho(giay + 1, loai === "nghe" ? "dich" : "long");
      continue;
    }
    // Quá tải (503): thử lại 1 lần, vẫn quá tải thì đổi loại Gemini khác
    if (r.status === 503) {
      if (lan < 1) { await cho(3); continue; }
      throw Object.assign(new Error("Gemini đang quá tải"), { status: 503, doiMoHinh: true });
    }
    if (r.status >= 500 && lan < 3) { await cho(5); continue; }
    // Google chặn theo vị trí mạng (VPN, mạng nước ngoài…) – không phải lỗi mô hình hay mã → dừng luôn, không ghi nhớ
    if (/location is not supported/i.test(thongBao))
      throw Object.assign(new Error("Google đang chặn Gemini theo vị trí mạng của bạn (thường do VPN/proxy hoặc mạng nước ngoài). Tắt VPN hoặc đổi mạng (wifi ↔ 4G) rồi thử lại. Mã Gemini vẫn đúng."), { status: 400, viTri: true });
    const e = new Error(thongBao);
    e.status = r.status === 400 && /not found|not supported|is not/i.test(thongBao) ? 404 : r.status;
    e.goiY = /use models\/([\w.\-]+)/i.exec(thongBao)?.[1]; // Google gợi ý loại thay thế
    throw e;
  }
}

// Lấy phần chữ trong câu trả lời của Gemini
export function layChu(tl) {
  const ung = tl.candidates?.[0];
  if (!ung?.content?.parts) {
    if (ung?.finishReason === "SAFETY" || tl.promptFeedback?.blockReason) throw new Error("Gemini từ chối nội dung video này.");
    throw new Error("Gemini không trả lời. Bấm Bắt đầu để thử lại.");
  }
  return ung.content.parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("");
}

// ----- HẠN MỨC MỖI NGÀY (Google không cho xem qua mã → app tự đếm; hết lượt thật thì nhớ con số đúng) -----
const GM_UOC = { nghe: 250, doc: 15 };
// Hết lượt cả ngày: ghi lại số lượt đã dùng được hôm nay = hạn mức thật của mã này
function ghiHetGemini(loai) {
  const vt = vanTayMa(khoaGemini(loai)), ngay = ngayMy();
  const d = docLuu("phaha-dv-dung"), da = daDung(`gm:${vt}:${loai}`, ngay);
  if (da > 0) d[`max:gm:${vt}:${loai}`] = { n: da };
  d[`het:gm:${vt}:${loai}`] = { ngay };
  ghiLuu("phaha-dv-dung", d);
}
// Mã Gemini đọc còn bao nhiêu lượt hôm nay (cộng mọi mã đọc). null = chưa biết (mã chưa từng hết lượt, có thể trả phí)
export function conLuotGeminiDoc() {
  const cacMa = dsKhoaDoc().length ? dsKhoaDoc() : [caiDat.khoa].filter(Boolean);
  if (!cacMa.length) return 0;
  const ngay = ngayMy(), d = docLuu("phaha-dv-dung");
  let tong = 0;
  for (const khoa of cacMa) {
    const vt = vanTayMa(khoa);
    if (d[`het:gm:${vt}:doc`]?.ngay === ngay) continue;
    const hoc = d[`max:gm:${vt}:doc`]?.n;
    if (!hoc) return null;
    tong += Math.max(0, hoc - daDung(`gm:${vt}:doc`, ngay));
  }
  return tong;
}
// Giờ (giờ Việt Nam) lúc Gemini làm mới lượt: 0 giờ ở Mỹ
export function gioLamMoiGemini() {
  const [h, m] = new Date().toLocaleTimeString("en-GB", { timeZone: "America/Los_Angeles", hour: "2-digit", minute: "2-digit" }).split(":").map(Number);
  return new Date(Date.now() + (1440 - h * 60 - m) * 60000).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}
export function hanMuc(da, toiDa, donVi, uocTinh, lamMoi) {
  const con = Math.max(0, Math.round(100 * (1 - da / toiDa)));
  return `đã dùng ${da.toLocaleString("vi-VN")}/${toiDa.toLocaleString("vi-VN")} ${donVi}${uocTinh ? " (ước tính)" : ""} → còn ${con}%${lamMoi ? `, làm mới lúc ${lamMoi}` : ""}`;
}
export function hanMucGemini(khoa, loai) {
  const vt = vanTayMa(khoa), d = docLuu("phaha-dv-dung");
  const da = daDung(`gm:${vt}:${loai}`, ngayMy());
  const hoc = d[`max:gm:${vt}:${loai}`];
  const toiDa = hoc?.n || GM_UOC[loai];
  const ten = loai === "nghe" ? "nghe & dịch" : "đọc";
  if (d[`het:gm:${vt}:${loai}`]?.ngay === ngayMy()) return `${ten}: đã hết lượt hôm nay → còn 0%, làm mới lúc ${gioLamMoiGemini()}`;
  return `${ten}: ${hanMuc(da, Math.max(toiDa, da), "lượt", !hoc, gioLamMoiGemini())}`;
}
