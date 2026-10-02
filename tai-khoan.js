// =====================================================
// TÀI KHOẢN + ĐỒNG BỘ DỮ LIỆU LÊN MÁY CHỦ
//
// - Chưa đăng nhập → hiện màn hình đăng nhập
// - Dữ liệu vẫn lưu trong máy (để mở nhanh, dùng được khi mất mạng),
//   mỗi lần thay đổi thì tự gửi lên máy chủ; mở app thì tải bản mới nhất về
// - File này chạy TRƯỚC app.js, nên chỉ khai báo hàm; phần khởi động
//   chạy sau khi mọi file đã tải xong (sự kiện DOMContentLoaded)
// =====================================================

// Có máy chủ thì mới dùng tài khoản (may-chu.js)
const CO_TAI_KHOAN = typeof DIA_CHI_MAY_CHU === "string" && DIA_CHI_MAY_CHU !== "";

// Mỗi phần dữ liệu trên máy chủ ↔ tên "cuốn sổ" trong máy
const SO_CUA_PHAN = { viec: "danh-sach-viec", "thu-chi": "so-thu-chi", "cai-dat": "cai-dat" };

function veDangNhap() {
  return localStorage.getItem("ve-dang-nhap");
}

function thongTinToi() {
  return { ten: localStorage.getItem("ten-dang-nhap"), quanTri: localStorage.getItem("la-quan-tri") === "1" };
}


// ----- 1. GỌI MÁY CHỦ -----
// Tự kèm "vé" đăng nhập; vé hết hạn thì đưa về màn hình đăng nhập
async function goiMayChu(duongDan, { cach = "GET", than } = {}) {
  const ketQua = await fetch(DIA_CHI_MAY_CHU + duongDan, {
    method: cach,
    headers: {
      "Content-Type": "application/json",
      ...(veDangNhap() ? { Authorization: "Bearer " + veDangNhap() } : {}),
    },
    body: than === undefined ? undefined : JSON.stringify(than),
  });
  const duLieu = await ketQua.json().catch(() => ({}));
  if (ketQua.status === 401 && veDangNhap()) {
    localStorage.removeItem("ve-dang-nhap");
    hienManDangNhap(duLieu.loi);
  }
  if (!ketQua.ok) throw new Error(duLieu.loi || "Máy chủ báo lỗi " + ketQua.status);
  return duLieu;
}


// ----- 2. ĐỒNG BỘ DỮ LIỆU -----

// Danh sách phần đang chờ gửi lên (lưu lại để mất mạng/tắt app cũng không quên)
function docChoGui() {
  try {
    return JSON.parse(localStorage.getItem("cho-dong-bo")) || [];
  } catch (loi) {
    return [];
  }
}
function ghiChoGui(ds) {
  localStorage.setItem("cho-dong-bo", JSON.stringify(ds));
}

// app.js / thu-chi.js gọi hàm này mỗi khi lưu dữ liệu
let henGuiLen = null;
function daThayDoi(phan) {
  if (!CO_TAI_KHOAN || !veDangNhap()) return;
  const ds = docChoGui();
  if (!ds.includes(phan)) ghiChoGui([...ds, phan]);
  clearTimeout(henGuiLen);
  henGuiLen = setTimeout(guiLenTaiKhoan, 1500); // đợi bấm xong một loạt rồi mới gửi
}

// Gửi các phần đang chờ lên máy chủ
async function guiLenTaiKhoan() {
  if (!veDangNhap()) return;
  for (const phan of docChoGui()) {
    try {
      const giaTri = JSON.parse(localStorage.getItem(SO_CUA_PHAN[phan]) || "null");
      const { capNhat } = await goiMayChu("/du-lieu/" + phan, { cach: "PUT", than: { giaTri } });
      localStorage.setItem("phien-ban-" + phan, capNhat);
      ghiChoGui(docChoGui().filter((p) => p !== phan));
    } catch (loi) {
      return; // mất mạng: để dành lần sau
    }
  }
}

