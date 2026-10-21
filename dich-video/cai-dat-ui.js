// =====================================================
// HỘP ⚙️ CÀI ĐẶT + các ô trên màn hình chính (giọng cho video này, chuyên môn dịch, chủ đề, thuật ngữ)
// =====================================================
import { $, caiDat, nhat, luuCaiDat, lamSachMa, kyTuThang, coMayChu, daDangNhap, dungDuocMayChu } from "./nen.js";
import { KENH, KENH_MAC_DINH } from "./chuyen-mon.js";
import { quenGhiNhoGemini } from "./gemini.js";
import { THU_TU, CAC_DV, CAU_MAU, DICH_VU, LOAI_GC, tenGiong, taiDsGiong, dvDocDung, dvHetThang, docCau } from "./giong-doc.js";
import { trangDongBo, ghiTrangDongBo, hienTrangDongBo } from "./dong-bo-ui.js";
import { bamNghe } from "./nghe-thu.js";
import { loiDeHieu } from "./loi.js";

// Ô trong hộp cài đặt ↔ mục trong caiDat (đọc/ghi giống nhau ở moCaiDat và layTuForm)
const O_CHU = [
  ["o-khoa-fpt", "dv.fpt.khoa"], ["o-khoa-vt", "dv.vt.khoa"], ["o-dp-groq", "dp.groq"], ["o-dp-or", "dp.or"],
  ["o-dp-az-dich", "dp.azDich"], ["o-khoa-ds", "dp.ds"], ["o-mh-nghe", "mhNghe"], ["o-mh-doc", "mhDoc"],
];
const lay = (duong) => duong.split(".").reduce((o, k) => o?.[k], caiDat);
const dat = (duong, v) => { const k = duong.split("."), cuoi = k.pop(); k.reduce((o, x) => o[x], caiDat)[cuoi] = v; };

export function moCaiDat() {
  $("o-khoa").value = caiDat.khoa;
  $("o-khoa-doc").value = caiDat.khoaDoc;
  $("o-mk-dong-bo").value = trangDongBo().mk || "";
  $("o-tu-dong-bo").checked = trangDongBo().tuDong !== false;
  hienTrangDongBo();
  $("bat-deepseek").checked = caiDat.dichBang === "deepseek";
  $("o-giong").value = caiDat.giong;
  for (const [id, duong] of O_CHU) $(id).value = lay(duong);
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
  $("o-giong-vt").value = caiDat.dv.vt.giong;
  $("o-giong-fpt").value = caiDat.dv.fpt.giong;
  $("o-vung-az").value = caiDat.dv.az.vung;
  $("o-dp-az-dich-vung").value = caiDat.dp.azDichVung;
  $("o-dp-cf").checked = caiDat.dp.cf;
  $("o-dp-az-nghe").checked = caiDat.dp.azNghe;
  $("chu-dp-cf").textContent = lyDoKhongMayChu() ? "⚠️ " + lyDoKhongMayChu() : "✅ Đã đăng nhập app PHAHA – dùng được";
  $("o-mh-el").value = caiDat.dv.el.mh;
  hienTrangThai();
  // Mở sẵn mục giọng đang được dùng đầu tiên
  const dau = dvDocDung(true)[0];
  document.querySelectorAll(".dv-doc").forEach((d) => (d.open = d.dataset.dv === dau));
  $("hop-cai-dat").showModal();
}

