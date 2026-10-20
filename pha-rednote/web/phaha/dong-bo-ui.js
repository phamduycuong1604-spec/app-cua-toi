// =====================================================
// ĐỒNG BỘ CÀI ĐẶT GIỮA CÁC MÁY (mã hoá trong dong-bo.js, gửi lên tài khoản PHAHA)
// Ghi nhớ: lucMayChu = mốc bản trên máy chủ lần cuối máy này thấy/gửi; lucMay = mốc cài đặt máy này lúc đó
// → biết được bên nào đã đổi kể từ lần đồng bộ trước.
// Không đồng bộ: nhật ký, đếm lượt, ghi nhớ hết lượt (mỗi máy tự có).
// Nguyên tắc an toàn:
//  - Máy chưa đồng bộ lần nào + tài khoản đã có bản → LUÔN hỏi, không tự làm gì
//  - Tự động (mở app / lưu) chỉ chạy khi không làm giảm số mã; còn lại để người dùng bấm và chọn
//  - Trước khi thay cài đặt máy này luôn cất bản sao lưu (khôi phục được)
// =====================================================
import { $, caiDat, S, nhat, docLuu, ghiLuu, coMayChu, daDangNhap, mayChu, veDangNhap, moTaMay, theoDoiDoiCaiDat } from "./nen.js";
import { khoaLai, moKhoa, layTuMayChu, guiLenMayChu, layLichSuMayChu } from "./dong-bo.js";
import { layTuForm } from "./cai-dat-ui.js";

export const trangDongBo = () => docLuu("phaha-dv-dong-bo");
export function ghiTrangDongBo(them) {
  const d = { ...trangDongBo(), ...them };
  ghiLuu("phaha-dv-dong-bo", d);
  return d;
}
export function hienTrangDongBo(chu) {
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
// Đếm số mã API trong 1 bản cài đặt (để không bao giờ lặng lẽ thay bản nhiều mã bằng bản ít mã)
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
  const capNhat = await guiLenMayChu(mayChu(), veDangNhap(), await khoaLai(goiCaiDat(), d.mk));
  ghiTrangDongBo({ lucMayChu: capNhat, lucMay: caiDat.capNhat, lanCuoi: Date.now() });
  nhat("🔄 Đã gửi cài đặt máy này lên tài khoản");
}

// cheDo: "bam" (người dùng bấm nút), "mo" (vừa mở app), "luu" (vừa lưu cài đặt)
let dangDongBo = false;
async function dongBo(cheDo) {
  const d = trangDongBo();
  if (dangDongBo || !d.mk || !coMayChu() || !daDangNhap()) return;
  if (cheDo !== "bam" && d.tuDong === false) return;
  dangDongBo = true;
  const tuDong = cheDo !== "bam";
  try {
    const tren = await layTuMayChu(mayChu(), veDangNhap());
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
      if (cheDo === "mo" && S.tepVideo) return; // đang làm video thì không tải lại trang
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
async function hienBanKhoiPhuc() {
  layTuForm();
  const o = $("ds-khoi-phuc");
  o.innerHTML = "⏳ Đang tìm các bản cũ…";
  o.classList.remove("an");
  const ds = [];
  try { for (const b of JSON.parse(localStorage.getItem("phaha-dv-sao-luu") || "[]")) ds.push({ ...b, noi: "trên máy này" }); } catch {}
  const mk = trangDongBo().mk;
  if (mk && coMayChu() && daDangNhap()) {
    try {
      for (const b of await layLichSuMayChu(mayChu(), veDangNhap())) {
        try {
          const du = await moKhoa(b.goi, mk);
          ds.push({ luc: b.luc, caiDat: du.caiDat, logo: du.logo, noi: "trên tài khoản, từ " + (du.may || "máy khác") });
        } catch {}
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
}

export function khoiDongDongBo() {
  let hen = null;
  // Vừa lưu cài đặt (có thay đổi) → 3 giây sau gửi lên tài khoản
  theoDoiDoiCaiDat(() => { clearTimeout(hen); hen = setTimeout(() => dongBo("luu"), 3000); });
  $("nut-khoi-phuc-cd").addEventListener("click", hienBanKhoiPhuc);
  $("nut-dong-bo").addEventListener("click", async () => {
    layTuForm();
    if (!trangDongBo().mk) return alert("Đặt mật khẩu đồng bộ trước (tự đặt, nhập giống nhau ở mọi máy).");
    if (trangDongBo().mk.length < 6) return alert("Mật khẩu đồng bộ cần ít nhất 6 ký tự.");
    const nut = $("nut-dong-bo");
    nut.disabled = true;
    nut.textContent = "⏳ Đang đồng bộ…";
    clearTimeout(hen);
    await dongBo("bam");
    nut.disabled = false;
    nut.textContent = "🔄 Đồng bộ ngay";
  });
  setTimeout(() => dongBo("mo"), 1500); // mở app: có bản mới từ máy khác thì lấy về
}
