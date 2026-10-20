// =====================================================
// NỀN CHUNG cho cả app: cài đặt đã lưu, trạng thái đang làm, nhật ký, đếm lượt, máy chủ PHAHA
// Các phần khác (nghe & dịch, giọng đọc, xử lý video, giao diện) đều dùng chung file này.
// =====================================================
import { macDinhLop } from "./lop-phu.js";
import { KENH, KENH_MAC_DINH, QUY_TAC_RIENG_SAN } from "./chuyen-mon.js";

export const $ = (id) => document.getElementById(id);
export const API_GEMINI = "https://generativelanguage.googleapis.com/v1beta";
export const TAN_SO_NGHE = 16000; // âm thanh gửi đi nghe: 16.000 mẫu/giây, 1 kênh
export const TAN_SO_DOC = 24000; // giọng đọc trả về / ghép vào video
export const DOAN_NGHE = 90; // mỗi lần gửi khoảng 1,5 phút âm thanh (đoạn ngắn trả lời nhanh, gửi song song)
export const NHANH_TOI_DA = 1.6; // câu dài quá thì đọc nhanh hơn, tối đa 1,6 lần

export function docLuu(ten) {
  try { return JSON.parse(localStorage.getItem(ten)) || {}; } catch { return {}; }
}
export function ghiLuu(ten, giaTri) {
  try { localStorage.setItem(ten, JSON.stringify(giaTri)); } catch {}
}

// ----- CÀI ĐẶT (lưu trên máy) -----
export const caiDat = Object.assign(
  { khoa: "", khoaDoc: "", dichBang: "gemini", giong: "Kore", amGoc: 15, mhNghe: "", mhDoc: "", dv: {}, tachNhac: false, mhTach: "nhanh", amNen: 90, chuDe: "", tuDien: "", kiemPd: false, kenh: KENH_MAC_DINH },
  docLuu("phaha-dv-cai-dat")
);
// Mỗi dịch vụ đọc có mã, giọng, danh sách giọng riêng (bản cũ lưu Google Cloud ở ngoài → chuyển vào)
caiDat.dv.gc = Object.assign({ khoa: caiDat.khoaGc || "", giong: caiDat.giongGc || "", ds: caiDat.dsGiongGc || [] }, caiDat.dv.gc);
caiDat.dv.az = Object.assign({ khoa: "", vung: "southeastasia", giong: "", ds: [] }, caiDat.dv.az);
caiDat.dv.el = Object.assign({ khoa: "", mh: "eleven_v3", giong: "", ds: [] }, caiDat.dv.el);
caiDat.dv.fish = Object.assign({ khoa: "", giong: "", ds: [] }, caiDat.dv.fish);
caiDat.dv.edge = Object.assign({ giong: "vi-VN-HoaiMyNeural" }, caiDat.dv.edge);
caiDat.dv.fpt = Object.assign({ khoa: "", giong: "banmai" }, caiDat.dv.fpt);
caiDat.dv.vt = Object.assign({ khoa: "", giong: "hn-quynhanh" }, caiDat.dv.vt);
// Bật/tắt từng dịch vụ đọc (Google Cloud chỉ bật sẵn nếu trước đây đã cài)
caiDat.bat = Object.assign({ el: true, vt: true, gemini: true, fpt: true, fish: true, az: true, gc: !!caiDat.dv.gc.giong, edge: true }, caiDat.bat);
// Phụ đề, lớp che, logo: giữ cài đặt cũ, thêm mục mới nếu thiếu
{
  const md = macDinhLop(), cu = caiDat.lop || {};
  caiDat.lop = { phuDe: { ...md.phuDe, ...cu.phuDe }, che: { ...md.che, ...cu.che }, che2: { ...md.che2, ...cu.che2 }, logo: { ...md.logo, ...cu.logo } };
}
delete caiDat.dichVu; delete caiDat.khoaGc; delete caiDat.giongGc; delete caiDat.dsGiongGc;
// Chuyên môn dịch: quy tắc riêng của từng kênh (kênh chưa có thì lấy quy tắc dựng sẵn)
caiDat.quyTacRieng = Object.assign({}, QUY_TAC_RIENG_SAN, caiDat.quyTacRieng);
if (!Object.hasOwn(KENH, caiDat.kenh)) caiDat.kenh = KENH_MAC_DINH;
caiDat.capNhat ||= 0;
// Dịch vụ dự phòng / dịch bằng DeepSeek
caiDat.dp = Object.assign({ ds: "", groq: "", cf: true, azNghe: true, azDich: "", azDichVung: "", or: "" }, caiDat.dp);

