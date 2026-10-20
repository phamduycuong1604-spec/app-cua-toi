// =====================================================
// NÚT 🔎 KIỂM TRA CÁC MÃ: thử từng mã đã dán (chỉ hỏi danh sách/số dư, không tốn lượt đọc/dịch)
// và hiện hạn mức + % còn lại (lấy số thật nếu dịch vụ cho xem, không thì đếm trên máy này)
// =====================================================
import { $, caiDat, nhat, daDung, kyTuThang, vanTayMa, quaMayChu, API_GEMINI } from "./nen.js";
import { dsKhoaDoc, hanMucGemini, hanMuc } from "./gemini.js";
import { EL_API, FISH_API, VT_API, FPT_API, azApi } from "./giong-doc.js";
import { duPhong } from "./nghe-dich.js";
import { layTuForm, lyDoKhongMayChu } from "./cai-dat-ui.js";

const gioLamMoiQT = () => new Date(Date.UTC(2000, 0, 1)).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
// Đọc câu trả lời: JSON nếu được, kèm nguyên văn (_t) để báo lỗi khi dịch vụ không ghi lý do rõ
const docJson = async (r) => {
  const t = await r.text().catch(() => "");
  let j = {};
  try { j = JSON.parse(t) || {}; } catch {}
  return { ...j, _t: t };
};

async function chiTietHanMuc(ten, r) {
  try {
    if (ten === "Gemini (nghe & dịch)") return hanMucGemini(caiDat.khoa, "nghe") + (caiDat.khoaDoc ? "" : " · " + hanMucGemini(caiDat.khoa, "doc"));
    if (ten === "Gemini riêng cho giọng đọc") return hanMucGemini(dsKhoaDoc()[0], "doc");
    const soMa = /^Gemini giọng đọc – mã (\d+)$/.exec(ten);
    if (soMa) return hanMucGemini(dsKhoaDoc()[soMa[1] - 1], "doc");
    if (ten === "Groq") {
      const giay = daDung(`groq:${vanTayMa(caiDat.dp.groq)}`);
      return `nghe: ${hanMuc(Math.round(giay / 60), 480, "phút âm thanh", true, gioLamMoiQT())}`;
    }
    if (ten === "OpenRouter") {
      const j = (await r.json().catch(() => ({}))).data || {};
      return hanMuc(daDung(`or:${vanTayMa(caiDat.dp.or)}`), j.is_free_tier === false ? 1000 : 50, "lượt dịch", false, gioLamMoiQT()) + " (đếm trên máy này)";
    }
    if (ten === "ElevenLabs") {
      const r2 = await fetch(EL_API + "/user/subscription", { headers: { "xi-api-key": caiDat.dv.el.khoa } });
      if (!r2.ok) return `không xem được hạn mức (mã thiếu quyền "User – Read")`;
      const j = await r2.json();
      const ngay = j.next_character_count_reset_unix ? new Date(j.next_character_count_reset_unix * 1000).toLocaleDateString("vi-VN") : "";
      const con = (j.character_limit || 0) - (j.character_count || 0);
      const canhBao = con < 300 ? " · ⚠️ HẾT lượt → app tự đọc bằng giọng kế tiếp (mua thêm gói để dùng lại)" : "";
      return `tháng này ${hanMuc(j.character_count || 0, j.character_limit || 1, "ký tự", false, "")}${ngay ? `, làm mới ngày ${ngay}` : ""}${canhBao}`;
    }
    if (ten === "Azure") return `đọc: ${hanMuc(kyTuThang("az"), 500000, "ký tự tháng này", true, "")}`;
  } catch {}
  return "dùng được";
}

