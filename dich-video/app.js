// =====================================================
// PhaHa – Lồng tiếng video Trung → Việt
// Quy trình: chọn video → tách tiếng → Gemini nghe & dịch
//            → Gemini đọc tiếng Việt → ghép tiếng vào video
// Mọi thứ chạy ngay trên điện thoại, chỉ gửi phần âm thanh/chữ lên Gemini.
// =====================================================
import { FFmpeg } from "./ffmpeg/index.js";
import { macDinhLop, canVe, veLop, xuatHinh } from "./lop-phu.js";

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
  { khoa: "", giong: "Kore", amGoc: 15, mhNghe: "", mhDoc: "", dichVu: "gc", dv: {}, tachNhac: false, mhTach: "nhanh", amNen: 90 },
  docLuu("phaha-dv-cai-dat")
);
// Mỗi dịch vụ đọc có mã, giọng, danh sách giọng riêng
caiDat.dv.gc = Object.assign({ khoa: caiDat.khoaGc || "", giong: caiDat.giongGc || "", ds: caiDat.dsGiongGc || [] }, caiDat.dv.gc);
caiDat.dv.az = Object.assign({ khoa: "", vung: "southeastasia", giong: "", ds: [] }, caiDat.dv.az);
caiDat.dv.el = Object.assign({ khoa: "", mh: "eleven_v3", giong: "", ds: [] }, caiDat.dv.el);
if (caiDat.dichVu === "gcloud") caiDat.dichVu = "gc";
// Phụ đề, lớp che, logo: giữ cài đặt cũ, thêm mục mới nếu thiếu
{
  const md = macDinhLop(), cu = caiDat.lop || {};
  caiDat.lop = { phuDe: { ...md.phuDe, ...cu.phuDe }, che: { ...md.che, ...cu.che }, logo: { ...md.logo, ...cu.logo } };
}
delete caiDat.khoaGc; delete caiDat.giongGc; delete caiDat.dsGiongGc;

function docLuu(ten) {
  try { return JSON.parse(localStorage.getItem(ten)) || {}; } catch { return {}; }
}
function luuCaiDat() {
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
let amThanh = null; // AudioContext để nghe thử
let nhacNen = null; // { tep, loai, wav } nhạc nền đã tách, để làm lại không phải tách lại
let anhLogo = null; // ảnh logo đã nạp

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
  xem.onloadeddata = xem.onseeked = xem.onpause = () => veXemTruoc();
});

$("nut-bat-dau").addEventListener("click", () => chay(true));
$("nut-lam-lai").addEventListener("click", () => chay(false));

$("nut-cai-dat").addEventListener("click", moCaiDat);
const CAC_DV = ["gc", "az", "el"]; // các dịch vụ có danh sách giọng
function moCaiDat() {
  $("o-khoa").value = caiDat.khoa;
  $("o-giong").value = caiDat.giong;
  $("o-dich-vu").value = caiDat.dichVu;
  for (const dv of CAC_DV) {
    $("o-khoa-" + dv).value = caiDat.dv[dv].khoa;
    veDsGiong(dv);
    const da = kyTuThang(dv), toiDa = DICH_VU[dv].mienPhi;
    $("chu-ky-tu-" + dv).textContent =
      `Tháng này đã dùng ${da.toLocaleString("vi-VN")} / ${toiDa.toLocaleString("vi-VN")} lượt miễn phí (đếm trên máy này).`;
  }
  $("o-vung-az").value = caiDat.dv.az.vung;
  $("o-mh-el").value = caiDat.dv.el.mh;
  hienDichVu();
  $("o-mh-nghe").value = caiDat.mhNghe;
  $("o-mh-doc").value = caiDat.mhDoc;
  $("hop-cai-dat").showModal();
}
$("hop-cai-dat").addEventListener("close", layTuForm);
function layTuForm() {
  caiDat.dichVu = $("o-dich-vu").value;
  for (const dv of CAC_DV) {
    caiDat.dv[dv].khoa = $("o-khoa-" + dv).value.trim();
    caiDat.dv[dv].giong = $("o-giong-" + dv).value || caiDat.dv[dv].giong;
  }
  caiDat.dv.az.vung = $("o-vung-az").value.trim().toLowerCase().replace(/\s+/g, "") || "southeastasia";
  caiDat.dv.el.mh = $("o-mh-el").value;
  caiDat.khoa = $("o-khoa").value.trim();
  caiDat.giong = $("o-giong").value;
  caiDat.mhNghe = $("o-mh-nghe").value.trim();
  caiDat.mhDoc = $("o-mh-doc").value.trim();
  luuCaiDat();
}

