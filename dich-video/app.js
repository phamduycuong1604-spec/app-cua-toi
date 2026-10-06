// =====================================================
// PhaHa – Lồng tiếng video Trung → Việt
// Quy trình: chọn video → tách tiếng → Gemini nghe & dịch
//            → Gemini đọc tiếng Việt → ghép tiếng vào video
// Mọi thứ chạy ngay trên điện thoại, chỉ gửi phần âm thanh/chữ lên Gemini.
// =====================================================
import { FFmpeg } from "./ffmpeg/index.js";
import { macDinhLop, canVe, veLop, xuatHinh } from "./lop-phu.js";
import { taoDuPhong } from "./du-phong.js";
import { khoaLai, moKhoa, layTuMayChu, guiLenMayChu, layLichSuMayChu } from "./dong-bo.js";

const $ = (id) => document.getElementById(id);
const API = "https://generativelanguage.googleapis.com/v1beta";
// Bộ xử lý video (ffmpeg) tải từ mạng, lần sau trình duyệt tự giữ lại
const LOI_FFMPEG = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";
const TAN_SO_NGHE = 16000; // âm thanh gửi đi nghe: 16.000 mẫu/giây, 1 kênh
const TAN_SO_DOC = 24000; // giọng đọc Gemini trả về
const DOAN_NGHE = 90; // mỗi lần gửi khoảng 1,5 phút âm thanh (đoạn ngắn trả lời nhanh, gửi song song)
const NHANH_TOI_DA = 1.6; // câu dài quá thì đọc nhanh hơn, tối đa 1,6 lần

// ----- CÀI ĐẶT (lưu trên máy) -----
const caiDat = Object.assign(
  { khoa: "", khoaDoc: "", dichBang: "gemini", giong: "Kore", amGoc: 15, mhNghe: "", mhDoc: "", dv: {}, tachNhac: false, mhTach: "nhanh", amNen: 90 },
  docLuu("phaha-dv-cai-dat")
);
// Mỗi dịch vụ đọc có mã, giọng, danh sách giọng riêng
caiDat.dv.gc = Object.assign({ khoa: caiDat.khoaGc || "", giong: caiDat.giongGc || "", ds: caiDat.dsGiongGc || [] }, caiDat.dv.gc);
caiDat.dv.az = Object.assign({ khoa: "", vung: "southeastasia", giong: "", ds: [] }, caiDat.dv.az);
caiDat.dv.el = Object.assign({ khoa: "", mh: "eleven_v3", giong: "", ds: [] }, caiDat.dv.el);
caiDat.dv.fish = Object.assign({ khoa: "", giong: "", ds: [] }, caiDat.dv.fish);
caiDat.dv.edge = Object.assign({ giong: "vi-VN-HoaiMyNeural" }, caiDat.dv.edge);
caiDat.dv.fpt = Object.assign({ khoa: "", giong: "banmai" }, caiDat.dv.fpt);
caiDat.dv.vt = Object.assign({ khoa: "", giong: "hn-quynhanh" }, caiDat.dv.vt);
// Bật/tắt từng dịch vụ đọc (Google Cloud chỉ bật sẵn nếu trước đây đã cài)
caiDat.bat = Object.assign({ el: true, vt: true, gemini: true, fpt: true, fish: true, az: true, gc: !!caiDat.dv.gc.giong, edge: true }, caiDat.bat);
delete caiDat.dichVu;
// Phụ đề, lớp che, logo: giữ cài đặt cũ, thêm mục mới nếu thiếu
{
  const md = macDinhLop(), cu = caiDat.lop || {};
  caiDat.lop = { phuDe: { ...md.phuDe, ...cu.phuDe }, che: { ...md.che, ...cu.che }, logo: { ...md.logo, ...cu.logo } };
}
delete caiDat.khoaGc; delete caiDat.giongGc; delete caiDat.dsGiongGc;
// Dịch vụ dự phòng khi Gemini hết lượt
caiDat.capNhat ||= 0;
caiDat.dp = Object.assign({ ds: "", groq: "", cf: true, azNghe: true, azDich: "", azDichVung: "", or: "" }, caiDat.dp);

function docLuu(ten) {
  try { return JSON.parse(localStorage.getItem(ten)) || {}; } catch { return {}; }
}
// Lưu cài đặt; nếu nội dung (hoặc logo) thật sự thay đổi thì ghi mốc thời gian để đồng bộ biết máy nào mới hơn
let dauVanTayCaiDat = null;
function vanTayCaiDat() {
  let logo = "";
  try { logo = localStorage.getItem("phaha-dv-logo") || ""; } catch {}
  return JSON.stringify({ ...caiDat, capNhat: 0 }) + "|" + logo.length + ":" + logo.slice(-64);
}
function luuCaiDat() {
  const vt = vanTayCaiDat();
  if (dauVanTayCaiDat !== null && vt !== dauVanTayCaiDat) {
    caiDat.capNhat = Date.now();
    henGuiDongBo();
  }
  dauVanTayCaiDat = vt;
  try { localStorage.setItem("phaha-dv-cai-dat", JSON.stringify(caiDat)); } catch {}
}
// Đếm số ký tự (lượt) đã dùng mỗi dịch vụ trong tháng, để biết còn trong mức miễn phí
function thangNay() { return new Date().toISOString().slice(0, 7); }
function kyTuThang(dv) {
  const d = docLuu("phaha-dv-ky-tu");
  return d.thang === thangNay() ? d[dv] || 0 : 0;
}
function congKyTu(dv, n) {
  const d = docLuu("phaha-dv-ky-tu");
  const moi = d.thang === thangNay() ? d : { thang: thangNay() };
  moi[dv] = (moi[dv] || 0) + n;
  try { localStorage.setItem("phaha-dv-ky-tu", JSON.stringify(moi)); } catch {}
}

// ----- TRẠNG THÁI -----
let tepVideo = null;
let thoiLuong = 0; // giây
let cacCau = []; // [{start, end, zh, vi}]
const khoGiong = new Map(); // "giọng|câu" → Float32Array, để làm lại không phải đọc lại
let videoKetQua = null; // Blob
let ff = null;
let nhatKy = [];
let dangChay = false;
let nhacNen = null; // { tep, loai, wav } nhạc nền đã tách, để làm lại không phải tách lại
let anhLogo = null; // ảnh logo đã nạp
let dangTachNhac = null; // AI tách nhạc đang chạy (giọng máy phải chờ xong mới chạy, tránh tràn bộ nhớ)
let dangVeHinh = null, xongVeHinh = () => {}; // chèn chữ/logo đang chạy (giọng máy cũng phải chờ)

// ----- NHẬT KÝ: ghi lại từng việc kèm thời gian để dễ tìm chỗ chậm/lỗi -----
let nhatKyChay = [];
let mocNhat = Date.now();
function nhat(chu) {
  const s = (Date.now() - mocNhat) / 1000;
  const dong = `[${String(Math.floor(s / 60)).padStart(2, "0")}:${(s % 60).toFixed(1).padStart(4, "0")}] ${chu}`;
  nhatKyChay.push(dong);
  if (nhatKyChay.length > 500) nhatKyChay.shift();
  console.log("[PhaHa]", chu);
  const o = $("o-nhat-ky");
  o.textContent = nhatKyChay.join("\n");
  o.scrollTop = o.scrollHeight;
  try { localStorage.setItem("phaha-dv-nhat-ky", o.textContent); } catch {}
}
try { $("o-nhat-ky").textContent = localStorage.getItem("phaha-dv-nhat-ky") || "(chưa có)"; } catch {}
$("nut-chep-nhat-ky").addEventListener("click", async () => {
  const chu = $("o-nhat-ky").textContent;
  try {
    await navigator.clipboard.writeText(chu);
    $("nut-chep-nhat-ky").textContent = "✅ Đã sao chép – dán gửi người hỗ trợ";
  } catch {
    const r = document.createRange();
    r.selectNodeContents($("o-nhat-ky"));
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    $("nut-chep-nhat-ky").textContent = "Đã bôi đen – bấm Sao chép";
  }
});
const duPhong = taoDuPhong({
  caiDat, nhat, cho,
  dem: (ten, n) => demDung(`${ten}:${vanTayMa(ten === "groq" ? caiDat.dp.groq : caiDat.dp.or)}`, n),
});

// ----- ĐẾM LƯỢT ĐÃ DÙNG HÔM NAY (trên máy này) để hiện hạn mức còn lại -----
// Gemini làm mới lúc 0 giờ giờ Mỹ (Thái Bình Dương); dịch vụ khác tính theo ngày quốc tế (UTC)
const ngayMy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
const ngayQT = () => new Date().toISOString().slice(0, 10);
function demDung(ten, n = 1, ngay = ngayQT()) {
  const d = docLuu("phaha-dv-dung");
  const c = d[ten]?.ngay === ngay ? d[ten] : { ngay, n: 0 };
  c.n += n;
  d[ten] = c;
  for (const k of Object.keys(d)) if (d[k]?.ngay && d[k].ngay < ngay && !k.startsWith("max:")) delete d[k];
  try { localStorage.setItem("phaha-dv-dung", JSON.stringify(d)); } catch {}
}
function daDung(ten, ngay = ngayQT()) {
  const c = docLuu("phaha-dv-dung")[ten];
  return c?.ngay === ngay ? c.n : 0;
}
// Giờ (giờ Việt Nam) lúc Gemini làm mới lượt: 0 giờ ở Mỹ
function gioLamMoiGemini() {
  const [h, m] = new Date().toLocaleTimeString("en-GB", { timeZone: "America/Los_Angeles", hour: "2-digit", minute: "2-digit" }).split(":").map(Number);
  return new Date(Date.now() + (1440 - h * 60 - m) * 60000).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}
const gioLamMoiQT = () => new Date(Date.UTC(2000, 0, 1)).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
function hanMuc(da, toiDa, donVi, uocTinh, lamMoi) {
  const con = Math.max(0, Math.round(100 * (1 - da / toiDa)));
  return `đã dùng ${da.toLocaleString("vi-VN")}/${toiDa.toLocaleString("vi-VN")} ${donVi}${uocTinh ? " (ước tính)" : ""} → còn ${con}%${lamMoi ? `, làm mới lúc ${lamMoi}` : ""}`;
}
// Hạn mức miễn phí Gemini mỗi ngày (ước tính, Google không cho xem qua mã); hết lượt thật thì app tự nhớ con số đúng
const GM_UOC = { nghe: 250, doc: 15 };
function hanMucGemini(khoa, loai) {
  const vt = vanTayMa(khoa), d = docLuu("phaha-dv-dung");
  const da = daDung(`gm:${vt}:${loai}`, ngayMy());
  const hoc = d[`max:gm:${vt}:${loai}`];
  const toiDa = hoc?.n || GM_UOC[loai];
  const het = d[`het:gm:${vt}:${loai}`]?.ngay === ngayMy();
  const ten = loai === "nghe" ? "nghe & dịch" : "đọc";
  if (het) return `${ten}: đã hết lượt hôm nay → còn 0%, làm mới lúc ${gioLamMoiGemini()}`;
  return `${ten}: ${hanMuc(da, Math.max(toiDa, da), "lượt", !hoc, gioLamMoiGemini())}`;
}
window.addEventListener("error", (e) => nhat("⚠️ Lỗi trang: " + e.message));
window.addEventListener("unhandledrejection", (e) => nhat("⚠️ Lỗi ngầm: " + (e.reason?.message || e.reason)));
function moTaMay() {
  const ios = /OS (\d+)_(\d+)/.exec(navigator.userAgent);
  return [
    ios ? `iOS ${ios[1]}.${ios[2]}` : navigator.userAgent.slice(0, 60),
    `chip đồ hoạ (WebGPU): ${navigator.gpu ? "có" : "không"}`,
    `bộ mã hoá video: ${typeof VideoEncoder !== "undefined" ? "có" : "không"}`,
    `${navigator.hardwareConcurrency || "?"} nhân`,
  ].join(" · ");
}

// =====================================================
// GIAO DIỆN
// =====================================================
$("o-video").addEventListener("change", (e) => {
  const tep = e.target.files[0];
  if (!tep) return;
  tepVideo = tep;
  cacCau = [];
  videoKetQua = null;
  $("chu-chon-video").textContent = `${tep.name} · ${(tep.size / 1048576).toFixed(1)}MB (bấm để đổi)`;
  const xem = $("xem-goc");
  xem.src = URL.createObjectURL(tep);
  xem.classList.remove("an");
  xem.onloadedmetadata = () => (thoiLuong = xem.duration || 0);
  $("nut-bat-dau").classList.remove("an");
  ["the-tien-do", "the-ket-qua", "the-loi-thoai"].forEach((id) => $(id).classList.add("an"));
  nhacNen = null;
  $("the-tuy-chon").classList.remove("an");
  // Tải sẵn bộ xử lý video trong lúc người dùng chỉnh tuỳ chọn → bấm Bắt đầu chạy ngay
  if (!dangChay) taiFfmpeg().catch(() => {});
  xem.onloadeddata = xem.onseeked = xem.onpause = () => veXemTruoc();
});

$("nut-bat-dau").addEventListener("click", () => chay(true));
$("nut-lam-lai").addEventListener("click", () => chay(false));

$("nut-cai-dat").addEventListener("click", moCaiDat);
// Thứ tự dùng giọng: trên hết lượt/lỗi thì đọc lại cả video bằng cái kế tiếp
const THU_TU = ["el", "vt", "gemini", "fpt", "fish", "az", "gc", "edge", "may"];
const CAC_DV = ["gc", "az", "el", "fish"]; // các dịch vụ có mã + danh sách giọng tải về
const CAU_MAU = "Xin chào, đây là giọng lồng tiếng của PhaHa. Chúc bạn một ngày thật vui!";
const daDangNhap = () => { try { return !!localStorage.getItem("ve-dang-nhap"); } catch { return false; } };
const coMayChu = () => typeof DIA_CHI_MAY_CHU === "string" && !!DIA_CHI_MAY_CHU;

function moCaiDat() {
  $("o-khoa").value = caiDat.khoa;
  $("o-khoa-doc").value = caiDat.khoaDoc;
  $("o-mk-dong-bo").value = trangDongBo().mk || "";
  $("o-tu-dong-bo").checked = trangDongBo().tuDong !== false;
  hienTrangDongBo();
  $("bat-deepseek").checked = caiDat.dichBang === "deepseek";
  $("o-khoa-ds").value = caiDat.dp.ds;
  $("o-giong").value = caiDat.giong;
  for (const dv of CAC_DV) {
    $("o-khoa-" + dv).value = caiDat.dv[dv].khoa;
    veDsGiong(dv);
    const o = $("chu-ky-tu-" + dv);
    if (!o) continue;
    o.textContent = dv === "gc"
      ? "Tháng này (đếm trên máy này): " + Object.entries(LOAI_GC).map(([k, l]) => `${l.ten} ${kyTuThang("gc-" + k).toLocaleString("vi-VN")}/${(l.mienPhi / 1e6).toLocaleString("vi-VN")} triệu`).join(" · ") + ". Hết loại này app tự chuyển loại khác."
      : `Tháng này đã dùng ${kyTuThang(dv).toLocaleString("vi-VN")} / ${DICH_VU[dv].mienPhi.toLocaleString("vi-VN")} lượt miễn phí (đếm trên máy này).`;
  }
  for (const dv of THU_TU) if ($("bat-" + dv)) $("bat-" + dv).checked = caiDat.bat[dv];
  $("o-giong-edge").value = caiDat.dv.edge.giong;
  $("o-khoa-fpt").value = caiDat.dv.fpt.khoa;
  $("o-khoa-vt").value = caiDat.dv.vt.khoa;
  $("o-giong-vt").value = caiDat.dv.vt.giong;
  $("o-giong-fpt").value = caiDat.dv.fpt.giong;
  $("o-vung-az").value = caiDat.dv.az.vung;
  $("o-dp-groq").value = caiDat.dp.groq;
  $("o-dp-or").value = caiDat.dp.or;
  $("o-dp-az-dich").value = caiDat.dp.azDich;
  $("o-dp-az-dich-vung").value = caiDat.dp.azDichVung;
  $("o-dp-cf").checked = caiDat.dp.cf;
  $("o-dp-az-nghe").checked = caiDat.dp.azNghe;
  $("chu-dp-cf").textContent = coMayChu()
    ? (daDangNhap() ? "✅ Đã đăng nhập app PHAHA – dùng được" : "⚠️ Chưa đăng nhập app PHAHA trên máy này – mở tab Lịch việc để đăng nhập")
    : "⚠️ Chưa có máy chủ PHAHA";
  $("o-mh-el").value = caiDat.dv.el.mh;
  $("o-mh-nghe").value = caiDat.mhNghe;
  $("o-mh-doc").value = caiDat.mhDoc;
  hienTrangThai();
  // Mở sẵn mục giọng đang được dùng đầu tiên
  const dau = dvDocDung(true)[0];
  document.querySelectorAll(".dv-doc").forEach((d) => (d.open = d.dataset.dv === dau));
  $("hop-cai-dat").showModal();
}
$("hop-cai-dat").addEventListener("close", layTuForm);
function layTuForm() {
  for (const dv of CAC_DV) {
    caiDat.dv[dv].khoa = $("o-khoa-" + dv).value.trim();
    caiDat.dv[dv].giong = $("o-giong-" + dv).value || caiDat.dv[dv].giong;
  }
  for (const dv of THU_TU) if ($("bat-" + dv)) caiDat.bat[dv] = $("bat-" + dv).checked;
  caiDat.dv.edge.giong = $("o-giong-edge").value || caiDat.dv.edge.giong;
  caiDat.dv.fpt.khoa = $("o-khoa-fpt").value.trim();
  caiDat.dv.vt.khoa = $("o-khoa-vt").value.trim();
  caiDat.dv.vt.giong = $("o-giong-vt").value || caiDat.dv.vt.giong;
  caiDat.dv.fpt.giong = $("o-giong-fpt").value || caiDat.dv.fpt.giong;
  caiDat.dv.az.vung = $("o-vung-az").value.trim().toLowerCase().replace(/\s+/g, "") || "southeastasia";
  caiDat.dv.el.mh = $("o-mh-el").value;
  caiDat.dp.groq = $("o-dp-groq").value.trim();
  caiDat.dp.or = $("o-dp-or").value.trim();
  caiDat.dp.azDich = $("o-dp-az-dich").value.trim();
  caiDat.dp.azDichVung = $("o-dp-az-dich-vung").value.trim().toLowerCase().replace(/\s+/g, "");
  caiDat.dp.cf = $("o-dp-cf").checked;
  caiDat.dp.azNghe = $("o-dp-az-nghe").checked;
  // Đổi mã Gemini → quên ghi nhớ "loại Gemini nào hết lượt hôm nay" (đó là của mã cũ), để thử ngay mã mới
  if ($("o-khoa").value.trim() !== caiDat.khoa || $("o-khoa-doc").value.trim() !== caiDat.khoaDoc) {
    moHinhNghi.clear();
    try { localStorage.removeItem("phaha-dv-gemini-nghi"); } catch {}
    nhat("Đã đổi mã Gemini → thử lại mọi loại Gemini với mã mới");
  }
  caiDat.khoa = $("o-khoa").value.trim();
  caiDat.khoaDoc = $("o-khoa-doc").value.trim();
  ghiTrangDongBo({ mk: $("o-mk-dong-bo").value, tuDong: $("o-tu-dong-bo").checked });
  caiDat.dichBang = $("bat-deepseek").checked ? "deepseek" : "gemini";
  caiDat.dp.ds = $("o-khoa-ds").value.trim();
  caiDat.giong = $("o-giong").value;
  caiDat.mhNghe = $("o-mh-nghe").value.trim();
  caiDat.mhDoc = $("o-mh-doc").value.trim();
  luuCaiDat();
  // Lưu cài đặt = có thể vừa mua gói/đổi mã → quên ghi nhớ "hết lượt tháng này", lần sau thử lại
  try { localStorage.removeItem("phaha-dv-het-thang"); } catch {}
}

