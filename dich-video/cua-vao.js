// =====================================================
// CỬA VÀO: chỉ tài khoản do chủ app cấp (còn hạn dùng) mới dùng được app dịch video
// - Chưa đăng nhập / tài khoản hết hạn → màn hình đăng nhập phủ kín app
// - Mỗi lần mở app và mỗi lần bấm Bắt đầu: hỏi lại máy chủ (chủ app vừa gia hạn / thu hồi là có hiệu lực ngay)
// - Đăng nhập dùng chung với app PHAHA (cùng tài khoản, cùng vé đăng nhập trên máy này)
// =====================================================
import { $, coMayChu, mayChu, veDangNhap, nhat } from "./nen.js";

const ngay = (ms) => new Date(ms).toLocaleDateString("vi-VN");
const hanLuu = () => { try { return Number(localStorage.getItem("han-dung")) || 0; } catch { return 0; } };
function ghiTaiKhoan({ ve, ten, quanTri, hetHan }) {
  try {
    if (ve) localStorage.setItem("ve-dang-nhap", ve);
    if (ten) localStorage.setItem("ten-dang-nhap", ten);
    localStorage.setItem("la-quan-tri", quanTri ? "1" : "0");
    hetHan ? localStorage.setItem("han-dung", String(hetHan)) : localStorage.removeItem("han-dung");
  } catch {}
}
function xoaTaiKhoan() {
  try { for (const k of ["ve-dang-nhap", "la-quan-tri", "han-dung"]) localStorage.removeItem(k); } catch {}
}

function moCua() {
  $("man-dang-nhap").classList.add("an");
  let ten = "";
  try { ten = localStorage.getItem("ten-dang-nhap") || ""; } catch {}
  const han = hanLuu();
  $("tt-tai-khoan").querySelector("span").textContent = `👤 ${ten || "đã đăng nhập"}${han ? ` · dùng đến ${ngay(han)}` : ""}`;
  $("tt-tai-khoan").classList.remove("an");
}
function dongCua(lyDo) {
  $("man-dang-nhap").classList.remove("an");
  $("tt-tai-khoan").classList.add("an");
  $("dn-bao").textContent = lyDo || "";
  $("dn-bao").classList.toggle("an", !lyDo);
  try { $("o-dn-ten").value ||= localStorage.getItem("ten-dang-nhap") || ""; } catch {}
}

// Hỏi máy chủ tài khoản đang đăng nhập còn dùng được không. true = được vào.
// Mất mạng / máy chủ không trả lời → tin hạn dùng đã lưu trên máy (không khoá oan khi mạng chập chờn)
export async function kiemTraVao() {
  if (!coMayChu()) return true; // bản chạy không có máy chủ PHAHA (vd tự cài riêng) → không khoá
  if (!veDangNhap()) { dongCua(""); return false; }
  try {
    const r = await fetch(mayChu() + "/tai-khoan/toi", { cache: "no-store", headers: { Authorization: "Bearer " + veDangNhap() } });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 || r.status === 403) {
      xoaTaiKhoan();
      dongCua(j.loi || "Phiên đăng nhập đã hết hạn, hãy đăng nhập lại.");
      return false;
    }
    if (r.ok) ghiTaiKhoan(j);
  } catch {}
  const han = hanLuu();
  if (han && han <= Date.now()) {
    dongCua(`Tài khoản đã hết hạn dùng từ ngày ${ngay(han)}. Liên hệ chủ app để gia hạn.`);
    return false;
  }
  moCua();
  return true;
}

async function dangNhap() {
  const nut = $("nut-dang-nhap");
  const ten = $("o-dn-ten").value.trim().toLowerCase(), matKhau = $("o-dn-mk").value;
  if (!ten || !matKhau) return dongCua("Nhập tên đăng nhập và mật khẩu.");
  nut.disabled = true;
  nut.textContent = "⏳ Đang đăng nhập…";
  try {
    const r = await fetch(mayChu() + "/tai-khoan/dang-nhap", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ten, matKhau }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.loi || `Máy chủ báo lỗi ${r.status}`);
    ghiTaiKhoan(j);
    $("o-dn-mk").value = "";
    nhat(`👤 Đăng nhập: ${j.ten}${j.hetHan ? ` (dùng đến ${ngay(j.hetHan)})` : ""}`);
    moCua();
  } catch (loi) {
    dongCua(loi.message === "Failed to fetch" ? "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại." : loi.message);
  } finally {
    nut.disabled = false;
    nut.textContent = "Đăng nhập";
  }
}

async function dangXuat() {
  if (!confirm("Đăng xuất khỏi app trên máy này?")) return;
  fetch(mayChu() + "/tai-khoan/dang-xuat", { method: "POST", headers: { Authorization: "Bearer " + veDangNhap() } }).catch(() => {});
  xoaTaiKhoan();
  dongCua("");
}

export function khoiDongCuaVao() {
  $("nut-dang-nhap").addEventListener("click", dangNhap);
  $("o-dn-mk").addEventListener("keydown", (e) => { if (e.key === "Enter") dangNhap(); });
  $("nut-dang-xuat").addEventListener("click", dangXuat);
  // Hết hạn sẵn trên máy → khoá ngay, không chờ hỏi máy chủ
  const han = hanLuu();
  if (coMayChu() && (!veDangNhap() || (han && han <= Date.now()))) dongCua(veDangNhap() ? `Tài khoản đã hết hạn dùng từ ngày ${ngay(han)}. Liên hệ chủ app để gia hạn.` : "");
  return kiemTraVao();
}