function hienDichVu() {
  const chon = $("o-dich-vu").value;
  for (const dv of [...CAC_DV, "gemini"]) $("phan-" + dv).classList.toggle("an", dv !== chon);
}
$("o-dich-vu").addEventListener("change", hienDichVu);

function veDsGiong(dv) {
  const o = $("o-giong-" + dv), c = caiDat.dv[dv];
  if (!c.ds.length) return;
  o.innerHTML = "";
  for (const g of c.ds) o.add(new Option(g.nhan, g.ten));
  o.value = c.giong || c.ds[0].ten;
}

for (const dv of CAC_DV) {
  $("nut-tai-giong-" + dv).addEventListener("click", async () => {
    layTuForm();
    const nut = $("nut-tai-giong-" + dv), c = caiDat.dv[dv];
    nut.disabled = true;
    nut.textContent = "Đang tải…";
    try {
      if (dv !== "gc" && !c.khoa) throw new Error("Dán mã " + DICH_VU[dv].ten + " trước đã.");
      c.ds = await DICH_VU[dv].taiGiong();
      if (!c.ds.length) throw new Error(DICH_VU[dv].ten + " chưa có giọng nào dùng được.");
      if (!c.ds.some((g) => g.ten === c.giong)) c.giong = c.ds[0].ten;
      luuCaiDat();
      veDsGiong(dv);
      nut.textContent = `✅ Có ${c.ds.length} giọng`;
    } catch (loi) {
      alert(loiDeHieu(loi));
      nut.textContent = "🔄 Tải danh sách giọng";
    } finally {
      nut.disabled = false;
    }
  });
}

$("nut-thu-giong").addEventListener("click", async () => {
  layTuForm();
  const nut = $("nut-thu-giong");
  nut.disabled = true;
  try {
    await phat(await docCau("Xin chào, đây là giọng lồng tiếng của PhaHa."));
  } catch (loi) {
    alert(loiDeHieu(loi));
  } finally {
    nut.disabled = false;
  }
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
    o.querySelector(".nghe-thu").addEventListener("click", () => ngheThu(i));
    ds.appendChild(o);
  });
  veXemTruoc();
}

async function ngheThu(i) {
  try {
    await phat(await docCau(cacCau[i].vi));
  } catch (loi) {
    alert(loiDeHieu(loi));
  }
}

async function phat(mau) {
  amThanh ||= new AudioContext();
  await amThanh.resume();
  const b = amThanh.createBuffer(1, mau.length, TAN_SO_DOC);
  b.copyToChannel(mau, 0);
  const nguon = amThanh.createBufferSource();
  nguon.buffer = b;
  nguon.connect(amThanh.destination);
  nguon.start();
}

