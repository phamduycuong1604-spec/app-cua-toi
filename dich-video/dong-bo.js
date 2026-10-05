// =====================================================
// ĐỒNG BỘ CÀI ĐẶT GIỮA CÁC MÁY (qua tài khoản PHAHA)
// Trước khi gửi lên, cài đặt (có cả các mã API) được KHOÁ bằng "mật khẩu đồng bộ"
// do người dùng tự đặt (PBKDF2 + AES-GCM ngay trên máy) → máy chủ chỉ giữ bản đã khoá,
// không đọc được. Máy khác nhập đúng mật khẩu đó mới mở ra được.
// =====================================================
const PHAN = "dich-video";
const VONG = 150000;
const ma = new TextEncoder(), giai = new TextDecoder();
const sangB64 = (b) => btoa(String.fromCharCode(...new Uint8Array(b)));
const tuB64 = (s) => Uint8Array.from(atob(s), (k) => k.charCodeAt(0));

async function taoKhoa(matKhau, muoi) {
  const goc = await crypto.subtle.importKey("raw", ma.encode(matKhau), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: muoi, iterations: VONG, hash: "SHA-256" }, goc, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function khoaLai(duLieu, matKhau) {
  const muoi = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const khoa = await taoKhoa(matKhau, muoi);
  // nén trước khi khoá cho nhẹ (logo, danh sách giọng…)
  const nen = await new Response(new Blob([ma.encode(JSON.stringify(duLieu))]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
  const du = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, khoa, nen);
  return { pb: 1, muoi: sangB64(muoi), iv: sangB64(iv), du: sangB64(du) };
}

export async function moKhoa(goi, matKhau) {
  let nen;
  try {
    const khoa = await taoKhoa(matKhau, tuB64(goi.muoi));
    nen = await crypto.subtle.decrypt({ name: "AES-GCM", iv: tuB64(goi.iv) }, khoa, tuB64(goi.du));
  } catch {
    throw new Error("Sai mật khẩu đồng bộ (phải nhập giống hệt máy đã gửi lên).");
  }
  const chu = await new Response(new Blob([nen]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  return JSON.parse(giai.decode(chu));
}

async function goi(mayChu, ve, duong, tuyChon = {}) {
  const r = await fetch(mayChu + duong, { ...tuyChon, headers: { "Content-Type": "application/json", Authorization: "Bearer " + ve, ...tuyChon.headers } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(r.status === 401 ? "Phiên đăng nhập PHAHA đã hết hạn – mở tab Lịch việc để đăng nhập lại." : j.loi || `Máy chủ báo lỗi ${r.status}`);
  return j;
}

// Lấy bản trên máy chủ: { goi, capNhat } hoặc null nếu chưa có
export async function layTuMayChu(mayChu, ve) {
  const j = await goi(mayChu, ve, "/du-lieu");
  return j[PHAN] ? { goi: j[PHAN].giaTri, capNhat: j[PHAN].capNhat } : null;
}

// Gửi bản đã khoá lên, trả về mốc cập nhật của máy chủ
export async function guiLenMayChu(mayChu, ve, goiDaKhoa) {
  const j = await goi(mayChu, ve, "/du-lieu/" + PHAN, { method: "PUT", body: JSON.stringify({ giaTri: goiDaKhoa }) });
  return j.capNhat;
}
