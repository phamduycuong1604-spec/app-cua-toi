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

// Các phần là danh sách mục (gộp từng mục); "cai-dat" thì lấy bản mới nhất
const PHAN_DANH_SACH = ["viec", "thu-chi"];
const BO_QUA_KHI_SO = ["capNhatLuc", "daNhac", "daNhacGiua", "daNhacKetThuc"]; // trạng thái riêng từng máy

function docSo(so) {
  try {
    return JSON.parse(localStorage.getItem(so));
  } catch (loi) {
    return null;
  }
}

// Dữ liệu một phần trong máy, dạng { muc, daXoa }
function docPhanTrongMay(phan) {
  return { muc: chuanHoaPhan(docSo(SO_CUA_PHAN[phan])).muc, daXoa: docSo("da-xoa-" + phan) || [] };
}
function ghiPhanVaoMay(phan, { muc, daXoa }) {
  localStorage.setItem(SO_CUA_PHAN[phan], JSON.stringify(muc));
  localStorage.setItem("da-xoa-" + phan, JSON.stringify(daXoa));
}

// Gọi TRƯỚC khi lưu (app.js, thu-chi.js): so với bản đã lưu để biết
// mục nào vừa thêm/sửa (đóng dấu thời gian) và mục nào vừa xóa (ghi giấy báo xóa)
function danhDauThayDoi(phan, dsMoi) {
  const bayGio = Date.now();
  const cu = docPhanTrongMay(phan);
  const theoId = new Map(cu.muc.map((x) => [x.id, x]));
  const gon = (x) => JSON.stringify(x, (khoa, giaTri) => (BO_QUA_KHI_SO.includes(khoa) ? undefined : giaTri));
  dsMoi.forEach((x) => {
    const truoc = theoId.get(x.id);
    if (!truoc || gon(truoc) !== gon(x)) x.capNhatLuc = bayGio;
  });
  const conLai = new Set(dsMoi.map((x) => x.id));
  const daXoa = [...cu.daXoa, ...cu.muc.filter((x) => !conLai.has(x.id)).map((x) => ({ id: x.id, luc: bayGio }))];
  localStorage.setItem("da-xoa-" + phan, JSON.stringify(daXoa));
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

// Gửi các phần đang chờ lên máy chủ. Máy chủ GỘP với bản của nó rồi trả về bản đã gộp.
let dangGui = false;
async function guiLenTaiKhoan() {
  if (!veDangNhap() || dangGui) return;
  dangGui = true;
  let coMoi = false;
  try {
    for (const phan of docChoGui()) {
      const laDanhSach = PHAN_DANH_SACH.includes(phan);
      const daGui = laDanhSach ? docPhanTrongMay(phan) : docSo(SO_CUA_PHAN[phan]);
      const chuDaGui = JSON.stringify(daGui);
      const kq = await goiMayChu("/du-lieu/" + phan, { cach: "PUT", than: { giaTri: daGui } });
      localStorage.setItem("phien-ban-" + phan, kq.capNhat);

      // Trong lúc gửi mà người dùng sửa tiếp → giữ "chờ gửi" để gửi lần nữa
      const hienTai = laDanhSach ? docPhanTrongMay(phan) : docSo(SO_CUA_PHAN[phan]);
      const suaTrongLucGui = JSON.stringify(hienTai) !== chuDaGui;
      if (laDanhSach) {
        const daGop = gopPhan(kq.giaTri, hienTai);
        if (JSON.stringify(daGop.muc) !== JSON.stringify(hienTai.muc)) coMoi = true;
        ghiPhanVaoMay(phan, daGop);
      }
      if (!suaTrongLucGui) ghiChoGui(docChoGui().filter((p) => p !== phan));
    }
  } catch (loi) {
    // mất mạng: để dành lần sau
  }
  dangGui = false;
  if (coMoi) apDungDuLieuMoi();
  if (docChoGui().length && navigator.onLine) {
    clearTimeout(henGuiLen);
    henGuiLen = setTimeout(guiLenTaiKhoan, 3000);
  }
}

// Tải bản mới nhất từ máy chủ (ví dụ vừa sửa trên máy khác) và GỘP với bản trong máy
async function taiVeTuTaiKhoan() {
  if (!veDangNhap()) return;
  let duLieu;
  try {
    duLieu = await goiMayChu("/du-lieu");
  } catch (loi) {
    return; // mất mạng: dùng tạm dữ liệu trong máy
  }
  let coMoi = false;
  const canGui = [];
  PHAN_DANH_SACH.forEach((phan) => {
    const trongMay = docPhanTrongMay(phan);
    const tuMayChu = duLieu[phan] ? chuanHoaPhan(duLieu[phan].giaTri) : { muc: [], daXoa: [] };
    const daGop = gopPhan(tuMayChu, trongMay);
    if (JSON.stringify(daGop.muc) !== JSON.stringify(trongMay.muc)) coMoi = true;
    if (JSON.stringify(daGop) !== JSON.stringify(gopPhan(tuMayChu, { muc: [], daXoa: [] }))) canGui.push(phan); // máy này có thứ máy chủ chưa có
    ghiPhanVaoMay(phan, daGop);
  });
  // Cài đặt: lấy bản mới hơn (nếu máy này không có sửa đổi chưa gửi)
  const caiDatMayChu = duLieu["cai-dat"];
  if (caiDatMayChu && !docChoGui().includes("cai-dat") &&
      caiDatMayChu.capNhat > Number(localStorage.getItem("phien-ban-cai-dat") || 0)) {
    localStorage.setItem("cai-dat", JSON.stringify(caiDatMayChu.giaTri));
    localStorage.setItem("phien-ban-cai-dat", caiDatMayChu.capNhat);
    coMoi = true;
  }
  if (coMoi) apDungDuLieuMoi();
  if (canGui.length) {
    ghiChoGui([...new Set([...docChoGui(), ...canGui])]);
    guiLenTaiKhoan();
  }
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

// Gộp 2 danh sách theo id: giữ hết của danh sách 1, thêm những cái danh sách 2 chưa có
function gopTheoId(ds1, ds2) {
  const daCo = new Set(ds1.map((x) => x.id));
  return [...ds1, ...ds2.filter((x) => !daCo.has(x.id))];
}

// Đăng nhập thành công → lấy dữ liệu của tài khoản về máy.
// KHÔNG BAO GIỜ xóa mất dữ liệu đang có trong máy: luôn cất một bản sao lưu trước,
// và gộp (không ghi đè) nếu người dùng đồng ý.
async function batDauPhienMoi({ ve, ten, quanTri }) {
  const nguoiTruoc = localStorage.getItem("ten-dang-nhap");
  localStorage.setItem("ve-dang-nhap", ve);
  localStorage.setItem("ten-dang-nhap", ten);
  localStorage.setItem("la-quan-tri", quanTri ? "1" : "0");

  const duLieu = await goiMayChu("/du-lieu");

  // Dữ liệu đang có trong máy
  const viecMay = docPhanTrongMay("viec");
  const thuChiMay = docPhanTrongMay("thu-chi");
  const caiDatMay = docSo("cai-dat");
  const coDuLieuMay = viecMay.muc.length > 0 || thuChiMay.muc.length > 0;

  // 1) Cất bản sao lưu trong máy (khôi phục được ở ⚙️ Cài đặt)
  if (coDuLieuMay) {
    localStorage.setItem("sao-luu-may", JSON.stringify({ luc: Date.now(), viec: viecMay.muc, thuChi: thuChiMay.muc, caiDat: caiDatMay }));
  }

  // 2) Hỏi có gộp dữ liệu trong máy vào tài khoản không
  //    (chỉ hỏi khi dữ liệu này chưa từng thuộc về người khác)
  const gop = coDuLieuMay && (!nguoiTruoc || nguoiTruoc === ten) && confirm(
    `Trên máy đang có ${viecMay.muc.length} việc và ${thuChiMay.muc.length} khoản thu chi.\n` +
    `Gộp tất cả vào tài khoản "${ten}"?\n\n` +
    `(Bấm Hủy thì máy vẫn giữ bản sao lưu, sau này khôi phục được trong ⚙️ Cài đặt.)`
  );

  // 3) Ghi dữ liệu của tài khoản vào máy (gộp thêm dữ liệu trong máy nếu đồng ý)
  const rong = { muc: [], daXoa: [] };
  ghiPhanVaoMay("viec", gopPhan(duLieu.viec ? duLieu.viec.giaTri : rong, gop ? viecMay : rong));
  ghiPhanVaoMay("thu-chi", gopPhan(duLieu["thu-chi"] ? duLieu["thu-chi"].giaTri : rong, gop ? thuChiMay : rong));
  const caiDatMoi = duLieu["cai-dat"] ? duLieu["cai-dat"].giaTri : (gop ? caiDatMay : null);
  if (caiDatMoi) localStorage.setItem("cai-dat", JSON.stringify(caiDatMoi));
  else localStorage.removeItem("cai-dat");
  Object.keys(SO_CUA_PHAN).forEach((phan) => {
    if (duLieu[phan]) localStorage.setItem("phien-ban-" + phan, duLieu[phan].capNhat);
    else localStorage.removeItem("phien-ban-" + phan);
  });

  // 4) Gộp xong thì gửi lên tài khoản
  if (gop) {
    ghiChoGui(Object.keys(SO_CUA_PHAN).filter((phan) => localStorage.getItem(SO_CUA_PHAN[phan])));
    await guiLenTaiKhoan();
  } else {
    ghiChoGui([]);
  }
  location.reload(); // mở lại app với dữ liệu mới
}

// Thêm lại các mục đã mất (mục nào đang có thì bỏ qua, KHÔNG xóa gì). Trả về số mục thêm được.
function themMucDaMat(phan, muc) {
  const dangCo = new Set((phan === "viec" ? danhSachViec : danhSachThuChi).map((x) => x.id));
  const moi = (muc || []).filter((x) => x && x.id && !dangCo.has(x.id)).map((x) => ({ ...x }));
  if (!moi.length) return 0;
  if (phan === "viec") {
    danhSachViec = [...danhSachViec, ...moi.map((v) => ({ gioKetThuc: "", checklist: [], ...v }))];
    luuDanhSach();
    veTatCa();
  } else {
    danhSachThuChi = [...danhSachThuChi, ...moi];
    luuThuChi();
    veThuChi();
  }
  return moi.length;
}

// Khôi phục bản sao lưu cất trong máy lúc đăng nhập
function khoiPhucSaoLuu() {
  const saoLuu = docSo("sao-luu-may");
  if (!saoLuu) return 0;
  return themMucDaMat("viec", saoLuu.viec) + themMucDaMat("thu-chi", saoLuu.thuChi);
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
    "cho-dong-bo", "ve-dang-nhap", "la-quan-tri", "link-sheet", "da-xoa-viec", "da-xoa-thu-chi",
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
  // Đang mở app thì cứ 1 phút lấy bản mới một lần (thấy ngay thay đổi từ máy khác)
  setInterval(() => {
    if (!document.hidden) taiVeTuTaiKhoan();
  }, 60000);
});