// Chữ nhỏ cạnh tên mỗi dịch vụ: sẵn sàng / thiếu gì
function trangThai(dv) {
  if (dv !== "may" && !caiDat.bat[dv]) return "⏸ đang tắt";
  const thieu = {
    el: !caiDat.dv.el.khoa && "chưa có mã",
    gemini: !caiDat.khoa && !caiDat.khoaDoc && "chưa có mã Gemini",
    fish: (!caiDat.dv.fish.khoa && "chưa có mã") || (!coMayChu() || !daDangNhap()) && "cần đăng nhập app PHAHA",
    az: !caiDat.dv.az.khoa && "chưa có mã",
    gc: !caiDat.dv.gc.khoa && !caiDat.khoa && "chưa có mã",
    edge: (!coMayChu() || !daDangNhap()) && "cần đăng nhập app PHAHA",
    fpt: !caiDat.dv.fpt.khoa && "chưa có mã",
    vt: !caiDat.dv.vt.khoa && "chưa có mã",
  }[dv];
  if (thieu) return "⚠️ " + thieu;
  if (dvHetThang(dv)) return "⛔ hết lượt tháng này";
  return dv === "gemini" && caiDat.khoaDoc ? "✅ sẵn sàng (mã riêng)" : "✅ sẵn sàng";
}
function hienTrangThai() {
  for (const dv of THU_TU) if ($("tt-" + dv)) $("tt-" + dv).textContent = trangThai(dv);
}
document.querySelectorAll(".dv-doc input").forEach((o) => o.addEventListener("change", () => { layTuForm(); hienTrangThai(); }));

function veDsGiong(dv) {
  const o = $("o-giong-" + dv), c = caiDat.dv[dv];
  if (!c.ds.length) return;
  o.innerHTML = "";
  for (const g of c.ds) o.add(new Option(g.nhan, g.ten));
  o.value = c.giong || c.ds[0].ten;
}

// Tải danh sách giọng; chưa chọn giọng thì lấy giọng hay nhất (đầu danh sách) làm mặc định
async function taiDsGiong(dv) {
  const c = caiDat.dv[dv];
  if (dv !== "gc" && !c.khoa) throw new Error("Dán mã " + DICH_VU[dv].ten + " trước đã.");
  c.ds = await DICH_VU[dv].taiGiong();
  if (!c.ds.length) throw new Error(DICH_VU[dv].ten + " chưa có giọng nào dùng được.");
  if (!c.ds.some((g) => g.ten === c.giong)) c.giong = c.ds[0].ten;
  luuCaiDat();
}

for (const dv of CAC_DV) {
  $("nut-tai-giong-" + dv).addEventListener("click", async () => {
    layTuForm();
    const nut = $("nut-tai-giong-" + dv);
    nut.disabled = true;
    nut.textContent = "Đang tải…";
    try {
      await taiDsGiong(dv);
      veDsGiong(dv);
      nut.textContent = `✅ Có ${caiDat.dv[dv].ds.length} giọng`;
    } catch (loi) {
      alert(loiDeHieu(loi));
      nut.textContent = "🔄 Tải danh sách giọng";
    } finally {
      nut.disabled = false;
    }
  });
}

// Nút 🔊 Nghe thử trong từng dịch vụ: đọc câu mẫu bằng đúng dịch vụ + giọng đang chọn
document.querySelectorAll(".nut-nghe").forEach((nut) => {
  nut.addEventListener("click", () => {
    layTuForm();
    const dv = nut.dataset.dv;
    bamNghe(nut, async () => {
      if (CAC_DV.includes(dv) && !caiDat.dv[dv].giong) { await taiDsGiong(dv); veDsGiong(dv); }
      return docCau(CAU_MAU, dv);
    }, DICH_VU[dv].ten + ": ", "⏳ Đang đọc…", "▶️ Đọc xong – bấm ▶ bên dưới để nghe");
  });
});

// =====================================================
// ĐỒNG BỘ CÀI ĐẶT GIỮA CÁC MÁY (xem dong-bo.js)
// Ghi nhớ: lucMayChu = mốc bản trên máy chủ lần cuối máy này thấy/gửi; lucMay = mốc cài đặt máy này lúc đó
// → biết được bên nào đã đổi kể từ lần đồng bộ trước.
// Không đồng bộ: nhật ký, đếm lượt, ghi nhớ hết lượt (mỗi máy tự có).
// =====================================================
function trangDongBo() { return docLuu("phaha-dv-dong-bo"); }
function ghiTrangDongBo(them) {
  const d = { ...trangDongBo(), ...them };
  try { localStorage.setItem("phaha-dv-dong-bo", JSON.stringify(d)); } catch {}
  return d;
}
function hienTrangDongBo(chu) {
  const d = trangDongBo(), o = $("tt-dong-bo");
  if (!o) return;
  if (chu) { o.textContent = chu; return; }
  if (!coMayChu() || !daDangNhap()) o.textContent = "⚠️ Cần đăng nhập app PHAHA (cùng 1 tài khoản trên các máy).";
  else if (!d.mk) o.textContent = "Đặt mật khẩu đồng bộ rồi bấm Đồng bộ ngay.";
  else o.textContent = d.lanCuoi ? `Lần đồng bộ gần nhất: ${new Date(d.lanCuoi).toLocaleString("vi-VN")}` : "Chưa đồng bộ lần nào trên máy này.";
}
function goiCaiDat() {
  let logo = null;
  try { logo = localStorage.getItem("phaha-dv-logo"); } catch {}
  if (logo && logo.length > 900000) logo = undefined; // logo quá nặng → không gửi
  return { caiDat, logo, may: moTaMay().split(" · ")[0] };
}
// Đếm số mã API đang có trong 1 bản cài đặt (để không bao giờ lặng lẽ thay bản nhiều mã bằng bản ít mã)
function demMa(cd = {}) {
  const dv = cd.dv || {}, dp = cd.dp || {};
  return [cd.khoa, cd.khoaDoc, dp.ds, dp.groq, dp.or, dp.azDich, dv.el?.khoa, dv.fish?.khoa, dv.az?.khoa, dv.gc?.khoa, dv.fpt?.khoa, dv.vt?.khoa].filter(Boolean).length;
}
// Cất bản cài đặt hiện tại trước khi bị thay (giữ 5 bản gần nhất) → khôi phục được
function catSaoLuu(lyDo) {
  try {
    const ds = JSON.parse(localStorage.getItem("phaha-dv-sao-luu") || "[]");
    ds.unshift({ luc: Date.now(), lyDo, caiDat: JSON.parse(localStorage.getItem("phaha-dv-cai-dat") || "{}"), logo: localStorage.getItem("phaha-dv-logo") });
    localStorage.setItem("phaha-dv-sao-luu", JSON.stringify(ds.slice(0, 5)));
  } catch {}
}
function apDungCaiDat(du, capNhat) {
  catSaoLuu("trước khi lấy cài đặt từ " + (du.may || "máy khác"));
  try {
    localStorage.setItem("phaha-dv-cai-dat", JSON.stringify(du.caiDat));
    if (du.logo) localStorage.setItem("phaha-dv-logo", du.logo);
    else if (du.logo === null) localStorage.removeItem("phaha-dv-logo");
  } catch {}
  ghiTrangDongBo({ lucMayChu: capNhat, lucMay: du.caiDat.capNhat || 0, lanCuoi: Date.now() });
  nhat(`🔄 Đã lấy cài đặt từ ${du.may || "máy khác"} → tải lại trang`);
  setTimeout(() => location.reload(), 600);
}
async function guiDongBo(d) {
  const capNhat = await guiLenMayChu(DIA_CHI_MAY_CHU, veDangNhap(), await khoaLai(goiCaiDat(), d.mk));
  ghiTrangDongBo({ lucMayChu: capNhat, lucMay: caiDat.capNhat, lanCuoi: Date.now() });
  nhat("🔄 Đã gửi cài đặt máy này lên tài khoản");
}
// cheDo: "bam" (người dùng bấm nút), "mo" (vừa mở app), "luu" (vừa lưu cài đặt)
// Nguyên tắc an toàn:
//  - Máy chưa đồng bộ lần nào + tài khoản đã có bản → LUÔN hỏi, không tự làm gì
//  - Tự động (mở app / lưu) chỉ chạy khi không làm giảm số mã; còn lại để người dùng bấm và chọn
//  - Trước khi thay cài đặt máy này luôn cất bản sao lưu (khôi phục được)
let dangDongBo = false;
async function dongBo(cheDo) {
  const d = trangDongBo();
  if (dangDongBo || !d.mk || !coMayChu() || !daDangNhap()) return;
  if (cheDo !== "bam" && d.tuDong === false) return;
  dangDongBo = true;
  const tuDong = cheDo !== "bam";
  try {
    const tren = await layTuMayChu(DIA_CHI_MAY_CHU, veDangNhap());
    const lanDau = !d.lucMayChu;
    const mayDoi = lanDau || (caiDat.capNhat || 0) > (d.lucMay || 0);
    const maMay = demMa(caiDat);
    if (!tren) {
      if (tuDong && maMay === 0) return;
      if (maMay === 0 && !confirm("Máy này chưa có mã nào. Vẫn gửi cài đặt trống lên tài khoản?\n(Nên bấm Đồng bộ ở máy CÓ ĐỦ mã trước)")) return hienTrangDongBo("Đã huỷ. Hãy bấm Đồng bộ ở máy có đủ mã trước.");
      await guiDongBo(d);
      return hienTrangDongBo("✅ Đã gửi cài đặt máy này lên. Máy kia bấm Đồng bộ ngay (cùng mật khẩu) để lấy về.");
    }
    const trenDoi = tren.capNhat > (d.lucMayChu || 0);
    if (!trenDoi && !mayDoi) return hienTrangDongBo("✅ Đã giống nhau, không có gì mới.");
    const du = await moKhoa(tren.goi, d.mk);
    const maTren = demMa(du.caiDat);
    const gioTren = new Date(tren.capNhat).toLocaleString("vi-VN");
    const hoiChon = async (loiMo) => {
      if (tuDong) return hienTrangDongBo("⚠️ Cần bạn chọn: mở ⚙️ → Đồng bộ ngay.");
      if (confirm(`${loiMo}\n\n• Trên tài khoản: ${maTren} mã (từ ${du.may || "máy khác"}, ${gioTren})\n• Máy này: ${maMay} mã\n\nOK = LẤY bản trên tài khoản về máy này\nHuỷ = GIỮ máy này (và gửi lên tài khoản)`)) {
        hienTrangDongBo("✅ Đã lấy cài đặt về, đang tải lại…");
        return apDungCaiDat(du, tren.capNhat);
      }
      if (maMay < maTren && !confirm(`Gửi lên sẽ THAY bản trên tài khoản (${maTren} mã) bằng bản máy này (${maMay} mã).\nChắc chắn?`)) return hienTrangDongBo("Đã huỷ, chưa thay đổi gì.");
      await guiDongBo(d);
      hienTrangDongBo("✅ Đã gửi cài đặt máy này lên.");
    };
    if (lanDau) return await hoiChon("Máy này đồng bộ lần đầu.");
    if (trenDoi && mayDoi) return await hoiChon("Cả máy này và máy kia đều đã đổi cài đặt.");
    if (trenDoi) {
      // chỉ tài khoản có bản mới
      if (maTren < maMay) return await hoiChon("Bản trên tài khoản có ÍT mã hơn máy này.");
      if (cheDo === "mo" && tepVideo) return; // đang làm video thì không tải lại trang
      hienTrangDongBo("✅ Đã lấy cài đặt mới về, đang tải lại…");
      return apDungCaiDat(du, tren.capNhat);
    }
    // chỉ máy này đổi
    if (maMay < maTren) return await hoiChon("Máy này có ÍT mã hơn bản trên tài khoản.");
    await guiDongBo(d);
    hienTrangDongBo("✅ Đã gửi thay đổi của máy này lên.");
  } catch (loi) {
    nhat("🔄 Đồng bộ lỗi: " + loi.message);
    hienTrangDongBo("❌ " + loi.message);
    if (cheDo === "bam") alert(loi.message);
  } finally {
    dangDongBo = false;
  }
}
// Khôi phục: bản sao lưu trên máy này + các bản cũ trên tài khoản
$("nut-khoi-phuc-cd").addEventListener("click", async () => {
  layTuForm();
  const o = $("ds-khoi-phuc");
  o.innerHTML = "⏳ Đang tìm các bản cũ…";
  o.classList.remove("an");
  const ds = [];
  try { for (const b of JSON.parse(localStorage.getItem("phaha-dv-sao-luu") || "[]")) ds.push({ ...b, noi: "trên máy này" }); } catch {}
  const mk = trangDongBo().mk;
  if (mk && coMayChu() && daDangNhap()) {
    try {
      for (const b of await layLichSuMayChu(DIA_CHI_MAY_CHU, veDangNhap())) {
        try { const du = await moKhoa(b.goi, mk); ds.push({ luc: b.luc, caiDat: du.caiDat, logo: du.logo, noi: "trên tài khoản, từ " + (du.may || "máy khác") }); } catch {}
      }
    } catch (loi) { nhat("Không tải được bản cũ trên tài khoản: " + loi.message); }
  }
  o.innerHTML = "";
  if (!ds.length) { o.textContent = "Chưa có bản cũ nào để khôi phục."; return; }
  ds.sort((a, b) => b.luc - a.luc).forEach((b) => {
    const dong = document.createElement("div");
    dong.className = "dong-khoi-phuc";
    const chu = document.createElement("span");
    chu.textContent = `${new Date(b.luc).toLocaleString("vi-VN")} · ${demMa(b.caiDat)} mã · ${b.noi}`;
    const nut = document.createElement("button");
    nut.type = "button";
    nut.className = "nut-phu nut-nho";
    nut.textContent = "Khôi phục";
    nut.onclick = () => {
      if (!confirm(`Khôi phục bản ${new Date(b.luc).toLocaleString("vi-VN")} (${demMa(b.caiDat)} mã)?\nCài đặt hiện tại sẽ được cất thành bản sao lưu.`)) return;
      catSaoLuu("trước khi khôi phục");
      try {
        localStorage.setItem("phaha-dv-cai-dat", JSON.stringify({ ...b.caiDat, capNhat: Date.now() }));
        if (b.logo) localStorage.setItem("phaha-dv-logo", b.logo);
      } catch {}
      nhat(`♻️ Đã khôi phục cài đặt bản ${new Date(b.luc).toLocaleString("vi-VN")}`);
      location.reload();
    };
    dong.append(chu, nut);
    o.appendChild(dong);
  });
});
let henDongBo = null;
function henGuiDongBo() {
  clearTimeout(henDongBo);
  henDongBo = setTimeout(() => dongBo("luu"), 3000);
}
$("nut-dong-bo").addEventListener("click", async () => {
  layTuForm();
  if (!trangDongBo().mk) return alert("Đặt mật khẩu đồng bộ trước (tự đặt, nhập giống nhau ở mọi máy).");
  if (trangDongBo().mk.length < 6) return alert("Mật khẩu đồng bộ cần ít nhất 6 ký tự.");
  const nut = $("nut-dong-bo");
  nut.disabled = true;
  nut.textContent = "⏳ Đang đồng bộ…";
  clearTimeout(henDongBo);
  await dongBo("bam");
  nut.disabled = false;
  nut.textContent = "🔄 Đồng bộ ngay";
});

