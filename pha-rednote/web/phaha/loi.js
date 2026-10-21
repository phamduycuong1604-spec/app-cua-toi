// =====================================================
// ĐỔI LỖI KỸ THUẬT THÀNH LỜI DỄ HIỂU (kèm cách xử lý)
// loi.dv = dịch vụ đọc gây lỗi (gc, az, el, fish, vt, fpt, edge); không có = Gemini / chung
// =====================================================
import { tenGiong } from "./giong-doc.js";

const THEO_DICH_VU = {
  gc: (m) => {
    if (/billing/i.test(m)) return "Google Cloud cần gắn thẻ thanh toán trước (vẫn miễn phí trong mức cho phép).\nMở ⚙️ Cài đặt → “Cách bật” → bước 1.";
    if (/has not been used|disabled|SERVICE_DISABLED/i.test(m)) return "Chưa bật dịch vụ đọc của Google Cloud cho mã này.\nMở ⚙️ Cài đặt → “Cách bật” → bước 2 (bấm Enable), chờ 1–2 phút rồi thử lại.";
    if (/API key not valid|API_KEY_INVALID/i.test(m)) return "Mã Google Cloud không đúng. Mở ⚙️ Cài đặt, dán lại mã.";
    if (/blocked|not authorized|PERMISSION_DENIED|restrict/i.test(m)) return "Mã này bị giới hạn, không được dùng dịch vụ đọc.\nVào console.cloud.google.com → APIs & Services → Credentials → sửa mã, cho phép “Cloud Text-to-Speech API”.";
    return "Google Cloud báo lỗi: " + m;
  },
  az: (m, loi) => {
    if (loi.status === 401) return "Mã Azure hoặc Vùng không đúng. Mở ⚙️ Cài đặt, kiểm tra lại KEY 1 và Location/Region (ví dụ southeastasia).";
    if (loi.status === 403 || loi.status === 429) return "Azure đã hết lượt miễn phí tháng này (hoặc đang quá tải). App tự chuyển sang giọng kế tiếp.";
    return "Azure báo lỗi: " + m;
  },
  el: (m, loi) => {
    if (loi.canGoiTraPhi) return `Giọng ElevenLabs đang chọn (${tenGiong("el") || "giọng thư viện"}) là giọng trong thư viện cộng đồng – tài khoản miễn phí không được dùng loại giọng này qua app. Cách xử lý: trong ⚙️ → ElevenLabs chọn một giọng MẶC ĐỊNH của ElevenLabs (không có chữ "thư viện"), hoặc mua gói trả phí.`;
    if (loi.hetLuot) return "ElevenLabs đã hết lượt tháng này. App tự chuyển sang giọng kế tiếp; muốn dùng tiếp thì mua thêm gói ElevenLabs.";
    if (loi.status === 401) return "Mã ElevenLabs không đúng hoặc thiếu quyền. Tạo lại mã, bật quyền Text to Speech và Voices (Read).\n" + m;
    if (/model/i.test(m)) return "Giọng/chất lượng này chưa đọc được tiếng Việt. Trong ⚙️ đổi Chất lượng sang “Nhanh (Flash)” rồi thử lại.\n" + m;
    return "ElevenLabs báo lỗi: " + m;
  },
  fish: (m, loi) => {
    if (loi.status === 401 || loi.status === 403) return "Mã Fish Audio không đúng hoặc chưa đăng nhập app PHAHA. Mở ⚙️ Cài đặt kiểm tra lại.\n" + m;
    if (loi.hetLuot || loi.status === 429) return "Fish Audio đã hết lượt miễn phí (hoặc đang quá tải). App tự chuyển sang giọng kế tiếp.";
    return "Fish Audio báo lỗi: " + m;
  },
  vt: (m, loi) => {
    if (/remaining unit|upgrade your package|vượt quá|hạn mức/i.test(m)) return "Viettel AI đã hết ký tự trong gói (mã vẫn đúng). App tự chuyển sang giọng kế tiếp; mua thêm gói ở viettelai.vn để dùng tiếp.";
    if (loi.status === 401 || loi.status === 403 || /token|key|auth/i.test(m)) return "Mã Viettel AI không đúng hoặc hết hạn. Mở ⚙️ Cài đặt → mục Viettel AI, dán lại mã.\n" + m;
    if (loi.hetLuot) return "Viettel AI đã hết ký tự. App tự chuyển sang giọng kế tiếp; mua thêm gói ở viettelai.vn để dùng tiếp.";
    return "Viettel AI báo lỗi: " + m;
  },
  fpt: (m, loi) => {
    if (/cannot consume|not.*(allow|permission)|forbidden/i.test(m)) return "Mã FPT.AI đúng nhưng FPT chưa cho dùng dịch vụ đọc giọng.\nVào console.fpt.ai → chọn đúng dự án → APIs → bật Text to Speech. Bật rồi vẫn lỗi thì FPT đã ngừng cho tài khoản cá nhân – bỏ tích \"Dùng FPT.AI\" để app dùng giọng khác.\n(" + m + ")";
    if (loi.status === 401 || loi.status === 403) return "Mã FPT.AI không đúng. Mở ⚙️ Cài đặt → mục FPT.AI, dán lại mã.\n" + m;
    if (loi.hetLuot) return "FPT.AI đã hết lượt dùng thử. App tự chuyển sang giọng kế tiếp; muốn dùng tiếp thì mua gói ở console.fpt.ai.";
    return "FPT.AI báo lỗi: " + m;
  },
  edge: (m, loi) => {
    if (loi.status === 401) return "Giọng Edge cần đăng nhập app PHAHA trên máy này (mở tab Lịch việc để đăng nhập).";
    if (loi.edgeYeu) return m + " – Microsoft đang chặn hoặc quá tải, app chuyển sang giọng kế tiếp.";
    return "Giọng Edge tạm không dùng được (Microsoft có thể đã chặn): " + m;
  },
};

export function loiDeHieu(loi) {
  const m = String(loi?.message || loi);
  if (m === "HET_NGAY") return "Mã Gemini miễn phí đã hết lượt hôm nay.\nCách xử lý: chờ đến mai, hoặc dùng mã Gemini tạo trong DỰ ÁN MỚI (aistudio.google.com → Create API key → Create in new project; mã cùng dự án dùng chung lượt), rồi bấm “Làm lại”. Những câu đã đọc xong được giữ lại, không tốn lượt lần nữa.";
  if (THEO_DICH_VU[loi?.dv]) return THEO_DICH_VU[loi.dv](m, loi);
  if (/API key not valid|API_KEY_INVALID/i.test(m)) return "Mã Gemini không đúng. Mở ⚙️ Cài đặt, dán lại mã.";
  if (loi?.status === 403) return "Mã Gemini không có quyền dùng (403). Kiểm tra mã ở aistudio.google.com.\n" + m;
  if (/Giọng máy/.test(m) && /out of memory|no available backend/i.test(m))
    return "Giọng máy không đủ bộ nhớ (điện thoại vừa chạy xong các bước nặng). Bấm 🔁 Làm lại: app giữ lời thoại đã dịch, không phải nghe lại.";
  if (/out of memory|OOM|Aborted/i.test(m)) return "Video quá nặng so với điện thoại. Thử video ngắn hơn hoặc nhẹ hơn.";
  return m;
}