export function layTuForm() {
  for (const dv of CAC_DV) {
    caiDat.dv[dv].khoa = $("o-khoa-" + dv).value.trim();
    caiDat.dv[dv].giong = $("o-giong-" + dv).value || caiDat.dv[dv].giong;
  }
  for (const dv of THU_TU) if ($("bat-" + dv)) caiDat.bat[dv] = $("bat-" + dv).checked;
  for (const [id, duong] of O_CHU) dat(duong, $(id).value.trim());
  caiDat.dv.edge.giong = $("o-giong-edge").value || caiDat.dv.edge.giong;
  caiDat.dv.vt.giong = $("o-giong-vt").value || caiDat.dv.vt.giong;
  caiDat.dv.fpt.giong = $("o-giong-fpt").value || caiDat.dv.fpt.giong;
  caiDat.dv.az.vung = $("o-vung-az").value.trim().toLowerCase().replace(/\s+/g, "") || "southeastasia";
  caiDat.dv.el.mh = $("o-mh-el").value;
  caiDat.dp.azDichVung = $("o-dp-az-dich-vung").value.trim().toLowerCase().replace(/\s+/g, "");
  caiDat.dp.cf = $("o-dp-cf").checked;
  caiDat.dp.azNghe = $("o-dp-az-nghe").checked;
  // Đổi mã Gemini → quên ghi nhớ "loại Gemini nào hết lượt hôm nay" (đó là của mã cũ), để thử ngay mã mới
  if (lamSachMa($("o-khoa").value) !== caiDat.khoa || lamSachMa($("o-khoa-doc").value) !== caiDat.khoaDoc) {
    quenGhiNhoGemini();
    nhat("Đã đổi mã Gemini → thử lại mọi loại Gemini với mã mới");
  }
  caiDat.khoa = lamSachMa($("o-khoa").value);
  caiDat.khoaDoc = lamSachMa($("o-khoa-doc").value);
  ghiTrangDongBo({ mk: $("o-mk-dong-bo").value, tuDong: $("o-tu-dong-bo").checked });
  caiDat.dichBang = $("bat-deepseek").checked ? "deepseek" : "gemini";
  caiDat.giong = $("o-giong").value;
  luuCaiDat();
  // Lưu cài đặt = có thể vừa mua gói/đổi mã → quên ghi nhớ "hết lượt tháng này", lần sau thử lại
  try { localStorage.removeItem("phaha-dv-het-thang"); } catch {}
}

// Vì sao không dùng được máy chủ PHAHA (Fish, Edge, Cloudflare); "" = dùng được
export function lyDoKhongMayChu() {
  if (!coMayChu()) return "chưa có máy chủ PHAHA";
  if (!daDangNhap()) return "cần đăng nhập app PHAHA (tab Lịch việc)";
  if (!dungDuocMayChu()) return "chỉ chủ app dùng được (qua máy chủ PHAHA)";
  return "";
}
// Chữ nhỏ cạnh tên mỗi dịch vụ đọc: sẵn sàng / thiếu gì
export function trangThai(dv) {
  if (dv !== "may" && !caiDat.bat[dv]) return "⏸ đang tắt";
  const khongMC = lyDoKhongMayChu();
  const thieu = {
    el: !caiDat.dv.el.khoa && "chưa có mã",
    gemini: !caiDat.khoa && !caiDat.khoaDoc && "chưa có mã Gemini",
    fish: (!caiDat.dv.fish.khoa && "chưa có mã") || khongMC,
    az: !caiDat.dv.az.khoa && "chưa có mã",
    gc: !caiDat.dv.gc.khoa && !caiDat.khoa && "chưa có mã",
    edge: khongMC,
    fpt: !caiDat.dv.fpt.khoa && "chưa có mã",
    vt: !caiDat.dv.vt.khoa && "chưa có mã",
  }[dv];
  if (thieu) return "⚠️ " + thieu;
  if (dvHetThang(dv)) return "⛔ hết lượt tháng này";
  return dv === "gemini" && caiDat.khoaDoc ? "✅ sẵn sàng (mã riêng)" : "✅ sẵn sàng";
}

export function hienTrangThai() {
  hienODich();
  for (const dv of THU_TU) if ($("tt-" + dv)) $("tt-" + dv).textContent = trangThai(dv);
  veGiongNhanh();
}

// Công tắc giọng đọc ngay ở màn hình chính (mục 🎙️ Giọng đọc cho video này) – chọn nhanh cho từng video
export function veGiongNhanh() {
  const o = $("ds-giong-nhanh");
  if (!o) return;
  o.textContent = "";
  for (const dv of THU_TU) {
    const nhan = document.createElement("label");
    nhan.className = "cong-tac";
    const hop = document.createElement("input");
    hop.type = "checkbox";
    hop.checked = dv === "may" || !!caiDat.bat[dv];
    hop.disabled = dv === "may";
    hop.addEventListener("change", () => {
      caiDat.bat[dv] = hop.checked;
      if ($("bat-" + dv)) $("bat-" + dv).checked = hop.checked;
      luuCaiDat();
      hienTrangThai();
    });
    const ten = document.createElement("span");
    ten.textContent = DICH_VU[dv].ten + (dv === "may" ? " (luôn có, dự phòng cuối)" : tenGiong(dv) ? " · " + tenGiong(dv) : "");
    const tt = document.createElement("span");
    tt.className = "tt-nho";
    tt.textContent = dv === "may" ? "" : trangThai(dv);
    nhan.append(hop, ten, tt);
    o.append(nhan);
  }
}