// Tải bản mới nhất từ máy chủ (ví dụ vừa sửa trên máy khác)
async function taiVeTuTaiKhoan() {
  if (!veDangNhap()) return;
  let duLieu;
  try {
    duLieu = await goiMayChu("/du-lieu");
  } catch (loi) {
    return; // mất mạng: dùng tạm dữ liệu trong máy
  }
  const choGui = docChoGui();
  let coMoi = false;
  Object.keys(SO_CUA_PHAN).forEach((phan) => {
    const tuMayChu = duLieu[phan];
    if (!tuMayChu || choGui.includes(phan)) return; // máy này đang có sửa đổi chưa gửi → giữ của máy này
    if (tuMayChu.capNhat > Number(localStorage.getItem("phien-ban-" + phan) || 0)) {
      localStorage.setItem(SO_CUA_PHAN[phan], JSON.stringify(tuMayChu.giaTri));
      localStorage.setItem("phien-ban-" + phan, tuMayChu.capNhat);
      coMoi = true;
    }
  });
  if (coMoi) apDungDuLieuMoi();
}

// Đọc lại sổ và vẽ lại màn hình (các biến/hàm này nằm trong app.js, thu-chi.js)
function apDungDuLieuMoi() {
  danhSachViec = docDanhSach();
  danhSachThuChi = docThuChi();
  caiDat = docCaiDat();
  veTatCa();
  veThuChi();
  dongBoMayChu(); // cập nhật lịch nhắc trên máy chủ nhắc giờ
}


// ----- 3. MÀN HÌNH ĐĂNG NHẬP -----

const manDangNhap = document.getElementById("man-dang-nhap");
const formDangNhap = document.getElementById("form-dang-nhap");
let laKhoiTao = false; // true = máy chủ chưa có ai → tạo tài khoản quản trị

async function hienManDangNhap(thongBao) {
  manDangNhap.classList.remove("an");
  document.getElementById("dn-loi").textContent = thongBao || "";
  try {
    const { daCoNguoiDung } = await goiMayChu("/tai-khoan/trang-thai");
    laKhoiTao = !daCoNguoiDung;
  } catch (loi) {
    document.getElementById("dn-loi").textContent = "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.";
  }
  document.getElementById("dn-tieu-de").textContent = laKhoiTao ? "Tạo tài khoản quản trị" : "Đăng nhập";
  document.getElementById("dn-goi-y").textContent = laKhoiTao
    ? "Máy chủ chưa có tài khoản nào. Tài khoản bạn tạo bây giờ sẽ là quản trị viên, dùng để cấp tài khoản cho người khác."
    : "Chưa có tài khoản? Hãy nhờ quản trị viên cấp cho bạn.";
  document.getElementById("dn-khoi-tao").classList.toggle("an", !laKhoiTao);
  document.getElementById("dn-nut").textContent = laKhoiTao ? "Tạo tài khoản" : "Đăng nhập";
}

formDangNhap.onsubmit = async (suKien) => {
  suKien.preventDefault();
  const loi = document.getElementById("dn-loi");
  const ten = document.getElementById("dn-ten").value.trim();
  const matKhau = document.getElementById("dn-mat-khau").value;
  if (laKhoiTao && matKhau !== document.getElementById("dn-mat-khau-2").value) {
    loi.textContent = "Hai lần nhập mật khẩu chưa giống nhau.";
    return;
  }

  const nut = document.getElementById("dn-nut");
  nut.disabled = true;
  loi.textContent = "";
  try {
    const kq = await goiMayChu(laKhoiTao ? "/tai-khoan/khoi-tao" : "/tai-khoan/dang-nhap", {
      cach: "POST",
      than: { ten, matKhau, maKhoiTao: document.getElementById("dn-ma-khoi-tao").value },
    });
    await batDauPhienMoi(kq);
  } catch (e) {
    loi.textContent = e.message === "Failed to fetch" ? "Không kết nối được máy chủ." : e.message;
  }
  nut.disabled = false;
};

