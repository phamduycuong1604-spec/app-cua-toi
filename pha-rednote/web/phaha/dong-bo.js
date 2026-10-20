// =====================================================
// ĐỒNG BỘ CÀI ĐẶT GIỮA CÁC MÁY (qua tài khoản PHAHA)
// Trước khi gửi lên, cài đặt (có cả các mã API) được KHOÁ bằng "mật khẩu đồng bộ"
// do người dùng tự đặt (PBKDF2 + AES-GCM ngay trên máy) → máy chủ chỉ giữ bản đã khoá,
// không đọc được. Máy khác nhập đúng mật khẩu đó mới mở ra được.
// =====================================================
const PHAN = "dich-video";
const VONG = 250000;
const ma = new TextEncoder(), giai = new TextDecoder();
const sangB64=b=>{const bytes=new Uint8Array(b);let s="";for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(s);};
const tuB64 = (s) => Uint8Array.from(atob(s), (k) => k.charCodeAt(0));

async function taoKhoa(matKhau, muoi, vong=VONG) {
  const goc = await crypto.subtle.importKey("raw", ma.encode(matKhau), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: muoi, iterations: vong, hash: "SHA-256" }, goc, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function khoaLai(duLieu, matKhau) {
  if(String(matKhau).length<10)throw Error("Mật khẩu đồng bộ cần ít nhất 10 ký tự.");
  const muoi = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const khoa = await taoKhoa(matKhau, muoi);
  // nén trước khi khoá cho nhẹ (logo, danh sách giọng…)
  const nen = await new Response(new Blob([ma.encode(JSON.stringify(duLieu))]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
  const du = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, khoa, nen);
  return { pb: 2, muoi: sangB64(muoi), iv: sangB64(iv), du: sangB64(du) };
}

export async function moKhoa(goi, matKhau) {
  if(![1,2].includes(goi?.pb)||typeof goi.du!=="string"||goi.du.length>5000000)throw Error("Bản đồng bộ không hợp lệ.");
  let nen;
  try {
    const khoa = await taoKhoa(matKhau, tuB64(goi.muoi),goi.pb===1?150000:VONG);
    nen = await crypto.subtle.decrypt({ name: "AES-GCM", iv: tuB64(goi.iv) }, khoa, tuB64(goi.du));
  } catch {
    throw new Error("Sai mật khẩu đồng bộ (phải nhập giống hệt máy đã gửi lên).");
  }
  const chu = await new Response(new Blob([nen]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  return JSON.parse(giai.decode(chu));
}

async function goi(mayChu, ve, duong, tuyChon = {}) {
  const r = await fetch(mayChu + duong, { ...tuyChon, headers: { "Content-Type": "application/json", ...tuyChon.headers } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(r.status === 401 ? "Phiên app đã hết hạn. Đăng nhập lại tài khoản đang mở app." : j.loi || `Máy chủ báo lỗi ${r.status}`);
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

// Các bản cũ trên tài khoản (máy chủ giữ 10 bản gần nhất, vẫn ở dạng đã khoá)
export async function layLichSuMayChu(mayChu, ve) {
  const { banLuu = [] } = await goi(mayChu, ve, "/du-lieu/lich-su?phan=" + PHAN);
  const ra = [];
  for (const b of banLuu.filter((x) => x.phan === PHAN).slice(0, 10)) {
    try { ra.push({ luc: b.luc, goi: (await goi(mayChu, ve, "/du-lieu/lich-su/" + b.ma)).giaTri }); } catch {}
  }
  return ra;
}