// Hạn mức + % còn lại của từng dịch vụ (lấy số thật nếu dịch vụ cho xem, không thì đếm trên máy này)
async function chiTietHanMuc(ten, r) {
  try {
    if (ten === "Gemini (nghe & dịch)") {
      return hanMucGemini(caiDat.khoa, "nghe") + (caiDat.khoaDoc ? "" : " · " + hanMucGemini(caiDat.khoa, "doc"));
    }
    if (ten === "Gemini riêng cho giọng đọc") return hanMucGemini(caiDat.khoaDoc, "doc");
    if (ten === "Groq") {
      const giay = daDung(`groq:${vanTayMa(caiDat.dp.groq)}`);
      return `nghe: ${hanMuc(Math.round(giay / 60), 480, "phút âm thanh", true, gioLamMoiQT())}`;
    }
    if (ten === "OpenRouter") {
      const j = (await r.json().catch(() => ({}))).data || {};
      const toiDa = j.is_free_tier === false ? 1000 : 50;
      return hanMuc(daDung(`or:${vanTayMa(caiDat.dp.or)}`), toiDa, "lượt dịch", false, gioLamMoiQT()) + " (đếm trên máy này)";
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

// Nút 🔎 Kiểm tra các mã: thử từng mã đã dán (chỉ hỏi danh sách, không tốn lượt đọc/dịch)
$("nut-kiem-tra-ma").addEventListener("click", async () => {
  layTuForm();
  const nut = $("nut-kiem-tra-ma"), o = $("kq-kiem-tra");
  const bear = (k) => ({ headers: { Authorization: "Bearer " + k } });
  const ds = [
    ["Gemini (nghe & dịch)", caiDat.khoa, () => fetch(`${API}/models?pageSize=1`, { headers: { "x-goog-api-key": caiDat.khoa } })],
    ["Gemini riêng cho giọng đọc", caiDat.khoaDoc, () => fetch(`${API}/models?pageSize=1`, { headers: { "x-goog-api-key": caiDat.khoaDoc } })],
    ["DeepSeek", caiDat.dp.ds, () => duPhong.goi("https://api.deepseek.com/user/balance", bear(caiDat.dp.ds), "DeepSeek")],
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
      const kieu = r.headers.get("content-type") || "";
      if (r.ok && !/json|text\/html/i.test(kieu)) return `✅ Viettel AI: mã đúng, đọc được · tháng này app đã đọc ${kyTuThang("vt").toLocaleString("vi-VN")} ký tự (đếm trên máy này; số còn lại xem ở viettelai.vn)`;
      const t = await r.text().catch(() => ""); let j = {}; try { j = JSON.parse(t); } catch {}
      const tb = String(j.message || j.msg || j.error || t || r.status).slice(0, 120);
      return /quota|limit|hết|vượt|không đủ|balance/i.test(tb) ? `⚠️ Viettel AI: mã đúng nhưng hết ký tự – mua thêm gói (${tb})` : `❌ Viettel AI: ${tb} – kiểm tra lại mã`;
    }],
    ["FPT.AI", caiDat.dv.fpt.khoa, () => duPhong.goi(FPT_API, {
      method: "POST",
      headers: { "api-key": caiDat.dv.fpt.khoa, voice: caiDat.dv.fpt.giong, speed: "0", "Content-Type": "text/plain; charset=utf-8" },
      body: "Xin chào",
    }, "FPT.AI"), async (r) => {
      const t = await r.text().catch(() => ""); let j = {}; try { j = JSON.parse(t); } catch {}
      if (r.ok && j.async && !j.error) return "✅ FPT.AI: mã đúng, đọc được";
      const tb = String(j.message || j.msg || t || r.status).slice(0, 120);
      return /cannot consume/i.test(tb) ? "⚠️ FPT.AI: mã đúng nhưng FPT không cho dùng đọc giọng (tài khoản cá nhân đã bị ngừng) – nên bỏ tích Dùng FPT.AI" : `❌ FPT.AI: ${tb}`;
    }],
    ["Fish Audio", caiDat.dv.fish.khoa, () => fetch(...quaMayChu(`${FISH_API}/wallet/self/api-credit`, { headers: { Authorization: "Bearer " + caiDat.dv.fish.khoa } })), async (r) => {
      if (r.ok) {
        const j = await r.json().catch(() => ({}));
        return `✅ Fish Audio: mã đúng${j.credit != null ? ` · còn ${j.credit} tín dụng` : ""} (bản S2.1 Pro Free miễn phí)`;
      }
      if (r.status === 401 || r.status === 403) return "❌ Fish Audio: mã sai – dán lại mã";
      return "▫️ Fish Audio: đã dán mã – bấm 🔊 Nghe thử trong mục Fish để chắc chắn";
    }],
    ["Google Cloud", caiDat.bat.gc ? caiDat.dv.gc.khoa || "" : "", () => fetch("https://texttospeech.googleapis.com/v1/voices?languageCode=vi-VN", { headers: { "x-goog-api-key": caiDat.dv.gc.khoa } })],
  ];
  nut.disabled = true;
  nut.textContent = "⏳ Đang kiểm tra…";
  const kq = await Promise.all(ds.map(async ([ten, khoa, thu, rieng]) => {
    if (!khoa) return `▫️ ${ten}: chưa dán mã`;
    try {
      const r = await thu();
      if (rieng) return await rieng(r);
      if (r.ok && ten === "DeepSeek") {
        const j = await r.json().catch(() => ({}));
        const tien = (j.balance_infos || []).map((b) => `${b.total_balance} ${b.currency}`).join(", ");
        const tat = caiDat.dichBang === "deepseek" ? "" : " (công tắc đang TẮT)";
        return j.is_available === false ? `⚠️ DeepSeek: mã đúng nhưng hết tiền (còn ${tien || 0}) – nạp thêm${tat}` : `✅ DeepSeek: mã đúng, còn ${tien || "?"} (trả trước, không giới hạn lượt)${tat}`;
      }
      if (r.ok) {
        const ct = await chiTietHanMuc(ten, r);
        return `${/HẾT lượt|còn 0%/.test(ct) ? "⚠️" : "✅"} ${ten}: mã đúng · ${ct}`;
      }
      if (r.status === 402) return `⚠️ ${ten}: mã đúng nhưng hết tiền – nạp thêm`;
      if (r.status === 429) return `⚠️ ${ten}: mã đúng nhưng đang hết lượt, chờ một lúc`;
      if ([400, 401, 403].includes(r.status)) return `❌ ${ten}: mã sai hoặc thiếu quyền (mã ${r.status}) – dán lại mã`;
      return `⚠️ ${ten}: chưa kiểm tra được (mã ${r.status}), thử lại sau`;
    } catch (loi) {
      return `⚠️ ${ten}: không kết nối được (${loi.message})`;
    }
  }));
  kq.push(`${coMayChu() && daDangNhap() ? "✅" : "⚠️"} Máy chủ PHAHA (Fish, Edge, Viettel, Cloudflare): ${coMayChu() && daDangNhap() ? "đã đăng nhập" : "chưa đăng nhập app PHAHA trên máy này"}`);
  kq.push("Edge: không giới hạn · Cloudflare: 10.000 đơn vị/ngày (máy chủ không báo số còn lại).");
  kq.push("(ước tính) = app tự đếm trên máy này, dùng ở máy khác sẽ không tính vào.");
  o.textContent = kq.join("\n");
  o.classList.remove("an");
  nhat("Kiểm tra mã:\n" + kq.join("\n"));
  nut.disabled = false;
  nut.textContent = "🔎 Kiểm tra các mã";
});

// =====================================================
// TUỲ CHỈNH VIDEO: âm thanh, phụ đề, lớp che, logo
// Mỗi ô điều khiển có data-o="đường.dẫn" tới mục trong caiDat
// =====================================================
const layO = (duong) => duong.split(".").reduce((o, k) => o?.[k], caiDat);
function datO(duong, giaTri) {
  const k = duong.split(".");
  const cuoi = k.pop();
  k.reduce((o, x) => o[x], caiDat)[cuoi] = giaTri;
}

// Dựng thanh kéo từ <div class="truot" data-o=... data-min=... data-max=...>Tên</div>
document.querySelectorAll(".truot").forEach((o) => {
  const ten = o.textContent.trim(), donVi = o.dataset.donVi || "";
  o.innerHTML = `<div class="dong"><span></span><b></b></div><input type="range">`;
  o.querySelector("span").textContent = ten;
  const thanh = o.querySelector("input");
  Object.assign(thanh, { min: o.dataset.min, max: o.dataset.max, step: o.dataset.buoc || 1 });
  thanh.dataset.o = o.dataset.o;
  thanh.dataset.donVi = donVi;
});

const oDieuKhien = document.querySelectorAll("#the-tuy-chon [data-o]:not(.truot)");
function hienDieuKhien() {
  oDieuKhien.forEach((o) => {
    const v = layO(o.dataset.o);
    if (o.type === "checkbox") o.checked = !!v;
    else o.value = v;
    if (o.type === "range") o.closest(".truot").querySelector("b").textContent = v + (o.dataset.donVi || "");
  });
  // Ẩn/hiện phần phụ thuộc: data-hien="a.b" / "!a.b" / "a.b=giá trị"
  document.querySelectorAll("#the-tuy-chon [data-hien]").forEach((o) => {
    const dk = o.dataset.hien;
    let hien;
    if (dk.includes("=")) { const [d, g] = dk.split("="); hien = String(layO(d)) === g; }
    else hien = dk.startsWith("!") ? !layO(dk.slice(1)) : !!layO(dk);
    o.classList.toggle("an", !hien);
  });
  $("phan-logo").classList.toggle("an", !anhLogo);
  $("chu-logo").textContent = anhLogo ? "Đổi ảnh logo" : "Chọn ảnh logo";
}
oDieuKhien.forEach((o) => {
  o.addEventListener("input", () => {
    datO(o.dataset.o, o.type === "checkbox" ? o.checked : o.type === "range" ? Number(o.value) : o.value);
    hienDieuKhien();
    veXemTruoc();
  });
  o.addEventListener("change", luuCaiDat);
});

// ----- Logo: thu nhỏ còn tối đa 600px rồi lưu trên máy -----
$("o-logo").addEventListener("change", async (e) => {
  const tep = e.target.files[0];
  if (!tep) return;
  try {
    const anh = await createImageBitmap(tep);
    const tile = Math.min(1, 600 / Math.max(anh.width, anh.height));
    const kc = document.createElement("canvas");
    kc.width = Math.round(anh.width * tile);
    kc.height = Math.round(anh.height * tile);
    kc.getContext("2d").drawImage(anh, 0, 0, kc.width, kc.height);
    const du = kc.toDataURL("image/png");
    try { localStorage.setItem("phaha-dv-logo", du); } catch {}
    anhLogo = await napAnh(du);
    caiDat.lop.logo.bat = true;
    luuCaiDat();
    hienDieuKhien();
    veXemTruoc();
  } catch {
    alert("Không mở được ảnh này. Thử ảnh PNG hoặc JPG khác.");
  }
  e.target.value = "";
});
$("nut-xoa-logo").addEventListener("click", () => {
  anhLogo = null;
  try { localStorage.removeItem("phaha-dv-logo"); } catch {}
  caiDat.lop.logo.bat = false;
  luuCaiDat();
  hienDieuKhien();
  veXemTruoc();
});
function napAnh(nguon) {
  return new Promise((xong, hong) => {
    const a = new Image();
    a.onload = () => xong(a);
    a.onerror = hong;
    a.src = nguon;
  });
}
(async () => {
  try {
    const du = localStorage.getItem("phaha-dv-logo");
    if (du) anhLogo = await napAnh(du);
  } catch {}
  hienDieuKhien();
})();
dauVanTayCaiDat = vanTayCaiDat();
setTimeout(() => dongBo("mo"), 1500); // mở app: có bản mới từ máy khác thì lấy về

// ----- Ô xem thử: vẽ khung hình đang dừng của video + các lớp -----
function veXemTruoc() {
  const xem = $("xem-goc"), kv = $("xem-truoc");
  if (!xem.videoWidth) return;
  const tile = Math.min(1, 720 / Math.max(xem.videoWidth, xem.videoHeight));
  const W = Math.round(xem.videoWidth * tile), H = Math.round(xem.videoHeight * tile);
  if (kv.width !== W || kv.height !== H) { kv.width = W; kv.height = H; }
  const ctx = kv.getContext("2d");
  ctx.drawImage(xem, 0, 0, W, H);
  veLop(ctx, W, H, xem.currentTime, caiDat.lop, cacCau, anhLogo, "Đây là phụ đề tiếng Việt mẫu");
  $("goi-y-xem").textContent = xem.readyState >= 2
    ? "Tua video ở trên tới đoạn có chữ Trung, rồi kéo các thanh để căn chỉnh."
    : "Bấm ▶ video ở trên rồi dừng ở đoạn có chữ Trung để căn chỉnh.";
}
document.fonts?.ready.then(veXemTruoc);
let henVe = 0;
$("xem-goc").addEventListener("timeupdate", () => {
  if (Date.now() - henVe > 250) { henVe = Date.now(); veXemTruoc(); }
});

$("nut-luu").addEventListener("click", async () => {
  if (!videoKetQua) return;
  const ten = (tepVideo?.name || "video").replace(/\.[^.]+$/, "") + "-tieng-viet.mp4";
  const tep = new File([videoKetQua], ten, { type: "video/mp4" });
  // iPhone: mở bảng Chia sẻ → "Lưu video" vào Ảnh
  if (navigator.canShare?.({ files: [tep] })) {
    try { await navigator.share({ files: [tep] }); return; } catch (loi) { if (loi.name === "AbortError") return; }
  }
  taiXuong(videoKetQua, ten);
});

$("nut-phu-de").addEventListener("click", () => {
  const ten = (tepVideo?.name || "video").replace(/\.[^.]+$/, "") + "-tieng-viet.srt";
  taiXuong(new Blob([taoSrt()], { type: "text/plain" }), ten);
});

function taiXuong(blob, ten) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = ten;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

// ----- Tiến độ từng bước -----
const TEN_BUOC = { tai: "Tải bộ xử lý", tach: "Tách tiếng", dich: "Nghe & dịch", nhac: "Tách nhạc nền", long: "Lồng tiếng", ve: "Chèn chữ/logo", xuat: "Xuất video" };
const batDauBuoc = {};
function buoc(ten, trangThai, ghiChu = "") {
  if (trangThai === "dang") { batDauBuoc[ten] = Date.now(); nhat(`▶ ${TEN_BUOC[ten]}`); }
  else if (trangThai !== "cho") {
    const t = batDauBuoc[ten] ? ` (${((Date.now() - batDauBuoc[ten]) / 1000).toFixed(1)} giây)` : "";
    nhat(`${{ xong: "✅", loi: "❌", bo: "–" }[trangThai]} ${TEN_BUOC[ten]}${t}${ghiChu ? " · " + ghiChu : ""}`);
    delete batDauBuoc[ten];
  }
  const li = document.querySelector(`[data-buoc="${ten}"]`);
  li.classList.toggle("dang", trangThai === "dang");
  li.querySelector(".dau").textContent = { cho: "○", dang: "⏳", xong: "✅", loi: "❌", bo: "–" }[trangThai];
  li.querySelector("em").textContent = ghiChu;
}
function ghiChu(ten, chu) {
  document.querySelector(`[data-buoc="${ten}"] em`).textContent = chu;
}
function baoLoi(chu) {
  if (chu) nhat("❌ BÁO LỖI: " + chu.replace(/\n/g, " / "));
  $("loi").textContent = chu;
  $("loi").classList.toggle("an", !chu);
}

// ----- Bảng lời thoại -----
function veLoiThoai() {
  $("the-loi-thoai").classList.toggle("an", !cacCau.length);
  $("dem-cau").textContent = `${cacCau.length} câu`;
  const ds = $("ds-cau");
  ds.innerHTML = "";
  cacCau.forEach((c, i) => {
    const o = document.createElement("div");
    o.className = "cau";
    o.innerHTML = `
      <div class="cau-tren">
        <button class="gio">${dongHo(c.start)} → ${dongHo(c.end)}</button>
        <button class="nghe-thu" aria-label="Nghe giọng lồng">🔊</button>
      </div>
      <p class="chu-trung"></p>
      <textarea rows="2"></textarea>`;
    o.querySelector(".chu-trung").textContent = c.zh;
    const o2 = o.querySelector("textarea");
    o2.value = c.vi;
    o2.addEventListener("input", () => (cacCau[i].vi = o2.value));
    o.querySelector(".gio").addEventListener("click", () => {
      const xem = $("xem-goc");
      xem.currentTime = c.start;
      xem.play();
      xem.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    const nutNghe = o.querySelector(".nghe-thu");
    nutNghe.addEventListener("click", () => bamNghe(nutNghe, () => docCau(cacCau[i].vi, dvDocDung(true)[0]), "", "⏳", "▶️"));
    ds.appendChild(o);
  });
  veXemTruoc();
}

// ----- Phát giọng nghe thử -----
// iPhone chỉ cho phát tiếng NGAY lúc bấm. Giọng đọc phải chờ mạng vài giây nên có thể bị chặn:
// khi đó nút đổi thành ▶️, bấm lần nữa là phát ngay (đã đọc sẵn, không phải chờ).
// Phát bằng thẻ audio (như xem video) nên vẫn kêu khi iPhone để chế độ im lặng.
// Mỗi nút có 1 thanh phát nhạc (▶ có sẵn của iPhone) hiện ngay bên dưới sau khi đọc xong:
// tự phát được thì tốt, iPhone chặn thì bấm ▶ trên thanh đó (luôn được phép).
let diaChiIm = null;
const choPhat = new WeakMap(); // nút → giọng đã đọc xong, chờ bấm để phát

function loaCua(nut) {
  if (!nut._loa) {
    const a = document.createElement("audio");
    a.controls = true;
    a.playsInline = true;
    a.preload = "auto";
    a.className = "loa-nghe an";
    (nut.closest(".hang-nut-giong, .cau-tren") || nut).after(a);
    nut._loa = a;
  }
  return nut._loa;
}

function moKhoaLoa(loa) {
  // phát 0,2 giây im lặng ngay lúc bấm để iPhone "mở khoá" cái loa này
  diaChiIm ||= URL.createObjectURL(new Blob([taoWav(new Float32Array(TAN_SO_DOC / 5), TAN_SO_DOC)], { type: "audio/wav" }));
  try { loa.src = diaChiIm; loa.play().catch(() => {}); } catch {}
}

function phat(mau, loa) {
  if (loa._diaChi) URL.revokeObjectURL(loa._diaChi);
  loa._diaChi = URL.createObjectURL(new Blob([taoWav(mau, TAN_SO_DOC)], { type: "audio/wav" }));
  loa.src = loa._diaChi;
  loa.classList.remove("an");
  return loa.play();
}

async function bamNghe(nut, layMau, tienTo, chuCho, chuBam) {
  nut.dataset.goc ||= nut.textContent;
  const loa = loaCua(nut);
  const san = choPhat.get(nut);
  if (san) {
    // bấm lần 2: phát ngay trong lúc bấm → iPhone cho phép
    choPhat.delete(nut);
    nut.textContent = nut.dataset.goc;
    phat(san, loa).catch((loi) => nhat(`🔊 Nghe thử ${tienTo}bấm lại vẫn bị chặn (${loi?.name || loi}) → bấm ▶ trên thanh phát`));
    return;
  }
  if (nut.disabled) return;
  moKhoaLoa(loa);
  nut.disabled = true;
  nut.textContent = chuCho;
  const bd = Date.now();
  let mau;
  try {
    mau = await layMau();
  } catch (loi) {
    nut.disabled = false;
    nut.textContent = nut.dataset.goc;
    nhat(`🔊 Nghe thử ${tienTo}lỗi khi đọc: ${loi?.message || loi}`);
    alert(tienTo + loiDeHieu(loi));
    return;
  }
  nut.disabled = false;
  const doDai = `đọc xong ${((Date.now() - bd) / 1000).toFixed(1)} giây, tiếng dài ${(mau.length / TAN_SO_DOC).toFixed(1)} giây`;
  try {
    await phat(mau, loa);
    nut.textContent = nut.dataset.goc;
    nhat(`🔊 Nghe thử ${tienTo}${doDai}, đang phát`);
  } catch (loi) {
    choPhat.set(nut, mau);
    nut.textContent = chuBam;
    nhat(`🔊 Nghe thử ${tienTo}${doDai}, iPhone chặn tự phát (${loi?.name || loi}) → chờ bấm ▶`);
  }
}

// =====================================================
// CHẠY CẢ QUY TRÌNH
// lamTuDau = true: tách tiếng + dịch lại; false: dùng lời thoại đang sửa
// =====================================================
async function chay(lamTuDau) {
  if (dangChay || !tepVideo) return;
  if (!caiDat.khoa && !duPhong.coDuPhong()) {
    alert("Cần dán mã Gemini (hoặc cài dịch vụ dự phòng) trước. Mở Cài đặt nhé.");
    moCaiDat();
    return;
  }
  dangChay = true;
  geminiNghi = false;
  deepSeekNghi = false;
  daBaoNghi = new Set();
  napMoHinhNghi();
  duPhong.batDauLanMoi();
  nhatKyChay = [];
  mocNhat = Date.now();
  const l = caiDat.lop;
  nhat(`BẮT ĐẦU ${lamTuDau ? "(làm từ đầu)" : "(làm lại)"} · ${new Date().toLocaleString("vi-VN")}`);
  nhat(`Máy: ${moTaMay()}`);
  nhat(`Video: ${tepVideo.name} · ${(tepVideo.size / 1048576).toFixed(1)}MB`);
  nhat(`Cài đặt: dịch bằng ${dungDeepSeek() ? "DeepSeek (nghe bằng Groq/Cloudflare)" : "Gemini"} · thứ tự giọng ${dvDocDung(true).map((dv) => DICH_VU[dv].ten + (tenGiong(dv) ? " / " + tenGiong(dv) : "")).join(" → ")} · tách nhạc: ${caiDat.tachNhac ? caiDat.mhTach : "tắt"} · phụ đề: ${l.phuDe.bat ? "bật" : "tắt"} · lớp che: ${l.che.bat ? "bật" : "tắt"} · logo: ${l.logo.bat && anhLogo ? "bật" : "tắt"}`);
  ["nut-bat-dau", "nut-lam-lai"].forEach((id) => ($(id).disabled = true));
  $("the-tien-do").classList.remove("an");
  $("the-ket-qua").classList.add("an");
  baoLoi("");
  ["tai", "tach", "dich", "nhac", "long", "ve", "xuat"].forEach((b) => buoc(b, "cho"));
  if (!lamTuDau) { buoc("tach", "bo"); buoc("dich", "bo", "Dùng lời thoại bạn đã sửa"); }
  const khoaMan = await giuManHinh();
  let buocDang = "tai";
  try {
    buoc("tai", "dang");
    await taiFfmpeg();
    buoc("tai", "xong");
    let thongTin = await ganVideo();

    if (lamTuDau) {
      buocDang = "tach";
      buoc("tach", "dang");
      if (!thongTin.coTieng) throw new Error("Video này không có tiếng.");
      const pcm = await tachTieng();
      buoc("tach", "xong", `${dongHo(thoiLuong)} âm thanh`);

      buocDang = "dich";
      buoc("dich", "dang");
      cacCau = await ngheVaDich(pcm);
      if (!cacCau.length) throw new Error("Không nghe thấy lời nói tiếng Trung nào trong video.");
      buoc("dich", "xong", `${cacCau.length} câu`);
      veLoiThoai();
    }

    // Lồng tiếng chủ yếu chờ mạng → chạy song song với tách nhạc (AI chạy trên máy) cho nhanh
    buoc("long", "dang");
    dangVeHinh = canVe(caiDat.lop, cacCau, anhLogo) ? new Promise((x) => (xongVeHinh = x)) : null;
    const huaLong = Promise.resolve().then(longTieng).then((r) => { buoc("long", "xong"); return r; });
    huaLong.catch(() => {});

    buocDang = "nhac";
    let wavNen = null, giamTheoLoi = false;
    if (caiDat.tachNhac && thongTin.coTieng && caiDat.mhTach === "giam") {
      giamTheoLoi = true;
      buoc("nhac", "bo", "Giảm tiếng gốc lúc có lời (không dùng AI)");
    } else if (caiDat.tachNhac && thongTin.coTieng) {
      buoc("nhac", "dang");
      try {
        if (nhacNen?.tep !== tepVideo || nhacNen.loai !== caiDat.mhTach) {
          dangTachNhac = tachNhacNen();
          nhacNen = { tep: tepVideo, loai: caiDat.mhTach, wav: await dangTachNhac };
        }
        wavNen = nhacNen.wav;
        buoc("nhac", "xong");
      } catch (loi) {
        nhacNen = null;
        // AI không chạy được trên máy này → vẫn làm tiếp, chỉ giảm tiếng gốc lúc có lời
        nhat("Tách nhạc hỏng: " + (loi?.message || loi));
        giamTheoLoi = true;
        buoc("nhac", "loi", "AI không chạy được trên máy này → chuyển sang giảm tiếng gốc lúc có lời");
      }
    } else buoc("nhac", "bo", "Không bật");

    dangTachNhac = null;
    // Bộ xử lý video có thể đã được tắt để nhường bộ nhớ cho AI tách nhạc → bật lại (song song với chèn chữ)
    const huaFf = ff ? null : taiFfmpeg().then(ganVideo);
    huaFf?.catch(() => {});

    buocDang = "ve";
    let hinh = null;
    if (canVe(caiDat.lop, cacCau, anhLogo)) {
      buoc("ve", "dang");
      const batDau = Date.now();
      let mocVe = -1;
      try {
        hinh = await xuatHinh(
          tepVideo,
          (ctx, W, H, t) => veLop(ctx, W, H, t, caiDat.lop, cacCau, anhLogo),
          (p) => {
            ghiChu("ve", `${Math.round(p * 100)}%`);
            const nac = Math.floor(p * 4);
            if (nac !== mocVe) { mocVe = nac; nhat(`Chèn chữ/logo: ${Math.round(p * 100)}%`); }
          }
        );
        nhat(`Dựng hình xong: ${hinh.W}×${hinh.H}, mã hoá ${hinh.codec}, ${(hinh.blob.size / 1048576).toFixed(1)}MB`);
        buoc("ve", "xong", `${Math.round((Date.now() - batDau) / 1000)} giây`);
      } catch (loi) {
        if (!loi.khongHoTro) throw loi;
        // Máy không hỗ trợ: vẫn xuất video (không chữ/logo), vẫn tải được phụ đề .srt
        buoc("ve", "loi", loi.message + " Video sẽ xuất không có chữ/logo.");
      }
    } else buoc("ve", "bo", "Không bật");
    xongVeHinh();
    dangVeHinh = null;

    buocDang = "long";
    const tiengViet = await huaLong;
    if (huaFf) { buocDang = "xuat"; thongTin = await huaFf; }

    buocDang = "xuat";
    buoc("xuat", "dang");
    videoKetQua = await xuatVideo(tiengViet, thongTin, wavNen, hinh, giamTheoLoi);
    buoc("xuat", "xong", `${(videoKetQua.size / 1048576).toFixed(1)}MB`);

    nhat(`🎉 HOÀN TẤT · tổng ${((Date.now() - mocNhat) / 1000).toFixed(0)} giây · ${(videoKetQua.size / 1048576).toFixed(1)}MB`);
    $("xem-ket-qua").src = URL.createObjectURL(videoKetQua);
    $("the-ket-qua").classList.remove("an");
    $("the-ket-qua").scrollIntoView({ behavior: "smooth" });
  } catch (loi) {
    console.error(loi);
    nhat("❌ Chi tiết lỗi: " + (loi?.message || loi) + (loi?.status ? ` (mã ${loi.status})` : ""));
    buoc(buocDang, "loi");
    baoLoi(loiDeHieu(loi));
  } finally {
    dangChay = false;
    dangTachNhac = null;
    xongVeHinh();
    dangVeHinh = null;
    ["nut-bat-dau", "nut-lam-lai"].forEach((id) => ($(id).disabled = false));
    khoaMan?.release?.().catch(() => {});
  }
}

async function giuManHinh() {
  try { return await navigator.wakeLock?.request("screen"); } catch { return null; }
}

// =====================================================
// BỘ XỬ LÝ VIDEO (ffmpeg chạy trong trình duyệt)
// =====================================================
function tatFfmpeg() {
  try { ff?.terminate(); } catch {}
  ff = null;
  duongDanVideo = null;
}

let dangTaiFf = null;
function taiFfmpeg() {
  if (ff) return Promise.resolve();
  dangTaiFf ||= taiFfmpegThat().finally(() => (dangTaiFf = null));
  return dangTaiFf;
}
async function taiFfmpegThat() {
  const moi = new FFmpeg();
  moi.on("log", ({ message }) => {
    nhatKy.push(message);
    if (nhatKy.length > 400) nhatKy.shift();
  });
  const coreURL = await taiThanhBlob(`${LOI_FFMPEG}/ffmpeg-core.js`, "text/javascript");
  const wasmURL = await taiThanhBlob(`${LOI_FFMPEG}/ffmpeg-core.wasm`, "application/wasm", (da, tong) =>
    ghiChu("tai", tong ? `${Math.round((da / tong) * 100)}%` : `${(da / 1048576).toFixed(0)}MB`)
  );
  await moi.load({ coreURL, wasmURL });
  ff = moi;
}

async function taiThanhBlob(diaChi, kieu, baoTienDo) {
  const r = await fetch(diaChi);
  if (!r.ok) throw new Error("Không tải được bộ xử lý video. Kiểm tra mạng rồi thử lại.");
  const tong = Number(r.headers.get("content-length")) || 0;
  const doc = r.body.getReader();
  const manh = [];
  let da = 0;
  for (;;) {
    const { done, value } = await doc.read();
    if (done) break;
    manh.push(value);
    da += value.length;
    baoTienDo?.(da, tong);
  }
  return URL.createObjectURL(new Blob(manh, { type: kieu }));
}

// Chạy 1 lệnh ffmpeg, trả về nhật ký của lệnh đó
async function lenh(thamSo, tenBuoc) {
  nhatKy = [];
  const theoDoi = ({ message }) => {
    const m = /time=(\d+):(\d+):([\d.]+)/.exec(message);
    if (m && thoiLuong && tenBuoc) {
      const s = +m[1] * 3600 + +m[2] * 60 + +m[3];
      ghiChu(tenBuoc, `${Math.min(99, Math.round((s / thoiLuong) * 100))}%`);
    }
  };
  ff.on("log", theoDoi);
  const bd = Date.now();
  try {
    const ma = await ff.exec(thamSo);
    if (tenBuoc) nhat(`ffmpeg (${TEN_BUOC[tenBuoc]}): mã ${ma}, ${((Date.now() - bd) / 1000).toFixed(1)} giây${ma ? " · " + nhatKy.slice(-2).join(" / ") : ""}`);
    return { ma, log: nhatKy.join("\n") };
  } finally {
    ff.off("log", theoDoi);
  }
}

// Cho ffmpeg đọc thẳng file video (không chép cả file vào bộ nhớ)
let duongDanVideo = null;
async function ganVideo() {
  if (duongDanVideo?.tep !== tepVideo) {
    if (duongDanVideo?.gan) await ff.unmount("/vao").catch(() => {});
    for (const ten of await ff.listDir("/").catch(() => [])) {
      if (ten.name.startsWith("tam-")) await ff.deleteFile("/" + ten.name).catch(() => {});
    }
    let duong, gan = false;
    try {
      await ff.createDir("/vao").catch(() => {});
      await ff.mount("WORKERFS", { files: [tepVideo] }, "/vao");
      duong = "/vao/" + tepVideo.name;
      gan = true;
    } catch {
      duong = "/tam-video" + (/\.[^.]+$/.exec(tepVideo.name)?.[0] || ".mp4");
      await ff.writeFile(duong, new Uint8Array(await tepVideo.arrayBuffer()));
    }
    duongDanVideo = { tep: tepVideo, duong, gan };
  }
  // Hỏi ffmpeg video có những gì (lệnh sẽ "lỗi" vì không có đầu ra, không sao)
  const { log } = await lenh(["-hide_banner", "-i", duongDanVideo.duong]);
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(log);
  if (m) thoiLuong = +m[1] * 3600 + +m[2] * 60 + +m[3];
  if (!thoiLuong) throw new Error("Không đọc được video này. Thử video khác (MP4/MOV).");
  const hinh = /Stream #.*Video: (\w+)[^\n]*?(\d{2,5})x(\d{2,5})/.exec(log);
  const tieng = /Stream #.*Audio: (\w+)[^\n]*?(\d+) Hz, (\w+)/.exec(log);
  nhat(`Thông tin video: dài ${dongHo(thoiLuong)} · hình ${hinh ? `${hinh[1]} ${hinh[2]}×${hinh[3]}` : "?"} · tiếng ${tieng ? `${tieng[1]} ${tieng[2]}Hz ${tieng[3]}` : "không có"}`);
  return {
    duong: duongDanVideo.duong,
    coTieng: /Stream #.*Audio:/.test(log),
    hevc: /Stream #.*Video: hevc/.test(log),
  };
}

async function tachTieng() {
  const ra = "/tieng.pcm";
  const { ma, log } = await lenh(
    ["-hide_banner", "-i", duongDanVideo.duong, "-vn", "-ac", "1", "-ar", String(TAN_SO_NGHE), "-f", "s16le", ra],
    "tach"
  );
  if (ma !== 0) throw new Error("Không tách được tiếng khỏi video.\n" + log.split("\n").slice(-3).join("\n"));
  const du = await ff.readFile(ra);
  await ff.deleteFile(ra);
  return new Int16Array(du.buffer, du.byteOffset, du.byteLength >> 1);
}

// =====================================================
// GEMINI: NGHE & DỊCH
// =====================================================
async function ngheVaDich(pcm) {
  // Chia đoạn, cắt ở chỗ yên lặng nhất gần ranh giới để không cắt ngang câu nói
  const moc = [0];
  const moiDoan = DOAN_NGHE * TAN_SO_NGHE, khung = TAN_SO_NGHE / 10;
  while (pcm.length - moc[moc.length - 1] > moiDoan * 1.3) {
    const ranh = moc[moc.length - 1] + moiDoan;
    let tot = ranh, nhoNhat = Infinity;
    for (let a = ranh - 20 * TAN_SO_NGHE; a < ranh; a += khung) {
      let e = 0;
      for (let k = a; k < a + khung; k += 4) e += pcm[k] * pcm[k];
      if (e < nhoNhat) { nhoNhat = e; tot = a + khung / 2; }
    }
    moc.push(tot);
  }
  moc.push(pcm.length);
  const soDoan = moc.length - 1;
  const ketQua = [];
  let xong = 0;
  const batDauCho = Date.now();
  const baoTienDo = () => ghiChu("dich", `${soDoan > 1 ? `Xong ${xong}/${soDoan} đoạn · ` : "Đang nghe… "}${Math.round((Date.now() - batDauCho) / 1000)} giây`);
  baoTienDo();
  const dongHoCho = setInterval(baoTienDo, 1000);
  try {
    const hang = Array.from({ length: soDoan }, (_, d) => d);
    await Promise.all([0, 1, 2].map(async () => {
      while (hang.length) {
        const d = hang.shift();
        ketQua.push(...(await ngheMotDoan(pcm.subarray(moc[d], moc[d + 1]), moc[d] / TAN_SO_NGHE)));
        xong++;
      }
    }));
  } finally {
    clearInterval(dongHoCho);
  }
  return ketQua.sort((a, b) => a.start - b.start);
}

// Gemini nghe trước; Gemini hết lượt/lỗi thì chuyển lần lượt sang Groq → Cloudflare → Azure → OpenRouter
let geminiNghi = false; // Gemini đã hỏng trong lần chạy này → các đoạn sau đi thẳng dự phòng
async function ngheMotDoan(mau, batDau) {
  const dai = mau.length / TAN_SO_NGHE;
  const wav = taoWav(mau, TAN_SO_NGHE);
  const duLieu = await sangBase64(wav);
  // Chọn dịch bằng DeepSeek: Groq/Cloudflare nghe → DeepSeek dịch; hỏng hết thì quay về Gemini
  if (dungDeepSeek() && !deepSeekNghi) {
    try {
      return await ngheDuPhong(wav, duLieu, dai, batDau, mau);
    } catch (loi) {
      if (!caiDat.khoa) throw loi;
      deepSeekNghi = true;
      nhat(`↪️ Nghe/dịch bằng DeepSeek không được (${loi.message.split("\n")[0]}) → quay về Gemini`);
    }
  }
  if (caiDat.khoa && !geminiNghi) {
    try {
      return await ngheGemini(duLieu, dai, batDau);
    } catch (loi) {
      if (!duPhong.coDuPhong()) throw loi;
      geminiNghi = true;
      nhat(`↪️ Gemini không dùng được (${loiDeHieu(loi).split("\n")[0]}) → chuyển sang dịch vụ dự phòng`);
    }
  }
  return ngheDuPhong(wav, duLieu, dai, batDau, mau);
}

const dungDeepSeek = () => caiDat.dichBang === "deepseek" && !!caiDat.dp.ds && duPhong.coDuPhong();
let deepSeekNghi = false; // DeepSeek (hoặc bước nghe) hỏng trong lần chạy này → các đoạn sau dùng Gemini

async function ngheDuPhong(wav, duLieu, dai, batDau, mau) {
  nhat(`Gửi đoạn ${dongHo(batDau)}–${dongHo(batDau + dai)} cho dịch vụ ${dungDeepSeek() && !deepSeekNghi ? "nghe + DeepSeek dịch" : "dự phòng"}`);
  const cau = await duPhong.ngheVaDich(wav, duLieu);
  if (mau) await ngheBu(mau, cau, batDau);
  const thieu = cau.filter((c) => !c.vi).length;
  if (thieu) nhat(`⚠️ ${thieu} câu chưa dịch được – vẫn giữ trong bảng lời thoại để bạn tự điền`);
  const ra = cau
    .filter((c) => c.vi || c.zh)
    .map((c) => {
      const s = Math.max(0, Math.min(c.start, dai)), e = Math.min(Math.max(c.end, s + 0.5), dai);
      return { start: +(batDau + s).toFixed(2), end: +(batDau + e).toFixed(2), zh: c.zh, vi: c.vi };
    });
  nhat(`Đoạn ${dongHo(batDau)}: được ${ra.length} câu (${dungDeepSeek() && !deepSeekNghi ? "DeepSeek" : "dự phòng"})`);
  return ra;
}

// NGHE BÙ: bộ nghe (Whisper) hay "nhảy cóc" khi người nói nhanh, liền mạch trên nền nhạc.
// Tìm chỗ có tiếng to cỡ lời nói mà chưa có câu nào → gửi riêng chỗ đó nghe + dịch lại, rồi ghép vào.
async function ngheBu(mau, cau, batDau) {
  const buoc = Math.round(TAN_SO_NGHE / 4); // ô 0,25 giây
  const soO = Math.floor(mau.length / buoc);
  if (soO < 8) return;
  const nl = new Float32Array(soO);
  for (let o = 0; o < soO; o++) {
    let e = 0;
    for (let k = o * buoc; k < (o + 1) * buoc; k += 2) e += mau[k] * mau[k];
    nl[o] = Math.sqrt(e / (buoc / 2));
  }
  const coCau = new Uint8Array(soO);
  for (const c of cau) for (let o = Math.max(0, Math.floor(c.start * 4) - 1); o <= Math.min(soO - 1, Math.ceil(c.end * 4)); o++) coCau[o] = 1;
  // mức to của lời nói = trung vị các ô đã có câu
  const noi = [...nl].filter((_, o) => coCau[o]).sort((a, b) => a - b);
  const mucNoi = noi.length ? noi[Math.floor(noi.length / 2)] : 0;
  if (!mucNoi) return;
  const khoang = [];
  for (let o = 0; o < soO; ) {
    if (coCau[o] || nl[o] < mucNoi * 0.5) { o++; continue; }
    let h = o;
    while (h < soO && !coCau[h] && nl[h] >= mucNoi * 0.35) h++;
    if (h - o >= 6) khoang.push([o / 4, h / 4]); // ít nhất 1,5 giây có tiếng mà chưa có câu
    o = h;
  }
  if (!khoang.length) return;
  const chon = khoang.sort((a, b) => b[1] - b[0] - (a[1] - a[0])).slice(0, 6);
  nhat(`🔎 Đoạn ${dongHo(batDau)}: thấy ${chon.length} chỗ có tiếng nói chưa được nghe (${chon.map(([a, b]) => `${dongHo(batDau + a)}–${dongHo(batDau + b)}`).join(", ")}) → nghe bù`);
  let them = 0;
  for (const [a, b] of chon) {
    const tu = Math.max(0, a - 0.4), den = Math.min(mau.length / TAN_SO_NGHE, b + 0.4);
    const doan = mau.subarray(Math.round(tu * TAN_SO_NGHE), Math.round(den * TAN_SO_NGHE));
    try {
      const w = taoWav(doan, TAN_SO_NGHE);
      const moi = await duPhong.ngheVaDich(w, await sangBase64(w));
      for (const c of moi) {
        const s = tu + c.start, e = tu + c.end;
        if (cau.some((x) => s < x.end - 0.2 && e > x.start + 0.2)) continue; // trùng câu đã có
        cau.push({ ...c, start: s, end: e });
        them++;
      }
    } catch (loi) {
      nhat("Nghe bù không được: " + loi.message.split("\n")[0]);
    }
  }
  cau.sort((x, y) => x.start - y.start);
  if (them) nhat(`🔎 Nghe bù thêm được ${them} câu`);
}

async function ngheGemini(duLieu, dai, batDau) {
  nhat(`Gửi đoạn ${dongHo(batDau)}–${dongHo(batDau + dai)} (${(duLieu.length / 1048576).toFixed(1)}MB) cho Gemini nghe`);
  const tl = await goiGemini("nghe", {
    contents: [{
      parts: [
        { inlineData: { mimeType: "audio/wav", data: duLieu } },
        { text: loiNhacDich(dai) },
      ],
    }],
    generationConfig: {
      temperature: 0.3,
      responseMimeType: "application/json",
      responseSchema: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            start: { type: "NUMBER" },
            end: { type: "NUMBER" },
            zh: { type: "STRING" },
            vi: { type: "STRING" },
          },
          required: ["start", "end", "zh", "vi"],
        },
      },
    },
  });
  let ds;
  try { ds = JSON.parse(layChu(tl)); } catch { throw new Error("Gemini trả lời không đúng dạng, bấm Bắt đầu để thử lại."); }
  const ra = [];
  for (const c of Array.isArray(ds) ? ds : []) {
    let s = Number(c.start), e = Number(c.end);
    if (!isFinite(s) || !String(c.vi || "").trim()) continue;
    s = Math.max(0, Math.min(s, dai));
    if (!isFinite(e) || e <= s) e = s + 2;
    e = Math.min(e, dai);
    ra.push({ start: +(batDau + s).toFixed(2), end: +(batDau + e).toFixed(2), zh: String(c.zh || ""), vi: String(c.vi).trim() });
  }
  nhat(`Đoạn ${dongHo(batDau)}: được ${ra.length} câu`);
  return ra;
}

