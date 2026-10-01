// =====================================================
// APP QUẢN LÝ CÔNG VIỆC HÀNG NGÀY
// Mỗi công việc là một "hộp" thông tin như sau:
//   { id, ten, ngay: "2026-10-01", gio: "08:30", ghiChu, xong: true/false }
// =====================================================


// ----- 1. LƯU VÀ ĐỌC DỮ LIỆU -----
// localStorage giống một "cuốn sổ" nằm sẵn trong trình duyệt:
// tắt app mở lại thì sổ vẫn còn.

const TEN_SO = "danh-sach-viec";

function docDanhSach() {
  try {
    return JSON.parse(localStorage.getItem(TEN_SO)) || [];
  } catch (loi) {
    return [];
  }
}

function luuDanhSach() {
  localStorage.setItem(TEN_SO, JSON.stringify(danhSachViec));
}

let danhSachViec = docDanhSach();
let idDangSua = null; // id của việc đang sửa (null = đang thêm mới)


// ----- 2. CÁC HÀM NHỎ VỀ NGÀY THÁNG -----

// Đổi một ngày thành chữ dạng "2026-10-01"
function ngayThanhChu(ngay) {
  const nam = ngay.getFullYear();
  const thang = String(ngay.getMonth() + 1).padStart(2, "0");
  const ngayTrongThang = String(ngay.getDate()).padStart(2, "0");
  return `${nam}-${thang}-${ngayTrongThang}`;
}

function homNay() {
  return ngayThanhChu(new Date());
}

// Hiện ngày kiểu Việt Nam, ví dụ: "Thứ Năm, 01/10/2026"
function ngayDeDoc(chuNgay) {
  const [nam, thang, ngay] = chuNgay.split("-").map(Number);
  const d = new Date(nam, thang - 1, ngay);
  const thu = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"][d.getDay()];
  return `${thu}, ${String(ngay).padStart(2, "0")}/${String(thang).padStart(2, "0")}/${nam}`;
}


// ----- 3. VẼ DANH SÁCH LÊN MÀN HÌNH -----

const khungDanhSach = document.getElementById("danh-sach");

// Sắp xếp: theo ngày, rồi theo giờ (việc không có giờ xếp cuối ngày)
function sapXep(ds) {
  return [...ds].sort((a, b) =>
    (a.ngay + (a.gio || "99")).localeCompare(b.ngay + (b.gio || "99"))
  );
}

function veDanhSach() {
  const ds = sapXep(danhSachViec);
  khungDanhSach.innerHTML = "";

  if (ds.length === 0) {
    khungDanhSach.innerHTML = `<p class="trong">Chưa có việc nào.<br>Bấm nút + để thêm.</p>`;
    return;
  }

  ds.forEach((viec) => khungDanhSach.appendChild(taoTheViec(viec)));
}

// Tạo "thẻ" hiển thị cho một công việc
function taoTheViec(viec) {
  const the = document.createElement("div");
  the.className = "viec" + (viec.xong ? " da-xong" : "");

  // Nút tròn để đánh dấu xong / chưa xong
  const nutTich = document.createElement("button");
  nutTich.className = "o-tich";
  nutTich.textContent = viec.xong ? "✓" : "";
  nutTich.setAttribute("aria-label", "Đánh dấu hoàn thành");
  nutTich.onclick = () => doiTrangThaiXong(viec.id);

  // Phần chữ: bấm vào để sửa
  const noiDung = document.createElement("div");
  noiDung.className = "noi-dung";
  noiDung.onclick = () => moKhungNhap(viec);

  const ten = document.createElement("div");
  ten.className = "ten";
  ten.textContent = viec.ten;
  noiDung.appendChild(ten);

  const gio = document.createElement("div");
  gio.className = "gio";
  gio.textContent = (viec.gio ? "🕒 " + viec.gio + " · " : "") + ngayDeDoc(viec.ngay);
  noiDung.appendChild(gio);

  if (viec.ghiChu) {
    const ghiChu = document.createElement("div");
    ghiChu.className = "ghi-chu";
    ghiChu.textContent = viec.ghiChu;
    noiDung.appendChild(ghiChu);
  }

  the.appendChild(nutTich);
  the.appendChild(noiDung);
  return the;
}


// ----- 4. THÊM / SỬA / XÓA / ĐÁNH DẤU XONG -----

function doiTrangThaiXong(id) {
  const viec = danhSachViec.find((v) => v.id === id);
  viec.xong = !viec.xong;
  luuDanhSach();
  veDanhSach();
}

function xoaViec(id) {
  danhSachViec = danhSachViec.filter((v) => v.id !== id);
  luuDanhSach();
  veDanhSach();
}


// ----- 5. KHUNG NHẬP (thêm hoặc sửa) -----

const khungNhap = document.getElementById("khung-nhap");
const nenMo = document.getElementById("nen-mo");
const oTen = document.getElementById("o-ten");
const oNgay = document.getElementById("o-ngay");
const oGio = document.getElementById("o-gio");
const oGhiChu = document.getElementById("o-ghi-chu");
const nutXoa = document.getElementById("nut-xoa");

// viec = null nghĩa là thêm mới; có viec nghĩa là sửa việc đó
function moKhungNhap(viec) {
  idDangSua = viec ? viec.id : null;
  document.getElementById("tieu-de-khung").textContent = viec ? "Sửa công việc" : "Thêm việc mới";
  oTen.value = viec ? viec.ten : "";
  oNgay.value = viec ? viec.ngay : homNay();
  oGio.value = viec ? viec.gio : "";
  oGhiChu.value = viec ? viec.ghiChu : "";
  nutXoa.classList.toggle("an", !viec); // chỉ hiện nút Xóa khi đang sửa

  khungNhap.classList.remove("an");
  nenMo.classList.remove("an");
  if (!viec) oTen.focus();
}

function dongKhungNhap() {
  khungNhap.classList.add("an");
  nenMo.classList.add("an");
}

// Bấm "Lưu"
khungNhap.onsubmit = (suKien) => {
  suKien.preventDefault(); // không cho trang tải lại

  const thongTin = {
    ten: oTen.value.trim(),
    ngay: oNgay.value,
    gio: oGio.value,
    ghiChu: oGhiChu.value.trim(),
  };
  if (!thongTin.ten) return;

  if (idDangSua) {
    // Sửa: ghi đè thông tin mới lên việc cũ
    const viec = danhSachViec.find((v) => v.id === idDangSua);
    Object.assign(viec, thongTin);
  } else {
    // Thêm mới: tạo id riêng dựa trên thời điểm hiện tại
    danhSachViec.push({ id: String(Date.now()), xong: false, ...thongTin });
  }

  luuDanhSach();
  veDanhSach();
  dongKhungNhap();
};

nutXoa.onclick = () => {
  if (confirm("Xóa công việc này?")) {
    xoaViec(idDangSua);
    dongKhungNhap();
  }
};

document.getElementById("nut-huy").onclick = dongKhungNhap;
nenMo.onclick = dongKhungNhap;
document.getElementById("nut-them").onclick = () => moKhungNhap(null);


// ----- 6. KHỞI ĐỘNG APP -----
document.getElementById("ngay-hien-tai").textContent = ngayDeDoc(homNay());
veDanhSach();