function veDsGiong(dv) {
  const o = $("o-giong-" + dv), c = caiDat.dv[dv];
  if (!c.ds.length) return;
  o.innerHTML = "";
  for (const g of c.ds) o.add(new Option(g.nhan, g.ten));
  o.value = c.giong || c.ds[0].ten;
}

// ----- Chuyên môn dịch (giống app PHA rednote), chủ đề, từ điển thuật ngữ, tự kiểm tra phụ đề -----
function hienKenh() {
  const k = KENH[caiDat.kenh] || KENH[KENH_MAC_DINH];
  $("o-kenh").value = caiDat.kenh;
  $("kenh-mo-ta").textContent = k.description;
  $("kenh-quy-tac").textContent = k.rules || "Kênh này không có quy tắc riêng – dịch sát nghĩa thông thường.";
  const o = $("o-quy-tac-rieng");
  if (document.activeElement !== o) o.value = caiDat.quyTacRieng[caiDat.kenh] || "";
}
const O_DICH = [["o-chu-de", "chuDe"], ["o-tu-dien", "tuDien"]];
function hienODich() {
  for (const [id, khoa] of O_DICH) {
    const o = $(id);
    if (o && document.activeElement !== o && o.value.trim() !== (caiDat[khoa] || "")) o.value = caiDat[khoa] || "";
  }
  $("o-kiem-pd").checked = !!caiDat.kiemPd;
  hienKenh();
}

// Gắn sự kiện cho hộp cài đặt và các ô ở màn hình chính (gọi 1 lần lúc mở app)
export function khoiDongCaiDat() {
  $("nut-cai-dat").addEventListener("click", moCaiDat);
  $("hop-cai-dat").addEventListener("close", () => {
    layTuForm();
    veGiongNhanh();
    // Bấm Lưu = có thể vừa nâng mã Gemini lên trả phí → quên giới hạn Gemini đã ghi nhớ, lần chạy sau thử lại thật
    if ($("hop-cai-dat").returnValue === "luu") quenGhiNhoGemini(true);
  });
  document.querySelectorAll(".dv-doc input").forEach((o) => o.addEventListener("change", () => { layTuForm(); hienTrangThai(); }));

  for (const dv of CAC_DV) {
    const nut = $("nut-tai-giong-" + dv);
    nut.addEventListener("click", async () => {
      layTuForm();
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

  // Chủ đề & từ điển thuật ngữ – lưu ngay khi gõ
  for (const [id, khoa] of O_DICH) {
    const o = $(id);
    o.value = caiDat[khoa] || "";
    o.addEventListener("input", () => { caiDat[khoa] = o.value.trim(); luuCaiDat(); });
  }
  $("o-kiem-pd").checked = !!caiDat.kiemPd;
  $("o-kiem-pd").addEventListener("change", (e) => { caiDat.kiemPd = e.target.checked; luuCaiDat(); });
  // Chọn kênh, xem quy tắc kênh, ghi quy tắc riêng cho từng kênh
  const chon = $("o-kenh"), ds = Object.entries(KENH);
  for (const [nhan, phan] of [["Hệ sinh thái PhaHa", ds.slice(0, 8)], ["Chuyên môn khác", ds.slice(8)]]) {
    const nhom = document.createElement("optgroup");
    nhom.label = nhan;
    for (const [id, k] of phan) nhom.append(new Option(k.label, id));
    chon.append(nhom);
  }
  chon.addEventListener("change", () => { caiDat.kenh = chon.value; luuCaiDat(); hienKenh(); });
  $("o-quy-tac-rieng").addEventListener("input", (e) => { caiDat.quyTacRieng[caiDat.kenh] = e.target.value.slice(0, 3000); luuCaiDat(); });
  $("nut-xoa-quy-tac").addEventListener("click", () => { caiDat.quyTacRieng[caiDat.kenh] = ""; luuCaiDat(); hienKenh(); });
  hienKenh();
}