// Đăng nhập thành công → lấy dữ liệu của tài khoản về máy
async function batDauPhienMoi({ ve, ten, quanTri }) {
  const nguoiTruoc = localStorage.getItem("ten-dang-nhap");
  localStorage.setItem("ve-dang-nhap", ve);
  localStorage.setItem("ten-dang-nhap", ten);
  localStorage.setItem("la-quan-tri", quanTri ? "1" : "0");

  const duLieu = await goiMayChu("/du-lieu");
  const mayChuTrong = Object.keys(duLieu).length === 0;

  // Dữ liệu đang có sẵn trong máy từ trước khi có tài khoản (hoặc của chính người này)
  const soViec = (JSON.parse(localStorage.getItem("danh-sach-viec") || "[]") || []).length;
  const soKhoan = (JSON.parse(localStorage.getItem("so-thu-chi") || "[]") || []).length;
  const duLieuCuCuaMay = (!nguoiTruoc || nguoiTruoc === ten) && (soViec || soKhoan);

  if (mayChuTrong && duLieuCuCuaMay &&
      confirm(`Trên máy đang có ${soViec} việc và ${soKhoan} khoản thu chi.\nĐưa tất cả lên tài khoản "${ten}"?`)) {
    // Giữ dữ liệu trong máy và gửi lên
    ghiChoGui(Object.keys(SO_CUA_PHAN).filter((phan) => localStorage.getItem(SO_CUA_PHAN[phan])));
    await guiLenTaiKhoan();
  } else {
    // Dùng dữ liệu của tài khoản
    Object.values(SO_CUA_PHAN).forEach((so) => localStorage.removeItem(so));
    Object.keys(SO_CUA_PHAN).forEach((phan) => {
      localStorage.removeItem("phien-ban-" + phan);
      if (duLieu[phan]) {
        localStorage.setItem(SO_CUA_PHAN[phan], JSON.stringify(duLieu[phan].giaTri));
        localStorage.setItem("phien-ban-" + phan, duLieu[phan].capNhat);
      }
    });
    ghiChoGui([]);
  }
  location.reload(); // mở lại app với dữ liệu của tài khoản
}

// Đăng xuất: xóa dữ liệu khỏi máy này (dữ liệu vẫn còn trên tài khoản)
async function dangXuat() {
  if (docChoGui().length) await guiLenTaiKhoan();
  if (docChoGui().length &&
      !confirm("Còn thay đổi chưa gửi được lên tài khoản (có thể do mất mạng). Đăng xuất sẽ mất các thay đổi này. Vẫn đăng xuất?")) {
    return;
  }
  try {
    await goiMayChu("/tai-khoan/dang-xuat", { cach: "POST" });
  } catch (loi) {}
  // Tắt các lần nhắc của tài khoản này trên máy chủ nhắc giờ
  danhSachViec = [];
  if (typeof daDangKyMayChu === "function" && daDangKyMayChu()) await guiLenMayChu();

  [
    ...Object.values(SO_CUA_PHAN),
    ...Object.keys(SO_CUA_PHAN).map((phan) => "phien-ban-" + phan),
    "cho-dong-bo", "ve-dang-nhap", "la-quan-tri", "link-sheet",
  ].forEach((khoa) => localStorage.removeItem(khoa));
  location.reload();
}


// ----- 4. KHỞI ĐỘNG -----
document.addEventListener("DOMContentLoaded", () => {
  if (!CO_TAI_KHOAN) return;
  if (!veDangNhap()) {
    hienManDangNhap();
    return;
  }
  guiLenTaiKhoan().then(taiVeTuTaiKhoan);
  // Mở lại app từ nền → lấy bản mới; có mạng trở lại → gửi phần còn chờ
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) guiLenTaiKhoan().then(taiVeTuTaiKhoan);
  });
  window.addEventListener("online", guiLenTaiKhoan);
});