// [tên, mã, hàm thử, (cách đọc kết quả riêng)]
function danhSachThu() {
  const bear = (k) => ({ headers: { Authorization: "Bearer " + k } });
  const gemini = (k) => () => fetch(`${API_GEMINI}/models?pageSize=1`, { headers: { "x-goog-api-key": k } });
  const maDoc = dsKhoaDoc().length ? dsKhoaDoc() : [""];
  return [
    ["Gemini (nghe & dịch)", caiDat.khoa, gemini(caiDat.khoa)],
    ...maDoc.map((k, i) => [maDoc.length > 1 ? `Gemini giọng đọc – mã ${i + 1}` : "Gemini riêng cho giọng đọc", k, gemini(k)]),
    ["DeepSeek", caiDat.dp.ds, () => duPhong.goi("https://api.deepseek.com/user/balance", bear(caiDat.dp.ds), "DeepSeek"), async (r) => {
      if (!r.ok) return null;
      const j = await r.json().catch(() => ({}));
      const tien = (j.balance_infos || []).map((b) => `${b.total_balance} ${b.currency}`).join(", ");
      const tat = caiDat.dichBang === "deepseek" ? "" : " (công tắc đang TẮT)";
      return j.is_available === false ? `⚠️ DeepSeek: mã đúng nhưng hết tiền (còn ${tien || 0}) – nạp thêm${tat}` : `✅ DeepSeek: mã đúng, còn ${tien || "?"} (trả trước, không giới hạn lượt)${tat}`;
    }],
    ["Groq", caiDat.dp.groq, () => duPhong.goi("https://api.groq.com/openai/v1/models", bear(caiDat.dp.groq), "Groq")],
    ["OpenRouter", caiDat.dp.or, () => duPhong.goi("https://openrouter.ai/api/v1/key", bear(caiDat.dp.or), "OpenRouter")],
    ["ElevenLabs", caiDat.dv.el.khoa, () => fetch(EL_API + "/voices", { headers: { "xi-api-key": caiDat.dv.el.khoa } })],
    ["Azure", caiDat.dv.az.khoa, () => fetch(azApi("/voices/list"), { headers: { "Ocp-Apim-Subscription-Key": caiDat.dv.az.khoa } })],
    // Viettel, FPT không có chỗ hỏi riêng → thử đọc 1 chữ rất ngắn (tốn vài ký tự)
    ["Viettel AI", caiDat.dv.vt.khoa, () => duPhong.goi(VT_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", accept: "*/*" },
      body: JSON.stringify({ text: "Xin.", voice: caiDat.dv.vt.giong, speed: 1, tts_return_option: 3, token: caiDat.dv.vt.khoa, without_filter: false }),
    }, "Viettel AI"), async (r) => {
      if (r.ok && !/json|text\/html/i.test(r.headers.get("content-type") || "")) return `✅ Viettel AI: mã đúng, đọc được · tháng này app đã đọc ${kyTuThang("vt").toLocaleString("vi-VN")} ký tự (đếm trên máy này; số còn lại xem ở viettelai.vn)`;
      const j = await docJson(r);
      const tb = String(j.vi_message || j.en_message || j.message || j.msg || j.error || j._t || r.status).slice(0, 120);
      return /quota|limit|exceed|remaining|upgrade|hết|vượt|không đủ|hạn mức|balance/i.test(tb) ? `⚠️ Viettel AI: mã đúng nhưng HẾT ký tự → app tự đọc bằng giọng kế tiếp (mua thêm gói ở viettelai.vn để dùng lại) · ${tb}` : `❌ Viettel AI: ${tb} – kiểm tra lại mã`;
    }],
    ["FPT.AI", caiDat.dv.fpt.khoa, () => duPhong.goi(FPT_API, {
      method: "POST",
      headers: { "api-key": caiDat.dv.fpt.khoa, voice: caiDat.dv.fpt.giong, speed: "0", "Content-Type": "text/plain; charset=utf-8" },
      body: "Xin chào",
    }, "FPT.AI"), async (r) => {
      const j = await docJson(r);
      if (r.ok && j.async && !j.error) return "✅ FPT.AI: mã đúng, đọc được";
      const tb = String(j.message || j.msg || j._t || r.status).slice(0, 120);
      return /cannot consume/i.test(tb) ? "⚠️ FPT.AI: mã đúng nhưng FPT không cho dùng đọc giọng (tài khoản cá nhân đã bị ngừng) – nên bỏ tích Dùng FPT.AI" : `❌ FPT.AI: ${tb}`;
    }],
    ["Fish Audio", caiDat.dv.fish.khoa, () => fetch(...quaMayChu(`${FISH_API}/wallet/self/api-credit`, bear(caiDat.dv.fish.khoa))), async (r) => {
      if (r.ok) {
        const j = await r.json().catch(() => ({}));
        return `✅ Fish Audio: mã đúng${j.credit != null ? ` · còn ${j.credit} tín dụng` : ""} (bản S2.1 Pro Free miễn phí)`;
      }
      if (r.status === 401 || r.status === 403) return "❌ Fish Audio: mã sai – dán lại mã";
      return "▫️ Fish Audio: đã dán mã – bấm 🔊 Nghe thử trong mục Fish để chắc chắn";
    }],
    ["Google Cloud", caiDat.bat.gc ? caiDat.dv.gc.khoa || "" : "", () => fetch("https://texttospeech.googleapis.com/v1/voices?languageCode=vi-VN", { headers: { "x-goog-api-key": caiDat.dv.gc.khoa } })],
  ];
}

async function kiemMotMa([ten, khoa, thu, rieng]) {
  if (!khoa) return `▫️ ${ten}: chưa dán mã`;
  try {
    const r = await thu();
    const kq = rieng && (await rieng(r));
    if (kq) return kq;
    if (r.ok) {
      const ct = await chiTietHanMuc(ten, r);
      return `${/HẾT lượt|còn 0%/.test(ct) ? "⚠️" : "✅"} ${ten}: mã đúng · ${ct}`;
    }
    if (r.status === 402) return `⚠️ ${ten}: mã đúng nhưng hết tiền – nạp thêm`;
    if (r.status === 429) return `⚠️ ${ten}: mã đúng nhưng đang hết lượt, chờ một lúc`;
    if (r.status === 400 && /location is not supported/i.test(await r.clone().text().catch(() => ""))) return `⚠️ ${ten}: Google chặn theo vị trí mạng (VPN/mạng nước ngoài) – tắt VPN hoặc đổi wifi ↔ 4G; mã có thể vẫn đúng`;
    if ([400, 401, 403].includes(r.status)) return `❌ ${ten}: mã sai hoặc thiếu quyền (mã ${r.status}) – dán lại mã`;
    return `⚠️ ${ten}: chưa kiểm tra được (mã ${r.status}), thử lại sau`;
  } catch (loi) {
    return `⚠️ ${ten}: không kết nối được (${loi.message})`;
  }
}

export function khoiDongKiemMa() {
  $("nut-kiem-tra-ma").addEventListener("click", async () => {
    layTuForm();
    const nut = $("nut-kiem-tra-ma"), o = $("kq-kiem-tra");
    nut.disabled = true;
    nut.textContent = "⏳ Đang kiểm tra…";
    const kq = await Promise.all(danhSachThu().map(kiemMotMa));
    const khongMC = lyDoKhongMayChu();
    kq.push(`${khongMC ? "⚠️" : "✅"} Máy chủ PHAHA (Fish, Edge, Cloudflare, tải link RedNote): ${khongMC || "đã đăng nhập, dùng được"}`);
    kq.push("Edge: không giới hạn · Cloudflare: 10.000 đơn vị/ngày (máy chủ không báo số còn lại).");
    kq.push("(ước tính) = app tự đếm trên máy này, dùng ở máy khác sẽ không tính vào.");
    o.textContent = kq.join("\n");
    o.classList.remove("an");
    nhat("Kiểm tra mã:\n" + kq.join("\n"));
    nut.disabled = false;
    nut.textContent = "🔎 Kiểm tra các mã";
  });
}