// Lưu cài đặt; nội dung (hoặc logo) thật sự thay đổi thì ghi mốc thời gian để đồng bộ biết máy nào mới hơn
let dauVanTay = null;
const vanTayCaiDat = () => {
  let logo = "";
  try { logo = localStorage.getItem("phaha-dv-logo") || ""; } catch {}
  return JSON.stringify({ ...caiDat, capNhat: 0 }) + "|" + logo.length + ":" + logo.slice(-64);
};
const khiDoiCaiDat = []; // vd đồng bộ: hẹn gửi cài đặt lên tài khoản
export const theoDoiDoiCaiDat = (ham) => khiDoiCaiDat.push(ham);
export function luuCaiDat() {
  const vt = vanTayCaiDat();
  if (dauVanTay !== null && vt !== dauVanTay) {
    caiDat.capNhat = Date.now();
    khiDoiCaiDat.forEach((ham) => ham());
  }
  dauVanTay = vt;
  ghiLuu("phaha-dv-cai-dat", caiDat);
}
export const ghiMocCaiDat = () => (dauVanTay = vanTayCaiDat()); // gọi 1 lần sau khi nạp xong (logo…)

// ----- TRẠNG THÁI của video đang làm (dùng chung giữa các phần) -----
export const S = {
  tepVideo: null,
  thoiLuong: 0, // giây
  cacCau: [], // [{start, end, zh, vi}]
  videoKetQua: null, // Blob
  dangChay: false,
  nhacNen: null, // { tep, loai, wav } nhạc nền đã tách, để làm lại không phải tách lại
  anhLogo: null,
  // Các việc nặng đang chạy – Giọng máy phải chờ chúng xong (tránh tràn bộ nhớ iPhone)
  dangTachNhac: null, // AI tách nhạc đang chạy
  dangVeHinh: null, // chèn chữ/logo sẽ chạy hoặc đang chạy
  veDangChay: false, // đang dựng hình thật (không chỉ "sẽ dựng")
  dangBatFf: null, // đang bật lại bộ xử lý video
  // Lồng tiếng báo đã chốt giọng: "may" = Giọng máy, "khac" = giọng khác đã đọc được câu đầu
  baoChonGiong: () => {},
};

// ----- NHẬT KÝ: ghi từng việc kèm thời gian để dễ tìm chỗ chậm/lỗi -----
let dongNhat = [], mocNhat = Date.now();
export function batDauNhat() { dongNhat = []; mocNhat = Date.now(); }
export const giayDaChay = () => (Date.now() - mocNhat) / 1000;
export function nhat(chu) {
  const s = giayDaChay();
  dongNhat.push(`[${String(Math.floor(s / 60)).padStart(2, "0")}:${(s % 60).toFixed(1).padStart(4, "0")}] ${chu}`);
  if (dongNhat.length > 500) dongNhat.shift();
  console.log("[PhaHa]", chu);
  const o = $("o-nhat-ky");
  o.textContent = dongNhat.join("\n");
  o.scrollTop = o.scrollHeight;
  try { localStorage.setItem("phaha-dv-nhat-ky", o.textContent); } catch {}
}

// ----- TIẾN ĐỘ TỪNG BƯỚC (danh sách bước trên màn hình) -----
export const TEN_BUOC = { tai: "Tải bộ xử lý", tach: "Tách tiếng", dich: "Nghe & dịch", nhac: "Tách nhạc nền", long: "Lồng tiếng", ve: "Chèn chữ/logo", xuat: "Xuất video" };
const batDauBuoc = {};
export function buoc(ten, trangThai, chu = "") {
  if (trangThai === "dang") {
    batDauBuoc[ten] = Date.now();
    nhat(`▶ ${TEN_BUOC[ten]}`);
    if (S.dangChay) ghiDangChay(ten);
  } else if (trangThai !== "cho") {
    const t = batDauBuoc[ten] ? ` (${((Date.now() - batDauBuoc[ten]) / 1000).toFixed(1)} giây)` : "";
    nhat(`${{ xong: "✅", loi: "❌", bo: "–" }[trangThai]} ${TEN_BUOC[ten]}${t}${chu ? " · " + chu : ""}`);
    delete batDauBuoc[ten];
  }
  const li = document.querySelector(`[data-buoc="${ten}"]`);
  li.classList.toggle("dang", trangThai === "dang");
  li.querySelector(".dau").textContent = { cho: "○", dang: "⏳", xong: "✅", loi: "❌", bo: "–" }[trangThai];
  li.querySelector("em").textContent = chu;
}
export function ghiChu(ten, chu) {
  document.querySelector(`[data-buoc="${ten}"] em`).textContent = chu;
}
export function baoLoi(chu) {
  if (chu) nhat("❌ BÁO LỖI: " + chu.replace(/\n/g, " / "));
  $("loi").textContent = chu;
  $("loi").classList.toggle("an", !chu);
}
// Ghi lại bước đang chạy: trang bị tắt giữa chừng (thường do iPhone tràn bộ nhớ) thì lần mở sau vẫn biết bước nào
export function ghiDangChay(ten) {
  try { ten ? localStorage.setItem("phaha-dang-chay", ten) : localStorage.removeItem("phaha-dang-chay"); } catch {}
}