function loiNhacDich(dai) {
  return `Đây là ${dai.toFixed(1)} giây âm thanh lấy từ một video tiếng Trung.
Hãy nghe kỹ TOÀN BỘ phần LỜI NÓI từ đầu đến cuối (bỏ qua nhạc nền, tiếng động) và chia thành từng câu ngắn, mỗi câu tối đa khoảng 8 giây.
KHÔNG được bỏ sót câu nào – kể cả câu nói nhỏ, nói nhanh, nói chen, lời thuyết minh trên nền nhạc, lời ở đầu và cuối đoạn.
Với mỗi câu trả về:
- start, end: thời điểm bắt đầu và kết thúc, tính bằng GIÂY (số thập phân) kể từ đầu đoạn âm thanh này, thật chính xác.
- zh: lời gốc tiếng Trung (chữ Hán).
- vi: bản dịch tiếng Việt tự nhiên như người Việt nói, xưng hô hợp ngữ cảnh. Dịch ĐẦY ĐỦ Ý: không bỏ chi tiết, số liệu, tên gọi, nguyên liệu, bước làm, mẹo, cảm xúc. Diễn đạt gọn để đọc vừa thời lượng câu (khoảng 4–5 âm tiết mỗi giây) – chỉ rút gọn CÁCH NÓI, không bỏ Ý. Không thêm chú thích.
  Viết sao cho máy đọc tiếng Việt đọc đúng: số viết bằng chữ (vd "hai trăm năm mươi gam"), không dùng ký hiệu (%, +, &, /, ~, #), không để chữ Trung hay chữ viết tắt tiếng Anh; tên riêng/thương hiệu nước ngoài thì dịch nghĩa hoặc viết theo cách đọc tiếng Việt (vd "DIY" → "tự làm").
Nếu không có lời nói thì trả về mảng rỗng [].`;
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
function chuanHoaDoc(chu) {
  return String(chu)
    .replace(/[\u3400-\u9fff]+/g, " ") // chữ Trung còn sót
    .replace(/(\d)[.,](\d{3})(?!\d)/g, "$1$2") // 1.500 / 1,500 → 1500
    .replace(/(\d+)[.,](\d+)/g, (_, a, b) => `${docSo(a)} phẩy ${docSo(b)}`)
    .replace(/(\d+)\s*%/g, (_, a) => `${docSo(a)} phần trăm`)
    .replace(/(\d+)\s*[kK]\b/g, (_, a) => `${docSo(a)} nghìn`)
    .replace(/(\d+)\s*(kg|g|ml|l|cm|mm|m|km)\b/gi, (_, a, d) => `${docSo(a)} ${{ kg: "ki lô gam", g: "gam", ml: "mi li lít", l: "lít", cm: "xen ti mét", mm: "mi li mét", m: "mét", km: "ki lô mét" }[d.toLowerCase()]}`)
    .replace(/\d+/g, (a) => docSo(a))
    .replace(/&/g, " và ").replace(/\+/g, " cộng ").replace(/[#~*_|<>\[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// =====================================================
// ĐỌC TIẾNG VIỆT: ElevenLabs → Viettel AI → Gemini → Fish Audio → Azure → (Google Cloud) → Edge → giọng máy
// =====================================================
const DICH_VU = {
  el: { ten: "ElevenLabs", mienPhi: 10000, taiGiong: layGiongEl, doc: docEleven, cungLuc: 2 },
  gemini: { ten: "Gemini", doc: docGemini, cungLuc: 3 },
  fish: { ten: "Fish Audio", taiGiong: layGiongFish, doc: docFish, cungLuc: 2 },
  az: { ten: "Azure", mienPhi: 500000, taiGiong: layGiongAz, doc: docAzure, cungLuc: 3 },
  gc: { ten: "Google Cloud", mienPhi: 1000000, taiGiong: layGiongGc, doc: docGoogleCloud, cungLuc: 4 },
  edge: { ten: "Edge", doc: docEdge, cungLuc: 2 },
  fpt: { ten: "FPT.AI", doc: docFpt, cungLuc: 4 },
  vt: { ten: "Viettel AI", doc: docViettel, cungLuc: 3 },
  may: { ten: "Giọng máy", doc: docMay, cungLuc: 1 },
};
// Tên giọng đang chọn của 1 dịch vụ (để ghi nhật ký)
function tenGiong(dv) {
  if (dv === "gemini") return caiDat.giong;
  if (dv === "may") return "";
  if (dv === "fpt") return GIONG_FPT[caiDat.dv.fpt.giong] || caiDat.dv.fpt.giong;
  if (dv === "vt") return $("o-giong-vt")?.querySelector(`option[value="${caiDat.dv.vt.giong}"]`)?.textContent || caiDat.dv.vt.giong;
  const c = caiDat.dv[dv];
  return (c.ds?.find((g) => g.ten === c.giong)?.nhan || c.giong || "").replace(/^🇻🇳 |^🌐 /, "");
}

// ----- Giọng máy: đọc ngay trên điện thoại (doc-may.js), miễn phí, không giới hạn -----
let thoDocMay = null, soYeuCauMay = 0;
const choDocMay = new Map();
function docMay(chu) {
  if (!thoDocMay) {
    thoDocMay = new Worker(new URL("./doc-may.js", import.meta.url));
    thoDocMay.onmessage = ({ data: d }) => {
      if (d.loai === "nhat") { nhat("Giọng máy: " + d.chu); ghiChu("long", "Giọng máy: " + d.chu); return; }
      const cho = choDocMay.get(d.id);
      if (!cho) return;
      choDocMay.delete(d.id);
      if (d.loi) cho.hong(new Error("Giọng máy bị lỗi: " + d.loi));
      else cho.xong({ pcm: d.pcm, tanSo: d.tanSo });
    };
    thoDocMay.onerror = (e) => {
      for (const c of choDocMay.values()) c.hong(new Error("Giọng máy bị lỗi: " + (e.message || "không tải được")));
      choDocMay.clear();
      thoDocMay = null;
    };
  }
  return new Promise((xong, hong) => {
    const id = ++soYeuCauMay;
    choDocMay.set(id, { xong, hong });
    thoDocMay.postMessage({ id, chu });
  });
}

// Dịch vụ đọc hết lượt tháng này (ElevenLabs…) → nhớ lại, lần sau bỏ qua luôn
function dvHetThang(dv) {
  const d = docLuu("phaha-dv-het-thang");
  return d[dv] === thangNay();
}
function ghiDvHetThang(dv) {
  const d = docLuu("phaha-dv-het-thang");
  d[dv] = thangNay();
  try { localStorage.setItem("phaha-dv-het-thang", JSON.stringify(d)); } catch {}
}

async function docCau(chu, dv) {
  chu = chuanHoaDoc(chu);
  if (!chu) return new Float32Array(0);
  const c = caiDat.dv[dv] || {};
  const khoa = [dv, dv === "gemini" ? caiDat.giong : dv === "gc" ? giongGcLanNay || c.giong : c.giong || "", dv === "el" ? c.mh : "", chu].join("|");
  if (khoGiong.has(khoa)) return khoGiong.get(khoa);
  const kq = await DICH_VU[dv].doc(chu);
  let mau = kq.mau || Float32Array.from(kq.pcm, (v) => v / 32768);
  if (kq.tanSo !== TAN_SO_DOC) mau = doiTanSo(mau, kq.tanSo, TAN_SO_DOC);
  mau = lamGon(mau);
  khoGiong.set(khoa, mau);
  return mau;
}

async function docGemini(chu, lan = 0) {
  const tl = await goiGemini("doc", {
    contents: [{ parts: [{ text: `Đọc bằng tiếng Việt, giọng tự nhiên, tốc độ hơi nhanh: ${chu}` }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: caiDat.giong } } },
    },
  });
  const phan = tl.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!phan) {
    // Gemini thỉnh thoảng trả lời mà không kèm tiếng (lỗi ngẫu nhiên) → gửi lại câu đó
    if (lan < 2) { nhat(`Gemini đọc thiếu tiếng (${tl.candidates?.[0]?.finishReason || "?"}) → gửi lại câu này`); return docGemini(chu, lan + 1); }
    throw new Error("Gemini không trả về giọng đọc. Thử lại sau ít phút.");
  }
  const byte = tuBase64(phan.inlineData.data);
  return {
    pcm: new Int16Array(byte.buffer, 0, byte.length >> 1),
    tanSo: Number(/rate=(\d+)/.exec(phan.inlineData.mimeType || "")?.[1]) || TAN_SO_DOC,
  };
}

// Gọi dịch vụ đọc: tự thử lại khi mạng chập chờn hoặc bị giới hạn lượt/phút
async function goiDocGiong(dv, diaChi, tuyChon, kieu = "json") {
  let lanDongThoi = 0;
  for (let lan = 0; ; lan++) {
    let r;
    const bd = Date.now();
    try {
      r = await fetch(diaChi, tuyChon);
    } catch (loiMang) {
      nhat(`⚠️ ${DICH_VU[dv].ten}: lỗi mạng (${loiMang?.message || loiMang})`);
      if (lan < 3) { await cho(3); continue; }
      const e = new Error(`Không gọi được ${DICH_VU[dv].ten}. Kiểm tra mạng` + (dv === "az" ? " và tên Vùng." : "."));
      e.dv = dv;
      throw e;
    }
    if (r.ok) {
      if (Date.now() - bd > 8000) nhat(`🐢 ${DICH_VU[dv].ten} trả lời chậm: ${((Date.now() - bd) / 1000).toFixed(1)} giây`);
      return kieu === "json" ? r.json() : new Uint8Array(await r.arrayBuffer());
    }
    const chu = await r.text().catch(() => "");
    nhat(`⚠️ ${DICH_VU[dv].ten}: mã ${r.status} · ${chu.slice(0, 150)}`);
    let j = {};
    try { j = JSON.parse(chu); } catch {}
    const thongBao = j.error?.message || j.detail?.message || (typeof j.detail === "string" ? j.detail : "") || chu.slice(0, 200) || r.statusText;
    const hetLuot = j.detail?.status === "quota_exceeded" || j.detail?.code === "quota_exceeded" || /quota/i.test(thongBao) && dv === "el"
      || r.status === 402 || (dv === "fish" && /credit|balance|quota|limit exceeded/i.test(thongBao));
    // Gửi quá nhiều câu cùng lúc → chờ chút rồi gửi lại (không tính là lỗi)
    if (r.status === 429 && /concurrent/i.test(chu) && lanDongThoi++ < 40) {
      await new Promise((x) => setTimeout(x, 1000 + Math.random() * 2000));
      lan--;
      continue;
    }
    if (!hetLuot && (r.status === 429 || r.status >= 500) && lan < (dv === "edge" && r.status !== 429 ? 1 : 5)) { await cho(5 * (lan + 1), "long"); continue; }
    const e = new Error(thongBao);
    Object.assign(e, { status: r.status, dv, hetLuot });
    throw e;
  }
}

// ----- Google Cloud Text-to-Speech -----
const GC_API = "https://texttospeech.googleapis.com/v1";
const goiGc = (duong, noiDung) =>
  goiDocGiong("gc", GC_API + duong, {
    method: noiDung ? "POST" : "GET",
    headers: { "Content-Type": "application/json", "x-goog-api-key": caiDat.dv.gc.khoa || caiDat.khoa },
    body: noiDung ? JSON.stringify(noiDung) : undefined,
  });

// Danh sách giọng tiếng Việt, giọng tự nhiên (Chirp3-HD, Neural2, Wavenet) lên đầu
async function layGiongGc() {
  const j = await goiGc("/voices?languageCode=vi-VN");
  const hang = (t) => (/Chirp3-HD/.test(t) ? 0 : /Neural2/.test(t) ? 1 : /Wavenet/.test(t) ? 2 : /Standard/.test(t) ? 4 : 3);
  const loai = (t) => (/Chirp3-HD/.test(t) ? "Tự nhiên nhất" : /Neural2/.test(t) ? "Tự nhiên" : /Wavenet/.test(t) ? "Tốt, rẻ" : /Standard/.test(t) ? "Cơ bản" : "Khác");
  return (j.voices || [])
    .filter((g) => g.languageCodes?.includes("vi-VN"))
    .sort((a, b) => hang(a.name) - hang(b.name) || a.name.localeCompare(b.name))
    .map((g) => ({
      ten: g.name,
      nhan: `${loai(g.name)} · ${g.ssmlGender === "MALE" ? "Nam" : g.ssmlGender === "FEMALE" ? "Nữ" : ""} · ${g.name.replace("vi-VN-", "")}`,
    }));
}

// Google miễn phí theo từng loại giọng mỗi tháng: Chirp3-HD 1 triệu, Neural2 1 triệu, WaveNet 4 triệu, Standard 4 triệu ký tự
const LOAI_GC = { hd: { ten: "Chirp 3 HD", mienPhi: 1000000 }, n2: { ten: "Neural2", mienPhi: 1000000 }, wn: { ten: "WaveNet", mienPhi: 4000000 }, st: { ten: "Standard", mienPhi: 4000000 } };
const loaiGc = (ten) => (/Chirp/.test(ten) ? "hd" : /Neural2/.test(ten) ? "n2" : /Wavenet/i.test(ten) ? "wn" : "st");
let giongGcLanNay = null; // giọng Google dùng cho cả video đang làm

// Chọn giọng Google cho cả video: loại đang chọn sắp hết mức miễn phí tháng này
// thì đổi sang loại khác còn lượt (ưu tiên cùng giới tính), để vẫn miễn phí
function chonGiongGc(soKyTu) {
  const chon = caiDat.dv.gc.giong;
  const conLuot = (ten) => kyTuThang("gc-" + loaiGc(ten)) + soKyTu <= LOAI_GC[loaiGc(ten)].mienPhi * 0.97;
  if (conLuot(chon)) return chon;
  const ds = caiDat.dv.gc.ds || [];
  const gioi = (ten) => (/· Nam ·/.test(ds.find((g) => g.ten === ten)?.nhan || "") ? "nam" : "nu");
  const thuTu = ["hd", "n2", "wn", "st"];
  const thay = ds
    .filter((g) => g.ten !== chon && conLuot(g.ten))
    .sort((a, b) => (gioi(b.ten) === gioi(chon)) - (gioi(a.ten) === gioi(chon)) || thuTu.indexOf(loaiGc(a.ten)) - thuTu.indexOf(loaiGc(b.ten)))[0];
  if (thay) {
    nhat(`Giọng ${LOAI_GC[loaiGc(chon)].ten} sắp hết mức miễn phí tháng này → video này đọc bằng ${thay.ten.replace("vi-VN-", "")} (${LOAI_GC[loaiGc(thay.ten)].ten}, vẫn miễn phí)`);
    return thay.ten;
  }
  nhat("⚠️ Mọi giọng Google đã quá mức miễn phí tháng này (đếm trên máy này) – Google sẽ tính tiền rất ít (~100.000đ/1 triệu ký tự với WaveNet)");
  return chon;
}

async function docGoogleCloud(chu) {
  const giong = giongGcLanNay || caiDat.dv.gc.giong;
  const j = await goiGc("/text:synthesize", {
    input: { text: chu },
    voice: { languageCode: "vi-VN", name: giong },
    audioConfig: { audioEncoding: "LINEAR16", sampleRateHertz: TAN_SO_DOC },
  });
  congKyTu("gc", chu.length);
  congKyTu("gc-" + loaiGc(giong), chu.length);
  return docWav(tuBase64(j.audioContent));
}

// ----- Microsoft Azure Speech -----
const azApi = (duong) => `https://${caiDat.dv.az.vung}.tts.speech.microsoft.com/cognitiveservices${duong}`;

async function layGiongAz() {
  const ds = await goiDocGiong("az", azApi("/voices/list"), {
    headers: { "Ocp-Apim-Subscription-Key": caiDat.dv.az.khoa },
  });
  // Giọng Việt + giọng "đa ngôn ngữ" đọc được tiếng Việt (nghe tự nhiên, có cảm xúc hơn)
  const viet = (g) => g.Locale === "vi-VN";
  const daNgu = (g) => !viet(g) && (g.SecondaryLocaleList || []).includes("vi-VN");
  const hang = (g) => (viet(g) ? 0 : /HD|Dragon/.test(g.ShortName) ? 2 : 1);
  return (ds || [])
    .filter((g) => viet(g) || daNgu(g))
    .sort((a, b) => hang(a) - hang(b) || a.ShortName.localeCompare(b.ShortName))
    .map((g) => ({
      ten: g.ShortName,
      nhan: `${viet(g) ? "🇻🇳 " : "🌐 "}${g.Gender === "Male" ? "Nam" : "Nữ"} · ${viet(g) ? g.LocalName || g.DisplayName : g.DisplayName + " (đa ngôn ngữ)"}`,
    }));
}
const ssmlViet = (giong, chu) => {
  const anToan = chu.replace(/[<>&'"]/g, (k) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[k]);
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="vi-VN"><voice name="${giong}">${
    giong.startsWith("vi-VN-") ? anToan : `<lang xml:lang="vi-VN">${anToan}</lang>`}</voice></speak>`;
};

async function docAzure(chu) {
  const byte = await goiDocGiong("az", azApi("/v1"), {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": caiDat.dv.az.khoa,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "riff-24khz-16bit-mono-pcm",
    },
    body: ssmlViet(caiDat.dv.az.giong, chu),
  }, "byte");
  congKyTu("az", chu.length);
  return docWav(byte);
}

// ----- ElevenLabs -----
const EL_API = "https://api.elevenlabs.io/v1";

const gioiTinh = (g) => (/^m/i.test(g || "") ? " · Nam" : /^f/i.test(g || "") ? " · Nữ" : "");
async function layGiongEl() {
  const dau = { headers: { "xi-api-key": caiDat.dv.el.khoa } };
  // Giọng trong tài khoản + giọng Việt được dùng nhiều nhất trong thư viện ElevenLabs
  const [j, tv] = await Promise.all([
    goiDocGiong("el", EL_API + "/voices", dau),
    goiDocGiong("el", EL_API + "/shared-voices?page_size=30&language=vi&sort=usage_character_count_1y", dau).catch((loi) => {
      nhat("Không tải được thư viện giọng ElevenLabs: " + loi.message);
      return {};
    }),
  ]);
  const laViet = (g) => /^vi|vietnam/i.test(g.labels?.language || "") || /vietnam/i.test(g.labels?.accent || "");
  const cuaToi = (j.voices || [])
    .sort((a, b) => laViet(b) - laViet(a) || a.name.localeCompare(b.name))
    .map((g) => ({ ten: g.voice_id, nhan: `${laViet(g) ? "🇻🇳 " : ""}${g.name}${gioiTinh(g.labels?.gender)}` }));
  const daCo = new Set(cuaToi.map((g) => g.ten));
  const thuVien = (tv.voices || [])
    .filter((g) => !daCo.has(g.voice_id))
    .map((g) => ({ ten: `tv:${g.public_owner_id}:${g.voice_id}`, nhan: `🇻🇳 Thư viện · ${g.name}${gioiTinh(g.gender)}` }));
  // Giọng Việt trong tài khoản lên đầu, rồi đến giọng thư viện hay nhất, cuối cùng giọng khác
  return [...cuaToi.filter((g) => g.nhan.startsWith("🇻🇳")), ...thuVien, ...cuaToi.filter((g) => !g.nhan.startsWith("🇻🇳"))];
}

// Giọng thư viện phải được thêm vào tài khoản trước khi đọc (làm 1 lần)
let dangThemGiongEl = null;
async function giongElDung() {
  const c = caiDat.dv.el;
  if (!c.giong.startsWith("tv:")) return c.giong;
  dangThemGiongEl ||= (async () => {
    const [, chu, id] = c.giong.split(":");
    const ten = (c.ds.find((g) => g.ten === c.giong)?.nhan || "PhaHa").replace(/^🇻🇳 Thư viện · /, "").replace(/ · (Nam|Nữ)$/, "");
    try {
      const j = await goiDocGiong("el", `${EL_API}/voices/add/${chu}/${id}`, {
        method: "POST",
        headers: { "xi-api-key": c.khoa, "Content-Type": "application/json" },
        body: JSON.stringify({ new_name: ten }),
      });
      const moi = j.voice_id || id;
      nhat(`Đã thêm giọng "${ten}" từ thư viện vào tài khoản ElevenLabs`);
      c.ds = c.ds.map((g) => (g.ten === c.giong ? { ten: moi, nhan: g.nhan.replace("Thư viện · ", "") } : g));
      c.giong = moi;
      luuCaiDat();
      return moi;
    } catch (loi) {
      // Không thêm được (hết chỗ lưu giọng…) → thử đọc thẳng bằng mã giọng thư viện
      nhat("Không thêm được giọng thư viện ElevenLabs (" + loi.message + ") → thử đọc thẳng");
      return id;
    } finally {
      dangThemGiongEl = null;
    }
  })();
  return dangThemGiongEl;
}

async function docEleven(chu) {
  const c = caiDat.dv.el;
  const giong = await giongElDung();
  const noiDung = { text: chu, model_id: c.mh };
  if (c.mh !== "eleven_v3") noiDung.language_code = "vi";
  const byte = await goiDocGiong("el", `${EL_API}/text-to-speech/${giong}?output_format=pcm_24000`, {
    method: "POST",
    headers: { "xi-api-key": c.khoa, "Content-Type": "application/json" },
    body: JSON.stringify(noiDung),
  }, "byte");
  congKyTu("el", Math.ceil(chu.length * (c.mh === "eleven_v3" ? 1 : 0.5)));
  const ban = byte.slice(0, byte.length & ~1);
  return { pcm: new Int16Array(ban.buffer), tanSo: 24000 };
}

// ----- Fish Audio (S2.1 Pro Free, miễn phí) – đi qua máy chủ PHAHA vì Fish chặn gọi thẳng từ trình duyệt -----
const FISH_API = "https://api.fish.audio";
const veDangNhap = () => { try { return localStorage.getItem("ve-dang-nhap") || ""; } catch { return ""; } };
const quaMayChu = (url, tuyChon = {}) => [DIA_CHI_MAY_CHU + "/ai/chuyen", { ...tuyChon, headers: { ...tuyChon.headers, "X-Dich-Den": url, "X-Ve": veDangNhap() } }];

async function layGiongFish() {
  const lay = (sapXep) => goiDocGiong("fish", ...quaMayChu(`${FISH_API}/model?page_size=40&language=vi&sort_by=${sapXep}`, {
    headers: { Authorization: "Bearer " + caiDat.dv.fish.khoa },
  }));
  // Giọng Việt được dùng nhiều nhất + được thích nhiều nhất
  const [a, b] = await Promise.all([lay("task_count"), lay("score").catch(() => ({}))]);
  const daCo = new Set(), ds = [];
  for (const g of [...(a.items || []), ...(b.items || [])]) {
    if (daCo.has(g._id) || (g.languages?.length && !g.languages.includes("vi"))) continue;
    daCo.add(g._id);
    ds.push({ ten: g._id, nhan: `${g.title}${g.task_count ? ` · ${g.task_count.toLocaleString("vi-VN")} lượt dùng` : ""}`, dung: g.task_count || 0 });
  }
  return ds.sort((x, y) => y.dung - x.dung).map(({ ten, nhan }) => ({ ten, nhan }));
}

async function docFish(chu) {
  const byte = await goiDocGiong("fish", ...quaMayChu(`${FISH_API}/v1/tts`, {
    method: "POST",
    headers: { Authorization: "Bearer " + caiDat.dv.fish.khoa, "Content-Type": "application/json", model: "s2.1-pro-free" },
    body: JSON.stringify({ text: chu, reference_id: caiDat.dv.fish.giong, format: "wav", sample_rate: TAN_SO_DOC, normalize: true, latency: "normal" }),
  }), "byte");
  return docWav(byte);
}

// ----- Viettel AI: giọng đọc tiếng Việt của Viettel (trả về MP3 ngay) -----
// Trình duyệt bị chặn gọi thẳng thì tự đi vòng qua máy chủ PHAHA.
const VT_API = "https://viettelai.vn/tts/speech_synthesis";
async function docViettel(chu) {
  const c = caiDat.dv.vt;
  for (let lan = 0; ; lan++) {
    const r = await duPhong.goi(VT_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", accept: "*/*" },
      body: JSON.stringify({ text: chu, voice: c.giong, speed: 1, tts_return_option: 3, token: c.khoa, without_filter: false }),
    }, "Viettel AI");
    const kieu = r.headers.get("content-type") || "";
    if (r.ok && !/json|text\/html/i.test(kieu)) {
      const b = new Uint8Array(await r.arrayBuffer());
      if (b.length > 500) { congKyTu("vt", chu.length); return { mau: await giaiMp3(b), tanSo: TAN_SO_DOC }; }
    }
    const t = await r.text().catch(() => "");
    let j = {};
    try { j = JSON.parse(t); } catch {}
    const tb = String(j.message || j.msg || j.error || j.detail || t || r.statusText).slice(0, 200);
    nhat(`⚠️ Viettel AI: mã ${r.status} · ${tb}`);
    if ((r.status === 429 || r.status >= 500) && lan < 3) { await cho(3 * (lan + 1), "long"); continue; }
    throw Object.assign(new Error(tb || "Viettel AI không trả về giọng đọc"), {
      status: r.status, dv: "vt",
      hetLuot: r.status === 402 || /quota|limit|exceed|balance|credit|hết|vượt|không đủ/i.test(tb),
    });
  }
}

// ----- FPT.AI: giọng đọc tiếng Việt của FPT -----
// Gửi chữ → FPT trả về 1 địa chỉ file MP3, vài giây sau file mới có → chờ rồi tải về.
// Trình duyệt bị chặn gọi thẳng thì tự đi vòng qua máy chủ PHAHA.
const FPT_API = "https://api.fpt.ai/hmi/tts/v5";
const GIONG_FPT = { banmai: "Ban Mai", thuminh: "Thu Minh", leminh: "Lê Minh", myan: "Mỹ An", ngoclam: "Ngọc Lam", giahuy: "Gia Huy", lannhi: "Lan Nhi", linhsan: "Linh San", minhquang: "Minh Quang" };
async function docFpt(chu) {
  const c = caiDat.dv.fpt;
  if (chu.length < 3) chu = chu.padEnd(3, "."); // FPT cần ít nhất 3 ký tự
  let j = {};
  for (let lan = 0; ; lan++) {
    const r = await duPhong.goi(FPT_API, {
      method: "POST",
      headers: { "api-key": c.khoa, voice: c.giong, speed: "0", "Content-Type": "text/plain; charset=utf-8" },
      body: chu,
    }, "FPT.AI");
    const t = await r.text().catch(() => "");
    try { j = JSON.parse(t); } catch { j = { message: t }; }
    if (r.ok && j.async && !j.error) break;
    const tb = String(j.message || j.msg || j.error || t || r.statusText).slice(0, 200);
    nhat(`⚠️ FPT.AI: mã ${r.status} · ${tb}`);
    if ((r.status === 429 || r.status >= 500) && lan < 4) { await cho(3 * (lan + 1), "long"); continue; }
    throw Object.assign(new Error(tb), { status: r.status, dv: "fpt", hetLuot: r.status === 402 || /quota|limit|exceed|balance|credit|hết/i.test(tb) });
  }
  const bd = Date.now();
  for (let lan = 0; Date.now() - bd < 120000; lan++) {
    await new Promise((x) => setTimeout(x, lan ? 1500 : 1200));
    try {
      const r = await duPhong.goi(j.async, {}, "FPT.AI");
      if (r.ok) {
        const b = new Uint8Array(await r.arrayBuffer());
        if (b.length > 500) return { mau: await giaiMp3(b), tanSo: TAN_SO_DOC };
      }
    } catch {}
  }
  throw Object.assign(new Error("FPT.AI tạo giọng quá lâu (hơn 2 phút)"), { dv: "fpt" });
}

// ----- Microsoft Edge "Đọc to" (miễn phí, không cần mã) – máy chủ PHAHA đọc hộ, trả về MP3 -----
async function docEdge(chu) {
  const byte = await goiDocGiong("edge", DIA_CHI_MAY_CHU + "/ai/edge", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Ve": veDangNhap() },
    body: JSON.stringify({ text: chu, voice: caiDat.dv.edge.giong }),
  }, "byte");
  return { mau: await giaiMp3(byte), tanSo: TAN_SO_DOC };
}

// Giải nén MP3 thành âm thanh 24.000 mẫu/giây bằng bộ giải mã có sẵn của trình duyệt
async function giaiMp3(byte) {
  const ctx = new OfflineAudioContext(1, 1, TAN_SO_DOC);
  const b = await ctx.decodeAudioData(byte.buffer.slice(byte.byteOffset, byte.byteOffset + byte.byteLength));
  if (b.numberOfChannels === 1) return b.getChannelData(0);
  const ra = new Float32Array(b.length);
  for (let k = 0; k < b.numberOfChannels; k++) b.getChannelData(k).forEach((v, i) => (ra[i] += v / b.numberOfChannels));
  return ra;
}

// Lấy phần âm thanh trong file WAV
function docWav(byte) {
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

function tuBase64(chu) {
  return Uint8Array.from(atob(chu), (k) => k.charCodeAt(0));
}

// Gemini: gộp các câu sát nhau (tối đa ~20 giây) vào 1 lần đọc để đỡ tốn lượt.
// Các dịch vụ khác tính theo số chữ nên đọc từng câu cho khớp miệng.
function chiaNhom(cau, dv) {
  if (dv !== "gemini") return cau.map((c) => ({ start: c.start, end: c.end, vi: c.vi.trim() }));
  const nhom = [];
  for (const c of cau) {
    const cuoi = nhom[nhom.length - 1];
    if (cuoi && c.start - cuoi.end < 0.8 && c.end - cuoi.start <= 20) {
      cuoi.end = Math.max(cuoi.end, c.end);
      cuoi.vi += " " + c.vi.trim();
    } else {
      nhom.push({ start: c.start, end: c.end, vi: c.vi.trim() });
    }
  }
  return nhom;
}

// Dịch vụ đọc dùng được, theo đúng thứ tự ưu tiên; giọng máy luôn có, đứng cuối làm lớp dự phòng
function dvDocDung(imLang) {
  const vao = coMayChu() && daDangNhap();
  const co = {
    el: () => !!caiDat.dv.el.khoa,
    gemini: () => !!(caiDat.khoa || caiDat.khoaDoc),
    fish: () => !!caiDat.dv.fish.khoa && vao,
    az: () => !!caiDat.dv.az.khoa,
    gc: () => !!(caiDat.dv.gc.giong || caiDat.dv.gc.khoa),
    edge: () => vao,
    fpt: () => !!caiDat.dv.fpt.khoa,
    vt: () => !!caiDat.dv.vt.khoa,
    may: () => true,
  };
  const ds = THU_TU.filter((dv) => (dv === "may" || caiDat.bat[dv]) && co[dv]());
  const conLai = ds.filter((dv) => !dvHetThang(dv));
  if (!imLang && conLai.length < ds.length) nhat(`Bỏ qua ${ds.filter(dvHetThang).map((dv) => DICH_VU[dv].ten).join(", ")} (đã hết lượt tháng này)`);
  return conLai.length ? conLai : ds;
}

// Đọc cả video bằng 1 giọng; giọng đó hết lượt/hỏng thì đọc lại TOÀN BỘ bằng dịch vụ kế tiếp
// (không trộn 2 giọng trong 1 video)
async function longTieng() {
  try {
    return await longTiengThu();
  } finally {
    giongGcLanNay = null;
  }
}

async function longTiengThu() {
  let loiCuoi;
  const ds = dvDocDung();
  for (let i = 0; i < ds.length; i++) {
    const dv = ds[i];
    try {
      if (i > 0) ghiChu("long", `Chuyển sang đọc bằng ${DICH_VU[dv].ten}…`);
      // Có mã nhưng chưa chọn giọng → tự lấy giọng hay nhất làm mặc định
      if (CAC_DV.includes(dv) && !caiDat.dv[dv].giong) {
        await taiDsGiong(dv);
        nhat(`${DICH_VU[dv].ten}: chưa chọn giọng → tự chọn ${tenGiong(dv)}`);
      }
      return await longTiengBang(dv);
    } catch (loi) {
      loiCuoi = loi;
      if (loi.hetLuot && dv === "el") ghiDvHetThang("el");
      if (i < ds.length - 1) nhat(`↪️ Đọc bằng ${DICH_VU[dv].ten} không được (${loiDeHieu(loi).split("\n")[0]}) → đọc lại toàn bộ bằng ${DICH_VU[ds[i + 1]].ten}`);
    }
  }
  throw loiCuoi;
}

async function longTiengBang(dv) {
  const tong = new Float32Array(Math.ceil(thoiLuong * TAN_SO_DOC) + TAN_SO_DOC);
  let xong = 0, hong = false;
  // Bỏ câu rỗng (vd câu chỉ có chữ Trung/ký hiệu, sửa chữ xong thành trống) – dịch vụ đọc sẽ báo lỗi nếu gửi chữ trống
  const cau = chiaNhom(cacCau.filter((c) => chuanHoaDoc(c.vi)), dv);
  const donVi = dv === "gemini" ? "lượt đọc" : "câu";
  giongGcLanNay = dv === "gc" ? chonGiongGc(cau.reduce((n, c) => n + c.vi.length, 0)) : null;
  // Đọc nhiều phần cùng lúc cho nhanh (ElevenLabs/Fish miễn phí chỉ cho 2 cùng lúc)
  const hang = cau.map((c, i) => i);
  const cacGiong = new Array(cau.length);
  const soLuong = DICH_VU[dv].cungLuc;
  if (dv === "may" && (dangTachNhac || dangVeHinh)) {
    ghiChu("long", "Chờ tách nhạc / chèn chữ xong rồi đọc bằng giọng máy (đỡ tràn bộ nhớ)…");
    await dangTachNhac?.catch(() => {});
    await dangVeHinh;
  }
  const bd = Date.now();
  await Promise.all(Array.from({ length: soLuong }, async () => {
    while (hang.length && !hong) {
      const i = hang.shift();
      try {
        cacGiong[i] = await docCau(cau[i].vi, dv);
      } catch (loi) {
        hong = true; // dừng các luồng khác, khỏi gửi thêm yêu cầu thừa
        throw loi;
      }
      ghiChu("long", `${++xong}/${cau.length} ${donVi} (${DICH_VU[dv].ten})`);
    }
  }));
  nhat(`Đã đọc ${cau.length} ${donVi}, ${cau.reduce((n, c) => n + c.vi.length, 0)} ký tự bằng ${DICH_VU[dv].ten}${tenGiong(dv) ? " / " + tenGiong(dv) : ""} · ${((Date.now() - bd) / 1000).toFixed(1)} giây`);
  // Đặt từng câu vào đúng thời điểm. Câu Việt dài hơn chỗ trống thì đọc nhanh hơn (tối đa 1,6 lần);
  // vẫn dài thì câu sau LÙI lại một chút thay vì đè lên nhau (2 giọng chồng nhau nghe như mất chữ).
  // Đang bị trễ so với hình thì cho đọc nhanh hơn nữa (tối đa 1,9 lần) để đuổi kịp.
  let conTro = 0, soTre = 0, treMax = 0;
  cau.forEach((c, i) => {
    let mau = cacGiong[i];
    if (!mau.length) return;
    const batDau = Math.max(c.start, conTro + 0.05);
    const tre = batDau - c.start;
    const sau = cau[i + 1] ? cau[i + 1].start : thoiLuong;
    const choPhep = Math.max(c.end - batDau, sau - batDau - 0.08, 0.3);
    const dai = mau.length / TAN_SO_DOC;
    const nhanhNhat = tre > 1 ? 1.9 : NHANH_TOI_DA;
    if (dai > choPhep * 1.02) mau = coGian(mau, Math.min(dai / choPhep, nhanhNhat));
    const viTri = Math.round(batDau * TAN_SO_DOC);
    for (let k = 0; k < mau.length && viTri + k < tong.length; k++) tong[viTri + k] += mau[k];
    conTro = batDau + mau.length / TAN_SO_DOC;
    if (tre > 0.3) { soTre++; treMax = Math.max(treMax, tre); }
  });
  if (soTre) nhat(`Lời Việt dài hơn lời gốc: ${soTre} câu phải lùi lại cho khỏi đè nhau (trễ nhiều nhất ${treMax.toFixed(1)} giây)`);
  return taoWav(tong, TAN_SO_DOC);
}

// =====================================================
// XUẤT VIDEO: ghép hình (gốc hoặc đã chèn chữ/logo) với tiếng mới
// =====================================================
async function xuatVideo(wav, tt, wavNen, hinh, giamTheoLoi) {
  const tiengLong = "/long-tieng.wav", tepNen = "/nhac-nen.wav";
  const ra = "/ket-qua.mp4";
  await ff.writeFile(tiengLong, wav);
  const thamSo = ["-hide_banner", "-y", "-i", tt.duong, "-i", tiengLong];
  let soVao = 2;
  let chonAm;
  if (wavNen) {
    // gửi bản sao: bộ xử lý video giữ luôn dữ liệu được gửi, bản gốc còn để dùng lại khi bấm "Làm lại"
    await ff.writeFile(tepNen, wavNen.slice());
    thamSo.push("-i", tepNen);
    thamSo.push("-filter_complex", `[${soVao}:a]volume=${caiDat.amNen / 100}[nen];[nen][1:a]amix=inputs=2:duration=first:normalize=0[am]`);
    chonAm = "[am]";
    soVao++;
  } else if (giamTheoLoi) {
    // Không tách được nhạc: lúc có lời thoại thì gần như tắt tiếng gốc, lúc khác giữ nhạc nền
    thamSo.push("-filter_complex", `[0:a:0]volume='${bieuThucGiam()}':eval=frame[nen];[nen][1:a]amix=inputs=2:duration=first:normalize=0[am]`);
    chonAm = "[am]";
  } else if (tt.coTieng && caiDat.amGoc > 0) {
    thamSo.push("-filter_complex", `[0:a:0]volume=${caiDat.amGoc / 100}[goc];[goc][1:a]amix=inputs=2:duration=first:normalize=0[am]`);
    chonAm = "[am]";
  } else {
    chonAm = "1:a";
  }
  // Hình: lấy bản đã chèn phụ đề/logo nếu có, không thì giữ nguyên hình gốc
  let chonHinh = "0:v:0", hevc = tt.hevc;
  if (hinh) {
    await ff.createDir("/hinh").catch(() => {});
    await ff.mount("WORKERFS", { files: [new File([hinh.blob], "hinh.mp4")] }, "/hinh");
    thamSo.push("-i", "/hinh/hinh.mp4");
    chonHinh = `${soVao}:v:0`;
    hevc = hinh.codec === "hevc";
  }
  thamSo.push("-map", chonHinh, "-map", chonAm, "-t", String(thoiLuong), "-c:v", "copy");
  if (hevc) thamSo.push("-tag:v", "hvc1"); // để iPhone phát được video HEVC
  thamSo.push("-c:a", "aac", "-b:a", "160k", ra);
  try {
    const { ma, log } = await lenh(thamSo, "xuat");
    if (ma !== 0) throw new Error("Ghép video bị lỗi.\n" + log.split("\n").slice(-3).join("\n"));
    const du = await ff.readFile(ra);
    return new Blob([du], { type: "video/mp4" });
  } finally {
    await ff.deleteFile(tiengLong).catch(() => {});
    await ff.deleteFile(tepNen).catch(() => {});
    await ff.deleteFile(ra).catch(() => {});
    if (hinh) await ff.unmount("/hinh").catch(() => {});
  }
}

// =====================================================
// TÁCH NHẠC NỀN (AI chạy ngầm trong tach-nhac.js)
// =====================================================
let thoTach = null;
async function tachNhacNen() {
  const ra = "/nen.pcm";
  const { ma } = await lenh(
    ["-hide_banner", "-i", duongDanVideo.duong, "-vn", "-ac", "2", "-ar", "44100", "-f", "s16le", ra],
    "nhac"
  );
  if (ma !== 0) throw new Error("Không lấy được tiếng gốc để tách nhạc.");
  const du = await ff.readFile(ra);
  await ff.deleteFile(ra);
  const i16 = new Int16Array(du.buffer, du.byteOffset, du.byteLength >> 1);
  const n = i16.length >> 1;
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = i16[2 * i] / 32768; R[i] = i16[2 * i + 1] / 32768; }
  // iPhone ít bộ nhớ: tạm tắt bộ xử lý video trong lúc AI chạy, xuất video sẽ bật lại
  tatFfmpeg();
  nhat("Tạm tắt bộ xử lý video để nhường bộ nhớ cho AI tách nhạc");
  thoTach ||= new Worker(new URL("./tach-nhac.js", import.meta.url), { type: "module" });
  nhat(`Tách nhạc: ${dongHo(n / 44100)} âm thanh, kiểu ${caiDat.mhTach}`);
  let mocPhanTram = -1;
  const kq = await new Promise((xong, hong) => {
    thoTach.onmessage = (e) => {
      const d = e.data;
      if (d.loai === "tien-do") {
        ghiChu("nhac", d.chu);
        const pt = Number(/(\d+)%/.exec(d.chu)?.[1]);
        const nac = Math.floor(pt / 25);
        if (!isFinite(pt) || nac !== mocPhanTram) { if (isFinite(pt)) mocPhanTram = nac; nhat("Tách nhạc: " + d.chu); }
      } else if (d.loai === "nhat") {
        nhat("Tách nhạc: " + d.chu);
      } else if (d.loai === "may") {
        ghiChu("nhac", d.may === "webgpu" ? "Đang tách bằng chip đồ hoạ…" : "Đang tách bằng CPU (chậm hơn)…");
        nhat(`Tách nhạc chạy bằng: ${d.may === "webgpu" ? "chip đồ hoạ (WebGPU)" : "CPU (WASM, chậm)"}`);
      }
      else if (d.loai === "xong") xong(d);
      else if (d.loai === "loi") { thoTach?.terminate(); thoTach = null; hong(new Error("Tách nhạc bị lỗi: " + d.chu)); }
    };
    thoTach.onerror = (e) => { thoTach = null; hong(new Error("Tách nhạc bị lỗi: " + (e.message || "không tải được AI"))); };
    thoTach.postMessage({ L, R, loai: caiDat.mhTach }, [L.buffer, R.buffer]);
  });
  // Tách xong thì tắt AI để trả bộ nhớ cho bước dựng hình/xuất video
  thoTach?.terminate();
  thoTach = null;
  return taoWav2(kq.L, kq.R, 44100);
}

// Âm lượng tiếng gốc theo thời gian: gần như tắt trong các câu thoại, bình thường ở chỗ khác
function bieuThucGiam() {
  const doan = [];
  for (const c of cacCau) {
    const a = Math.max(0, c.start - 0.15), b = c.end + 0.15;
    const cuoi = doan[doan.length - 1];
    if (cuoi && a <= cuoi[1] + 0.3) cuoi[1] = Math.max(cuoi[1], b);
    else doan.push([a, b]);
  }
  const cao = (caiDat.amNen / 100).toFixed(2);
  if (!doan.length) return cao;
  const trong = doan.map(([a, b]) => `between(t,${a.toFixed(2)},${b.toFixed(2)})`).join("+");
  return `if(gt(${trong},0),0.03,${cao})`;
}

function taoWav2(L, R, tanSo) {
  const n = L.length;
  const buf = new ArrayBuffer(44 + n * 4);
  const v = new DataView(buf);
  const chu = (o, s) => [...s].forEach((k, i) => v.setUint8(o + i, k.charCodeAt(0)));
  chu(0, "RIFF"); v.setUint32(4, 36 + n * 4, true); chu(8, "WAVE");
  chu(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
  v.setUint32(24, tanSo, true); v.setUint32(28, tanSo * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true);
  chu(36, "data"); v.setUint32(40, n * 4, true);
  const ra = new Int16Array(buf, 44, n * 2);
  for (let i = 0; i < n; i++) {
    ra[2 * i] = Math.max(-1, Math.min(1, L[i])) * 32767;
    ra[2 * i + 1] = Math.max(-1, Math.min(1, R[i])) * 32767;
  }
  return new Uint8Array(buf);
}

// =====================================================
// GỌI GEMINI (tự chờ khi hết lượt/phút, tự tìm mô hình còn dùng được)
// =====================================================
// Mỗi loại Gemini có lượt miễn phí riêng → loại này quá tải/hết lượt thì chuyển loại khác
const MO_HINH = {
  nghe: ["gemini-flash-latest", "gemini-2.5-flash", "gemini-flash-lite-latest", "gemini-2.5-flash-lite", "gemini-2.0-flash"],
  doc: ["gemini-2.5-flash-preview-tts", "gemini-2.5-flash-tts", "gemini-2.5-pro-preview-tts"],
};
const moHinhDung = {}; // mô hình đã chạy được
const moHinhNghi = new Set(); // mô hình đang quá tải hoặc hết lượt hôm nay → bỏ qua
// Lưu trên máy: mô hình nào hết lượt tới lúc nào / đã ngừng → lần sau khỏi thử lại
function napMoHinhNghi() {
  moHinhNghi.clear();
  const d = docLuu("phaha-dv-gemini-nghi");
  for (const [m, han] of Object.entries(d)) if (han > Date.now()) moHinhNghi.add(m);
}
function luuMoHinhNghi(m, giay) {
  const d = docLuu("phaha-dv-gemini-nghi");
  for (const k of Object.keys(d)) if (d[k] < Date.now()) delete d[k];
  d[m] = Date.now() + giay * 1000;
  try { localStorage.setItem("phaha-dv-gemini-nghi", JSON.stringify(d)); } catch {}
}

// Mã Gemini dùng cho từng việc: đọc giọng có thể dùng mã riêng (dự án khác → lượt miễn phí riêng)
const khoaGemini = (loai) => (loai === "doc" && caiDat.khoaDoc) || caiDat.khoa;
// Ghi nhớ "hết lượt" theo TỪNG MÃ (dấu vân tay ngắn của mã, không lưu mã): đổi mã là có sổ ghi nhớ mới
function vanTayMa(khoa) {
  let h = 5381;
  for (let i = 0; i < khoa.length; i++) h = ((h << 5) + h + khoa.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
const tenNghi = (m, loai) => vanTayMa(khoaGemini(loai) || "") + ":" + m;
let daBaoNghi = new Set(); // đã ghi nhật ký "bỏ qua vì ghi nhớ" (mỗi lần chạy 1 lần)

async function goiGemini(loai, noiDung) {
  const tuChon = loai === "nghe" ? caiDat.mhNghe : caiDat.mhDoc;
  if (tuChon) return goiMoHinh(tuChon, noiDung, loai);
  let ds = [...new Set([moHinhDung[loai], ...MO_HINH[loai]].filter(Boolean))];
  let daHoi = false, loiCuoi = null;
  for (let i = 0; i < ds.length; i++) {
    if (moHinhNghi.has(tenNghi(ds[i], loai))) {
      if (!daBaoNghi.has(tenNghi(ds[i], loai))) {
        daBaoNghi.add(tenNghi(ds[i], loai));
        const han = docLuu("phaha-dv-gemini-nghi")[tenNghi(ds[i], loai)];
        nhat(`Bỏ qua ${ds[i]}: mã này đã hết lượt ở lần trước${han ? ` (thử lại sau ${new Date(han).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })})` : ""}`);
      }
      continue;
    }
    try {
      const kq = await goiMoHinh(ds[i], noiDung, loai);
      moHinhDung[loai] = ds[i];
      return kq;
    } catch (loi) {
      if (loi.status !== 404 && !loi.doiMoHinh) throw loi;
      loiCuoi = loi;
      if (loi.status === 404) { moHinhNghi.add(tenNghi(ds[i], loai)); luuMoHinhNghi(tenNghi(ds[i], loai), 30 * 86400); }
      if (loi.goiY && !ds.includes(loi.goiY)) {
        ds.splice(i + 1, 0, loi.goiY);
        nhat(`↪️ ${ds[i]} đã ngừng, Google gợi ý dùng ${loi.goiY} → thử ngay`);
      }
      if (loi.doiMoHinh) {
        moHinhNghi.add(tenNghi(ds[i], loai));
        if (loi.message === "HET_NGAY") luuMoHinhNghi(tenNghi(ds[i], loai), Math.min(loi.choGiay || 3600, 86400));
        if (moHinhDung[loai] === ds[i]) delete moHinhDung[loai];
        nhat(`↪️ Bỏ qua ${ds[i]} (${loi.message === "HET_NGAY" ? "hết lượt miễn phí hôm nay" : "đang quá tải"}), thử loại Gemini khác`);
      }
    }
    // Hết danh sách: hỏi Google xem hiện có mô hình nào khác
    if (i === ds.length - 1 && !daHoi) {
      daHoi = true;
      ds = ds.concat((await timMoHinh(loai)).filter((t) => !ds.includes(t)));
    }
  }
  if (loiCuoi?.message === "HET_NGAY") { ghiHetGemini(loai); throw loiCuoi; }
  // Mọi mô hình đều đang được nhớ là hết lượt/ngừng → coi như hết lượt hôm nay
  if (!loiCuoi && ds.every((m) => moHinhNghi.has(tenNghi(m, loai)))) throw Object.assign(new Error("HET_NGAY"), { doiMoHinh: true });
  if (loiCuoi?.doiMoHinh) throw new Error("Gemini đang quá tải ở mọi loại. Chờ vài phút rồi bấm Bắt đầu lại.");
  throw new Error("Không tìm thấy mô hình Gemini phù hợp. Vào Cài đặt → Nâng cao để nhập tên mô hình.");
}

// Hết lượt cả ngày: ghi lại số lượt đã dùng được hôm nay = hạn mức thật của mã này
function ghiHetGemini(loai) {
  const vt = vanTayMa(khoaGemini(loai)), ngay = ngayMy();
  const d = docLuu("phaha-dv-dung"), da = daDung(`gm:${vt}:${loai}`, ngay);
  if (da > 0) d[`max:gm:${vt}:${loai}`] = { n: da };
  d[`het:gm:${vt}:${loai}`] = { ngay };
  try { localStorage.setItem("phaha-dv-dung", JSON.stringify(d)); } catch {}
}

async function timMoHinh(loai) {
  try {
    const r = await fetch(`${API}/models?pageSize=200`, { headers: { "x-goog-api-key": khoaGemini(loai) } });
    const j = await r.json();
    return (j.models || [])
      .map((m) => m.name.replace("models/", ""))
      .filter((t) => (loai === "doc" ? /tts/.test(t) : /flash/.test(t) && !/tts|image|live|audio|lite/.test(t)))
      .sort((a, b) => /flash/.test(b) - /flash/.test(a));
  } catch {
    return [];
  }
}

// các mô hình không nhận tuỳ chọn tắt "suy nghĩ" (lưu trên máy để lần sau khỏi thử)
const khongTatSuyNghi = new Set(Array.isArray(docLuu("phaha-dv-khong-tat-suy-nghi")) ? docLuu("phaha-dv-khong-tat-suy-nghi") : []);
async function goiMoHinh(moHinh, noiDung, loai) {
  let quaLau = 0;
  for (let lan = 0; ; lan++) {
    // Nghe & dịch: tắt chế độ "suy nghĩ" của Gemini để trả lời nhanh hơn nhiều
    const guiDi = loai === "nghe" && !khongTatSuyNghi.has(moHinh)
      ? { ...noiDung, generationConfig: { ...noiDung.generationConfig, thinkingConfig: { thinkingBudget: 0 } } }
      : noiDung;
    // Chờ quá lâu thì huỷ, gửi lại (tránh treo mãi khi mạng chập chờn)
    const huy = new AbortController();
    const hen = setTimeout(() => huy.abort(), (loai === "nghe" ? 180 : 60) * 1000);
    let r;
    const bd = Date.now();
    const thoiGian = () => ((Date.now() - bd) / 1000).toFixed(1) + " giây";
    try {
      r = await fetch(`${API}/models/${moHinh}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": khoaGemini(loai) },
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
      clearTimeout(hen);
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
      try { localStorage.setItem("phaha-dv-khong-tat-suy-nghi", JSON.stringify([...khongTatSuyNghi])); } catch {}
      nhat(`${moHinh} không nhận tuỳ chọn tắt suy nghĩ → gửi lại không kèm`);
      continue;
    }
    if (r.status === 429) {
      const chiTiet = JSON.stringify(j.error?.details || "");
      const giay = Number(/(\d+(?:\.\d+)?)s/.exec(j.error?.details?.find((d) => d.retryDelay)?.retryDelay || "")?.[1]);
      const quota = /quotaId\":\"([^\"]+)/.exec(chiTiet)?.[1];
      if (quota) nhat(`Giới hạn bị chạm: ${quota}${giay ? `, Google bảo chờ ${giay} giây` : ""}`);
      // Hết lượt trong ngày (hoặc phải chờ quá lâu) → đổi sang loại Gemini khác
      if (/per ?day|PerDay/i.test(thongBao + chiTiet) || !giay || giay > 60 || lan >= 3) {
        throw Object.assign(new Error("HET_NGAY"), { chiTiet: thongBao, doiMoHinh: true, choGiay: giay });
      }
      await cho(giay + 1, loai === "nghe" ? "dich" : "long");
      continue;
    }
    // Quá tải (503): thử lại 1 lần, vẫn quá tải thì đổi loại Gemini khác
    if (r.status === 503) {
      if (lan < 1) { await cho(3); continue; }
      throw Object.assign(new Error("Gemini đang quá tải"), { status: 503, doiMoHinh: true });
    }
    if (r.status >= 500 && lan < 3) { await cho(5); continue; }
    const e = new Error(thongBao);
    e.status = r.status === 400 && /not found|not supported|is not/i.test(thongBao) ? 404 : r.status;
    // Google gợi ý mô hình thay thế, vd "use models/gemini-3.8-flash"
    e.goiY = /use models\/([\w.\-]+)/i.exec(thongBao)?.[1];
    throw e;
  }
}

async function cho(giay, tenBuoc) {
  for (let s = Math.ceil(giay); s > 0; s--) {
    if (tenBuoc) ghiChu(tenBuoc, `Gemini bảo chờ chút (giới hạn lượt miễn phí)… ${s}s`);
    await new Promise((x) => setTimeout(x, 1000));
  }
}

function layChu(tl) {
  const ung = tl.candidates?.[0];
  if (!ung?.content?.parts) {
    if (ung?.finishReason === "SAFETY" || tl.promptFeedback?.blockReason) throw new Error("Gemini từ chối nội dung video này.");
    throw new Error("Gemini không trả lời. Bấm Bắt đầu để thử lại.");
  }
  return ung.content.parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("");
}

function loiDeHieu(loi) {
  const m = String(loi?.message || loi);
  if (m === "HET_NGAY") return "Mã Gemini miễn phí đã hết lượt hôm nay.\nCách xử lý: chờ đến mai, hoặc dùng mã Gemini tạo trong DỰ ÁN MỚI (aistudio.google.com → Create API key → Create in new project; mã cùng dự án dùng chung lượt), rồi bấm “Làm lại”. Những câu đã đọc xong được giữ lại, không tốn lượt lần nữa.";
  if (loi?.dv === "gc") {
    if (/billing/i.test(m)) return "Google Cloud cần gắn thẻ thanh toán trước (vẫn miễn phí trong mức cho phép).\nMở ⚙️ Cài đặt → “Cách bật” → bước 1.";
    if (/has not been used|disabled|SERVICE_DISABLED/i.test(m)) return "Chưa bật dịch vụ đọc của Google Cloud cho mã này.\nMở ⚙️ Cài đặt → “Cách bật” → bước 2 (bấm Enable), chờ 1–2 phút rồi thử lại.";
    if (/API key not valid|API_KEY_INVALID/i.test(m)) return "Mã Google Cloud không đúng. Mở ⚙️ Cài đặt, dán lại mã.";
    if (/blocked|not authorized|PERMISSION_DENIED|restrict/i.test(m)) return "Mã này bị giới hạn, không được dùng dịch vụ đọc.\nVào console.cloud.google.com → APIs & Services → Credentials → sửa mã, cho phép “Cloud Text-to-Speech API”.";
    return "Google Cloud báo lỗi: " + m;
  }
  if (loi?.dv === "az") {
    if (loi.status === 401) return "Mã Azure hoặc Vùng không đúng. Mở ⚙️ Cài đặt, kiểm tra lại KEY 1 và Location/Region (ví dụ southeastasia).";
    if (loi.status === 403 || loi.status === 429) return "Azure đã hết lượt miễn phí tháng này (hoặc đang quá tải). App tự chuyển sang giọng kế tiếp.";
    return "Azure báo lỗi: " + m;
  }
  if (loi?.dv === "el") {
    if (loi.hetLuot) return "ElevenLabs đã hết lượt tháng này. App tự chuyển sang giọng kế tiếp; muốn dùng tiếp thì mua thêm gói ElevenLabs.";
    if (loi.status === 401) return "Mã ElevenLabs không đúng hoặc thiếu quyền. Tạo lại mã, bật quyền Text to Speech và Voices (Read).\n" + m;
    if (/model/i.test(m)) return "Giọng/chất lượng này chưa đọc được tiếng Việt. Trong ⚙️ đổi Chất lượng sang “Nhanh (Flash)” rồi thử lại.\n" + m;
    return "ElevenLabs báo lỗi: " + m;
  }
  if (loi?.dv === "fish") {
    if (loi.status === 401 || loi.status === 403) return "Mã Fish Audio không đúng hoặc chưa đăng nhập app PHAHA. Mở ⚙️ Cài đặt kiểm tra lại.\n" + m;
    if (loi.hetLuot || loi.status === 429) return "Fish Audio đã hết lượt miễn phí (hoặc đang quá tải). App tự chuyển sang giọng kế tiếp.";
    return "Fish Audio báo lỗi: " + m;
  }
  if (loi?.dv === "vt") {
    if (loi.status === 401 || loi.status === 403 || /token|key|auth/i.test(m)) return "Mã Viettel AI không đúng hoặc hết hạn. Mở ⚙️ Cài đặt → mục Viettel AI, dán lại mã.\n" + m;
    if (loi.hetLuot) return "Viettel AI đã hết ký tự. App tự chuyển sang giọng kế tiếp; mua thêm gói ở viettelai.vn để dùng tiếp.";
    return "Viettel AI báo lỗi: " + m;
  }
  if (loi?.dv === "fpt") {
    if (/cannot consume|not.*(allow|permission)|forbidden/i.test(m)) return "Mã FPT.AI đúng nhưng FPT chưa cho dùng dịch vụ đọc giọng.\nVào console.fpt.ai → chọn đúng dự án → APIs → bật Text to Speech. Bật rồi vẫn lỗi thì FPT đã ngừng cho tài khoản cá nhân – bỏ tích \"Dùng FPT.AI\" để app dùng giọng khác.\n(" + m + ")";
    if (loi.status === 401 || loi.status === 403) return "Mã FPT.AI không đúng. Mở ⚙️ Cài đặt → mục FPT.AI, dán lại mã.\n" + m;
    if (loi.hetLuot) return "FPT.AI đã hết lượt dùng thử. App tự chuyển sang giọng kế tiếp; muốn dùng tiếp thì mua gói ở console.fpt.ai.";
    return "FPT.AI báo lỗi: " + m;
  }
  if (loi?.dv === "edge") {
    if (loi.status === 401) return "Giọng Edge cần đăng nhập app PHAHA trên máy này (mở tab Lịch việc để đăng nhập).";
    return "Giọng Edge tạm không dùng được (Microsoft có thể đã chặn): " + m;
  }
  if (/API key not valid|API_KEY_INVALID/i.test(m)) return "Mã Gemini không đúng. Mở ⚙️ Cài đặt, dán lại mã.";
  if (loi?.status === 403) return "Mã Gemini không có quyền dùng (403). Kiểm tra mã ở aistudio.google.com.\n" + m;
  if (/out of memory|OOM|Aborted/i.test(m)) return "Video quá nặng so với điện thoại. Thử video ngắn hơn hoặc nhẹ hơn.";
  return m;
}

// =====================================================
// XỬ LÝ ÂM THANH
// =====================================================
// Đóng gói mẫu âm thanh thành file WAV
function taoWav(mau, tanSo) {
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

function sangBase64(byte) {
  return new Promise((xong, hong) => {
    const fr = new FileReader();
    fr.onload = () => xong(String(fr.result).split(",")[1]);
    fr.onerror = hong;
    fr.readAsDataURL(new Blob([byte]));
  });
}

// Cắt khoảng lặng đầu/cuối, làm mềm 2 đầu, chỉnh âm lượng vừa phải
function lamGon(mau) {
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

function doiTanSo(mau, tu, sang) {
  const ra = new Float32Array(Math.round((mau.length * sang) / tu));
  for (let i = 0; i < ra.length; i++) {
    const x = (i * tu) / sang, k = Math.floor(x), t = x - k;
    ra[i] = (mau[k] || 0) * (1 - t) + (mau[k + 1] || 0) * t;
  }
  return ra;
}

// Đọc nhanh hơn mà không bị "giọng chuột" (WSOLA): tiSo 1.3 = nhanh hơn 30%
function coGian(x, tiSo) {
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

// ----- Phụ đề & giờ -----
function dongHo(s) {
  const p = Math.floor(s / 60), g = s - p * 60;
  return `${String(p).padStart(2, "0")}:${g.toFixed(1).padStart(4, "0")}`;
}
function taoSrt() {
  const gio = (s) => {
    const ms = Math.round(s * 1000);
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), g = Math.floor((ms % 60000) / 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(g).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
  };
  return cacCau.filter((c) => c.vi.trim()).map((c, i) => `${i + 1}\n${gio(c.start)} --> ${gio(c.end)}\n${c.vi}\n`).join("\n");
}