// =====================================================
// CHẠY CẢ QUY TRÌNH
// lamTuDau = true: tách tiếng + dịch lại; false: dùng lời thoại đang sửa
// =====================================================
async function chay(lamTuDau) {
  if (dangChay || !tepVideo) return;
  if (!caiDat.khoa) {
    alert("Cần dán mã Gemini trước (miễn phí). Mở Cài đặt nhé.");
    moCaiDat();
    return;
  }
  if (caiDat.dichVu !== "gemini" && !caiDat.dv[caiDat.dichVu].giong) {
    alert(`Chưa chọn giọng ${DICH_VU[caiDat.dichVu].ten}. Mở Cài đặt → bấm “Tải danh sách giọng”.`);
    moCaiDat();
    return;
  }
  dangChay = true;
  nhatKyChay = [];
  mocNhat = Date.now();
  const l = caiDat.lop;
  nhat(`BẮT ĐẦU ${lamTuDau ? "(làm từ đầu)" : "(làm lại)"} · ${new Date().toLocaleString("vi-VN")}`);
  nhat(`Máy: ${moTaMay()}`);
  nhat(`Video: ${tepVideo.name} · ${(tepVideo.size / 1048576).toFixed(1)}MB`);
  nhat(`Cài đặt: đọc bằng ${caiDat.dichVu}${caiDat.dichVu === "gemini" ? "" : " / " + caiDat.dv[caiDat.dichVu].giong} · tách nhạc: ${caiDat.tachNhac ? caiDat.mhTach : "tắt"} · phụ đề: ${l.phuDe.bat ? "bật" : "tắt"} · lớp che: ${l.che.bat ? "bật" : "tắt"} · logo: ${l.logo.bat && anhLogo ? "bật" : "tắt"}`);
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
    const thongTin = await ganVideo();

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

    buocDang = "nhac";
    let wavNen = null, giamTheoLoi = false;
    if (caiDat.tachNhac && thongTin.coTieng && caiDat.mhTach === "giam") {
      giamTheoLoi = true;
      buoc("nhac", "bo", "Giảm tiếng gốc lúc có lời (không dùng AI)");
    } else if (caiDat.tachNhac && thongTin.coTieng) {
      buoc("nhac", "dang");
      try {
        if (nhacNen?.tep !== tepVideo || nhacNen.loai !== caiDat.mhTach) {
          nhacNen = { tep: tepVideo, loai: caiDat.mhTach, wav: await tachNhacNen() };
        }
        wavNen = nhacNen.wav;
        buoc("nhac", "xong");
      } catch (loi) {
        // AI không chạy được trên máy này → vẫn làm tiếp, chỉ giảm tiếng gốc lúc có lời
        nhat("Tách nhạc hỏng: " + (loi?.message || loi));
        giamTheoLoi = true;
        buoc("nhac", "loi", "AI không chạy được trên máy này → chuyển sang giảm tiếng gốc lúc có lời");
      }
    } else buoc("nhac", "bo", "Không bật");

    buocDang = "long";
    buoc("long", "dang");
    const tiengViet = await longTieng();
    buoc("long", "xong");

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
async function taiFfmpeg() {
  if (ff) return;
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

async function ngheMotDoan(mau, batDau) {
  const dai = mau.length / TAN_SO_NGHE;
  const duLieu = await sangBase64(taoWav(mau, TAN_SO_NGHE));
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
Hãy nghe kỹ phần LỜI NÓI (bỏ qua nhạc nền, tiếng động) và chia thành từng câu ngắn, mỗi câu tối đa khoảng 8 giây.
Với mỗi câu trả về:
- start, end: thời điểm bắt đầu và kết thúc, tính bằng GIÂY (số thập phân) kể từ đầu đoạn âm thanh này, thật chính xác.
- zh: lời gốc tiếng Trung (chữ Hán).
- vi: bản dịch tiếng Việt tự nhiên như người Việt nói, xưng hô hợp ngữ cảnh. Dịch NGẮN GỌN để đọc lồng tiếng vừa khít thời lượng câu (khoảng 4–5 âm tiết mỗi giây). Không thêm chú thích.
Nếu không có lời nói thì trả về mảng rỗng [].`;
}

// =====================================================
// ĐỌC TIẾNG VIỆT (Google Cloud, Azure, ElevenLabs hoặc Gemini)
// =====================================================
const DICH_VU = {
  gc: { ten: "Google Cloud", mienPhi: 1000000, taiGiong: layGiongGc, doc: docGoogleCloud },
  az: { ten: "Azure", mienPhi: 500000, taiGiong: layGiongAz, doc: docAzure },
  el: { ten: "ElevenLabs", mienPhi: 10000, taiGiong: layGiongEl, doc: docEleven },
  gemini: { ten: "Gemini", doc: docGemini },
};
let hetLuotEl = false; // ElevenLabs hết lượt trong lần chạy này → đọc bằng Google Cloud

async function docCau(chu) {
  chu = chu.trim();
  let dv = caiDat.dichVu;
  if (dv === "el" && hetLuotEl && caiDat.dv.gc.giong) dv = "gc";
  const c = caiDat.dv[dv];
  const khoa = [dv, dv === "gemini" ? caiDat.giong : c.giong, dv === "el" ? c.mh : "", chu].join("|");
  if (khoGiong.has(khoa)) return khoGiong.get(khoa);
  let kq;
  try {
    kq = await DICH_VU[dv].doc(chu);
  } catch (loi) {
    if (dv === "el" && loi.hetLuot && caiDat.dv.gc.giong) {
      hetLuotEl = true;
      ghiChu("long", "ElevenLabs hết lượt → chuyển sang Google Cloud");
      nhat("ElevenLabs hết lượt → chuyển sang Google Cloud");
      return docCau(chu);
    }
    throw loi;
  }
  let mau = Float32Array.from(kq.pcm, (v) => v / 32768);
  if (kq.tanSo !== TAN_SO_DOC) mau = doiTanSo(mau, kq.tanSo, TAN_SO_DOC);
  mau = lamGon(mau);
  khoGiong.set(khoa, mau);
  return mau;
}

async function docGemini(chu) {
  const tl = await goiGemini("doc", {
    contents: [{ parts: [{ text: `Đọc bằng tiếng Việt, giọng tự nhiên, tốc độ hơi nhanh: ${chu}` }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: caiDat.giong } } },
    },
  });
  const phan = tl.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!phan) throw new Error("Gemini không trả về giọng đọc. Thử lại sau ít phút.");
  const byte = tuBase64(phan.inlineData.data);
  return {
    pcm: new Int16Array(byte.buffer, 0, byte.length >> 1),
    tanSo: Number(/rate=(\d+)/.exec(phan.inlineData.mimeType || "")?.[1]) || TAN_SO_DOC,
  };
}

// Gọi dịch vụ đọc: tự thử lại khi mạng chập chờn hoặc bị giới hạn lượt/phút
async function goiDocGiong(dv, diaChi, tuyChon, kieu = "json") {
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
    const hetLuot = j.detail?.status === "quota_exceeded" || /quota/i.test(thongBao) && dv === "el";
    if (!hetLuot && (r.status === 429 || r.status >= 500) && lan < 5) { await cho(5 * (lan + 1), "long"); continue; }
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

async function docGoogleCloud(chu) {
  const j = await goiGc("/text:synthesize", {
    input: { text: chu },
    voice: { languageCode: "vi-VN", name: caiDat.dv.gc.giong },
    audioConfig: { audioEncoding: "LINEAR16", sampleRateHertz: TAN_SO_DOC },
  });
  congKyTu("gc", chu.length);
  return docWav(tuBase64(j.audioContent));
}

// ----- Microsoft Azure Speech -----
const azApi = (duong) => `https://${caiDat.dv.az.vung}.tts.speech.microsoft.com/cognitiveservices${duong}`;

async function layGiongAz() {
  const ds = await goiDocGiong("az", azApi("/voices/list"), {
    headers: { "Ocp-Apim-Subscription-Key": caiDat.dv.az.khoa },
  });
  return (ds || [])
    .filter((g) => g.Locale === "vi-VN")
    .map((g) => ({ ten: g.ShortName, nhan: `${g.Gender === "Male" ? "Nam" : "Nữ"} · ${g.LocalName || g.DisplayName}` }));
}

async function docAzure(chu) {
  const anToan = chu.replace(/[<>&'"]/g, (k) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[k]);
  const byte = await goiDocGiong("az", azApi("/v1"), {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": caiDat.dv.az.khoa,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "riff-24khz-16bit-mono-pcm",
    },
    body: `<speak version="1.0" xml:lang="vi-VN"><voice name="${caiDat.dv.az.giong}">${anToan}</voice></speak>`,
  }, "byte");
  congKyTu("az", chu.length);
  return docWav(byte);
}

// ----- ElevenLabs -----
const EL_API = "https://api.elevenlabs.io/v1";

async function layGiongEl() {
  const j = await goiDocGiong("el", EL_API + "/voices", { headers: { "xi-api-key": caiDat.dv.el.khoa } });
  const laViet = (g) => /^vi|vietnam/i.test(g.labels?.language || "") || /vietnam/i.test(g.labels?.accent || "");
  return (j.voices || [])
    .sort((a, b) => laViet(b) - laViet(a) || a.name.localeCompare(b.name))
    .map((g) => ({
      ten: g.voice_id,
      nhan: `${laViet(g) ? "🇻🇳 " : ""}${g.name}${g.labels?.gender ? " · " + (g.labels.gender === "male" ? "Nam" : "Nữ") : ""}`,
    }));
}

async function docEleven(chu) {
  const c = caiDat.dv.el;
  const noiDung = { text: chu, model_id: c.mh };
  if (c.mh !== "eleven_v3") noiDung.language_code = "vi";
  const byte = await goiDocGiong("el", `${EL_API}/text-to-speech/${c.giong}?output_format=pcm_24000`, {
    method: "POST",
    headers: { "xi-api-key": c.khoa, "Content-Type": "application/json" },
    body: JSON.stringify(noiDung),
  }, "byte");
  congKyTu("el", Math.ceil(chu.length * (c.mh === "eleven_v3" ? 1 : 0.5)));
  const ban = byte.slice(0, byte.length & ~1);
  return { pcm: new Int16Array(ban.buffer), tanSo: 24000 };
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
function chiaNhom(cau) {
  if (caiDat.dichVu !== "gemini") return cau.map((c) => ({ start: c.start, end: c.end, vi: c.vi.trim() }));
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

async function longTieng() {
  const tong = new Float32Array(Math.ceil(thoiLuong * TAN_SO_DOC) + TAN_SO_DOC);
  let xong = 0;
  const cau = chiaNhom(cacCau.filter((c) => c.vi.trim()));
  const donVi = caiDat.dichVu === "gemini" ? "lượt đọc" : "câu";
  hetLuotEl = false;
  // Đọc 3 phần cùng lúc cho nhanh
  const hang = cau.map((c, i) => i);
  const cacGiong = new Array(cau.length);
  await Promise.all([0, 1, 2].map(async () => {
    while (hang.length) {
      const i = hang.shift();
      cacGiong[i] = await docCau(cau[i].vi);
      ghiChu("long", `${++xong}/${cau.length} ${donVi}`);
    }
  }));
  nhat(`Đã đọc ${cau.length} ${donVi}, ${cau.reduce((n, c) => n + c.vi.length, 0)} ký tự (${caiDat.dichVu})`);
  // Đặt từng phần vào đúng thời điểm
  cau.forEach((c, i) => {
    let mau = cacGiong[i];
    const sau = cau[i + 1] ? cau[i + 1].start : thoiLuong;
    const choPhep = Math.max(c.end - c.start, sau - c.start - 0.08);
    const dai = mau.length / TAN_SO_DOC;
    if (choPhep > 0.3 && dai > choPhep * 1.02) mau = coGian(mau, Math.min(dai / choPhep, NHANH_TOI_DA));
    const viTri = Math.round(c.start * TAN_SO_DOC);
    for (let k = 0; k < mau.length && viTri + k < tong.length; k++) tong[viTri + k] += mau[k];
  });
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
    await ff.writeFile(tepNen, wavNen);
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
      else if (d.loai === "loi") hong(new Error("Tách nhạc bị lỗi: " + d.chu));
    };
    thoTach.onerror = (e) => { thoTach = null; hong(new Error("Tách nhạc bị lỗi: " + (e.message || "không tải được AI"))); };
    thoTach.postMessage({ L, R, loai: caiDat.mhTach }, [L.buffer, R.buffer]);
  });
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

async function goiGemini(loai, noiDung) {
  const tuChon = loai === "nghe" ? caiDat.mhNghe : caiDat.mhDoc;
  if (tuChon) return goiMoHinh(tuChon, noiDung, loai);
  let ds = [...new Set([moHinhDung[loai], ...MO_HINH[loai]].filter(Boolean))];
  let daHoi = false, loiCuoi = null;
  for (let i = 0; i < ds.length; i++) {
    if (moHinhNghi.has(ds[i])) continue;
    try {
      const kq = await goiMoHinh(ds[i], noiDung, loai);
      moHinhDung[loai] = ds[i];
      return kq;
    } catch (loi) {
      if (loi.status !== 404 && !loi.doiMoHinh) throw loi;
      loiCuoi = loi;
      if (loi.doiMoHinh) {
        moHinhNghi.add(ds[i]);
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
  if (loiCuoi?.message === "HET_NGAY") throw loiCuoi;
  if (loiCuoi?.doiMoHinh) throw new Error("Gemini đang quá tải ở mọi loại. Chờ vài phút rồi bấm Bắt đầu lại.");
  throw new Error("Không tìm thấy mô hình Gemini phù hợp. Vào Cài đặt → Nâng cao để nhập tên mô hình.");
}

async function timMoHinh(loai) {
  try {
    const r = await fetch(`${API}/models?pageSize=200`, { headers: { "x-goog-api-key": caiDat.khoa } });
    const j = await r.json();
    return (j.models || [])
      .map((m) => m.name.replace("models/", ""))
      .filter((t) => (loai === "doc" ? /tts/.test(t) : /flash/.test(t) && !/tts|image|live|audio|lite/.test(t)))
      .sort((a, b) => /flash/.test(b) - /flash/.test(a));
  } catch {
    return [];
  }
}

let khongTatSuyNghi = false; // mô hình không cho tắt chế độ "suy nghĩ"
async function goiMoHinh(moHinh, noiDung, loai) {
  let quaLau = 0;
  for (let lan = 0; ; lan++) {
    // Nghe & dịch: tắt chế độ "suy nghĩ" của Gemini để trả lời nhanh hơn nhiều
    const guiDi = loai === "nghe" && !khongTatSuyNghi
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
        headers: { "Content-Type": "application/json", "x-goog-api-key": caiDat.khoa },
        body: JSON.stringify(guiDi),
        signal: huy.signal,
      });
      if (r.ok) {
        const j = await r.json();
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
    if (r.status === 400 && guiDi !== noiDung && /thinking/i.test(thongBao)) {
      khongTatSuyNghi = true;
      continue;
    }
    if (r.status === 429) {
      const chiTiet = JSON.stringify(j.error?.details || "");
      const giay = Number(/(\d+(?:\.\d+)?)s/.exec(j.error?.details?.find((d) => d.retryDelay)?.retryDelay || "")?.[1]);
      const quota = /quotaId\":\"([^\"]+)/.exec(chiTiet)?.[1];
      if (quota) nhat(`Giới hạn bị chạm: ${quota}${giay ? `, Google bảo chờ ${giay} giây` : ""}`);
      // Hết lượt trong ngày (hoặc phải chờ quá lâu) → đổi sang loại Gemini khác
      if (/per ?day|PerDay/i.test(thongBao + chiTiet) || !giay || giay > 60 || lan >= 3) {
        throw Object.assign(new Error("HET_NGAY"), { chiTiet: thongBao, doiMoHinh: true });
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
  if (m === "HET_NGAY") return "Mã Gemini miễn phí đã hết lượt hôm nay.\nCách xử lý: chờ đến mai, hoặc bật thanh toán cho mã ở aistudio.google.com (rất rẻ), rồi bấm “Làm lại”. Những câu đã đọc xong được giữ lại, không tốn lượt lần nữa.";
  if (loi?.dv === "gc") {
    if (/billing/i.test(m)) return "Google Cloud cần gắn thẻ thanh toán trước (vẫn miễn phí trong mức cho phép).\nMở ⚙️ Cài đặt → “Cách bật” → bước 1.";
    if (/has not been used|disabled|SERVICE_DISABLED/i.test(m)) return "Chưa bật dịch vụ đọc của Google Cloud cho mã này.\nMở ⚙️ Cài đặt → “Cách bật” → bước 2 (bấm Enable), chờ 1–2 phút rồi thử lại.";
    if (/API key not valid|API_KEY_INVALID/i.test(m)) return "Mã Google Cloud không đúng. Mở ⚙️ Cài đặt, dán lại mã.";
    if (/blocked|not authorized|PERMISSION_DENIED|restrict/i.test(m)) return "Mã này bị giới hạn, không được dùng dịch vụ đọc.\nVào console.cloud.google.com → APIs & Services → Credentials → sửa mã, cho phép “Cloud Text-to-Speech API”.";
    return "Google Cloud báo lỗi: " + m;
  }
  if (loi?.dv === "az") {
    if (loi.status === 401) return "Mã Azure hoặc Vùng không đúng. Mở ⚙️ Cài đặt, kiểm tra lại KEY 1 và Location/Region (ví dụ southeastasia).";
    if (loi.status === 403 || loi.status === 429) return "Azure đã hết lượt miễn phí tháng này (hoặc đang quá tải). Chọn dịch vụ khác trong ⚙️ Cài đặt.";
    return "Azure báo lỗi: " + m;
  }
  if (loi?.dv === "el") {
    if (loi.hetLuot) return "ElevenLabs đã hết lượt miễn phí tháng này.\nChọn dịch vụ khác trong ⚙️ Cài đặt, hoặc cài Google Cloud để app tự chuyển sang khi hết lượt.";
    if (loi.status === 401) return "Mã ElevenLabs không đúng hoặc thiếu quyền. Tạo lại mã, bật quyền Text to Speech và Voices (Read).\n" + m;
    if (/model/i.test(m)) return "Giọng/chất lượng này chưa đọc được tiếng Việt. Trong ⚙️ đổi Chất lượng sang “Nhanh (Flash)” rồi thử lại.\n" + m;
    return "ElevenLabs báo lỗi: " + m;
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
  return cacCau.map((c, i) => `${i + 1}\n${gio(c.start)} --> ${gio(c.end)}\n${c.vi}\n`).join("\n");
}