// Chờ vài giây (đếm ngược trên bước đang chạy)
export async function cho(giay, tenBuoc) {
  for (let s = Math.ceil(giay); s > 0; s--) {
    if (tenBuoc) ghiChu(tenBuoc, `Gemini bảo chờ chút (giới hạn lượt miễn phí)… ${s}s`);
    await new Promise((x) => setTimeout(x, 1000));
  }
}
export const ngu = (ms) => new Promise((x) => setTimeout(x, ms));

// ----- ĐẾM LƯỢT ĐÃ DÙNG (trên máy này) để hiện hạn mức còn lại -----
// Gemini làm mới lúc 0 giờ giờ Mỹ (Thái Bình Dương); dịch vụ khác tính theo ngày quốc tế (UTC)
export const ngayMy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
export const ngayQT = () => new Date().toISOString().slice(0, 10);
export function demDung(ten, n = 1, ngay = ngayQT()) {
  const d = docLuu("phaha-dv-dung");
  const c = d[ten]?.ngay === ngay ? d[ten] : { ngay, n: 0 };
  c.n += n;
  d[ten] = c;
  for (const k of Object.keys(d)) if (d[k]?.ngay && d[k].ngay < ngay && !k.startsWith("max:")) delete d[k];
  ghiLuu("phaha-dv-dung", d);
}
export function daDung(ten, ngay = ngayQT()) {
  const c = docLuu("phaha-dv-dung")[ten];
  return c?.ngay === ngay ? c.n : 0;
}
// Ký tự đã đọc mỗi dịch vụ trong tháng, để biết còn trong mức miễn phí
export const thangNay = () => new Date().toISOString().slice(0, 7);
export function kyTuThang(dv) {
  const d = docLuu("phaha-dv-ky-tu");
  return d.thang === thangNay() ? d[dv] || 0 : 0;
}
export function congKyTu(dv, n) {
  const d = docLuu("phaha-dv-ky-tu");
  const moi = d.thang === thangNay() ? d : { thang: thangNay() };
  moi[dv] = (moi[dv] || 0) + n;
  ghiLuu("phaha-dv-ky-tu", moi);
}
// Dấu vân tay ngắn của 1 mã (ghi nhớ theo từng mã mà không lưu mã)
export function vanTayMa(khoa) {
  let h = 5381;
  for (let i = 0; i < khoa.length; i++) h = ((h << 5) + h + khoa.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// ----- MÁY CHỦ PHAHA (đăng nhập ở tab Lịch việc) -----
export const coMayChu = () => typeof DIA_CHI_MAY_CHU === "string" && !!DIA_CHI_MAY_CHU;
export const mayChu = () => (coMayChu() ? DIA_CHI_MAY_CHU : "");
export const veDangNhap = () => { try { return localStorage.getItem("ve-dang-nhap") || ""; } catch { return ""; } };
export const daDangNhap = () => !!veDangNhap();
// Gọi dịch vụ ngoài đi vòng qua máy chủ PHAHA (khi dịch vụ chặn gọi thẳng từ trình duyệt)
export const quaMayChu = (url, tuyChon = {}) => [mayChu() + "/ai/chuyen", { ...tuyChon, headers: { ...tuyChon.headers, "X-Dich-Den": url, "X-Ve": veDangNhap() } }];

// ----- Linh tinh -----
export function moTaMay() {
  const ios = /OS (\d+)_(\d+)/.exec(navigator.userAgent);
  return [
    ios ? `iOS ${ios[1]}.${ios[2]}` : navigator.userAgent.slice(0, 60),
    `chip đồ hoạ (WebGPU): ${navigator.gpu ? "có" : "không"}`,
    `bộ mã hoá video: ${typeof VideoEncoder !== "undefined" ? "có" : "không"}`,
    `${navigator.hardwareConcurrency || "?"} nhân`,
  ].join(" · ");
}
export function dongHo(s) {
  const p = Math.floor(s / 60), g = s - p * 60;
  return `${String(p).padStart(2, "0")}:${g.toFixed(1).padStart(4, "0")}`;
}
export function taiXuong(blob, ten) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = ten;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
export const tenTep = (duoi) => (S.tepVideo?.name || "video").replace(/\.[^.]+$/, "") + duoi;
