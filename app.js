// =====================================================
// APP QUẢN LÝ CÔNG VIỆC HÀNG NGÀY
// Mỗi công việc là một "hộp" thông tin như sau:
//   {
//     id, ten, ngay: "2026-10-01",
//     gio: "08:30", gioKetThuc: "09:30",   (có thể bỏ trống)
//     ghiChu, xong: true/false,
//     checklist: [ { ten: "Mua rau", xong: false }, ... ]
//   }
// =====================================================


// ----- 1. LƯU VÀ ĐỌC DỮ LIỆU -----
// localStorage giống một "cuốn sổ" nằm sẵn trong trình duyệt:
// tắt app mở lại thì sổ vẫn còn.

const TEN_SO = "danh-sach-viec";

function docDanhSach() {
  try {
    const ds = JSON.parse(localStorage.getItem(TEN_SO)) || [];
    // Việc tạo từ bản cũ chưa có giờ kết thúc / checklist thì bổ sung cho đủ
    return ds.map((v) => ({ gioKetThuc: "", checklist: [], ...v }));
  } catch (loi) {
    return [];
  }
}

function luuDanhSach() {
  localStorage.setItem(TEN_SO, JSON.stringify(danhSachViec));
  dongBoMayChu(); // gửi lịch nhắc mới lên máy chủ (nếu đã bật)
  daThayDoi("viec"); // gửi dữ liệu lên tài khoản (tai-khoan.js)
}

let danhSachViec = docDanhSach();


// ----- 2. CÁC HÀM NHỎ VỀ NGÀY THÁNG -----

const TEN_THU = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

// Đổi một ngày thành chữ dạng "2026-10-01"
function ngayThanhChu(ngay) {
  const nam = ngay.getFullYear();
  const thang = String(ngay.getMonth() + 1).padStart(2, "0");
  const ngayTrongThang = String(ngay.getDate()).padStart(2, "0");
  return `${nam}-${thang}-${ngayTrongThang}`;
}

// Đổi chữ "2026-10-01" ngược lại thành ngày
function chuThanhNgay(chu) {
  const [nam, thang, ngay] = chu.split("-").map(Number);
  return new Date(nam, thang - 1, ngay);
}

function homNay() {
  return ngayThanhChu(new Date());
}

// Ví dụ: "Thứ Năm, 01/10"
function ngayDeDoc(chuNgay) {
  const d = chuThanhNgay(chuNgay);
  const ngay = String(d.getDate()).padStart(2, "0");
  const thang = String(d.getMonth() + 1).padStart(2, "0");
  return `${TEN_THU[d.getDay()]}, ${ngay}/${thang}`;
}


// ----- 3. TRẠNG THÁI ĐANG XEM -----

let ngayDangChon = homNay();                 // ngày đang xem chi tiết
let thangDangXem = chuThanhNgay(homNay());   // tháng đang hiện trên lịch
thangDangXem.setDate(1);

function viecCuaNgay(chuNgay) {
  return danhSachViec.filter((v) => v.ngay === chuNgay);
}

// Vẽ lại toàn bộ màn hình
function veTatCa() {
  veLichThang();
  veChiTietNgay();
}


// ----- 4. LỊCH THÁNG -----

const luoiNgay = document.getElementById("luoi-ngay");

function veLichThang() {
  const nam = thangDangXem.getFullYear();
  const thang = thangDangXem.getMonth();
  document.getElementById("ten-thang").textContent = `Tháng ${thang + 1}, ${nam}`;

  // Nút "Hôm nay" chỉ hiện khi đang xem ngày khác hoặc tháng khác
  const dangOHomNay = ngayDangChon === homNay() && homNay().startsWith(ngayThanhChu(thangDangXem).slice(0, 7));
  document.getElementById("ve-hom-nay").classList.toggle("an", dangOHomNay);

  luoiNgay.innerHTML = "";

  // Số ô trống đầu tháng (tuần bắt đầu từ Thứ Hai)
  const soOTrong = (new Date(nam, thang, 1).getDay() + 6) % 7;
  for (let i = 0; i < soOTrong; i++) {
    luoiNgay.appendChild(document.createElement("span"));
  }

  const soNgayTrongThang = new Date(nam, thang + 1, 0).getDate();
  for (let ngay = 1; ngay <= soNgayTrongThang; ngay++) {
    const chuNgay = ngayThanhChu(new Date(nam, thang, ngay));
    const o = document.createElement("button");
    o.className = "o-ngay";
    if (chuNgay === homNay()) o.classList.add("hom-nay");
    if (chuNgay === ngayDangChon) o.classList.add("dang-chon");
    o.textContent = ngay;

    // Chấm nhỏ: hồng = còn việc chưa xong, xanh = đã xong (tối đa 3 chấm)
    const cacViec = viecCuaNgay(chuNgay);
    if (cacViec.length) {
      const cacCham = document.createElement("div");
      cacCham.className = "cac-cham";
      cacViec.slice(0, 3).forEach((v) => {
        const cham = document.createElement("i");
        cham.className = "cham" + (v.xong ? " xong" : "");
        cacCham.appendChild(cham);
      });
      o.appendChild(cacCham);
    }

    o.onclick = () => {
      ngayDangChon = chuNgay;
      veTatCa();
    };
    luoiNgay.appendChild(o);
  }
}

function doiThang(soThang) {
  thangDangXem.setMonth(thangDangXem.getMonth() + soThang);
  veLichThang();
}

document.getElementById("thang-truoc").onclick = () => doiThang(-1);
document.getElementById("thang-sau").onclick = () => doiThang(1);

document.getElementById("ve-hom-nay").onclick = () => {
  ngayDangChon = homNay();
  thangDangXem = chuThanhNgay(homNay());
  thangDangXem.setDate(1);
  veTatCa();
};


// ----- 5. CHI TIẾT NGÀY THEO KHUNG GIỜ -----

const dongThoiGian = document.getElementById("dong-thoi-gian");

function veChiTietNgay() {
  const cacViec = viecCuaNgay(ngayDangChon).sort((a, b) =>
    (a.gio || "").localeCompare(b.gio || "")
  );
  const soXong = cacViec.filter((v) => v.xong).length;

  document.getElementById("ten-ngay").textContent =
    ngayDangChon === homNay() ? "Hôm nay · " + ngayDeDoc(ngayDangChon) : ngayDeDoc(ngayDangChon);
  document.getElementById("tom-tat-ngay").textContent = cacViec.length
    ? `${cacViec.length} việc · ${soXong} đã xong`
    : "Chưa có việc nào";

  dongThoiGian.innerHTML = "";

  // a) Việc không đặt giờ → nhóm "Cả ngày"
  const viecCaNgay = cacViec.filter((v) => !v.gio);
  if (viecCaNgay.length) {
    const nhom = document.createElement("div");
    nhom.className = "nhom-ca-ngay";
    nhom.innerHTML = `<p class="nhan-nho">Cả ngày</p>`;
    viecCaNgay.forEach((v) => nhom.appendChild(taoTheViec(v)));
    dongThoiGian.appendChild(nhom);
  }

  // b) Việc có giờ → xếp vào từng khung giờ
  const viecCoGio = cacViec.filter((v) => v.gio);
  const gioCuaViec = viecCoGio.map((v) => Number(v.gio.slice(0, 2)));
  const gioDau = Math.min(6, ...gioCuaViec);   // mặc định hiện từ 6 giờ sáng
  const gioCuoi = Math.max(22, ...gioCuaViec); // đến 10 giờ tối
  const gioHienTai = new Date().getHours();

  for (let gio = gioDau; gio <= gioCuoi; gio++) {
    const hang = document.createElement("div");
    hang.className = "hang-gio";
    if (ngayDangChon === homNay() && gio === gioHienTai) hang.classList.add("bay-gio");

    const nhan = document.createElement("div");
    nhan.className = "nhan-gio";
    nhan.textContent = String(gio).padStart(2, "0") + ":00";

    const o = document.createElement("div");
    o.className = "o-gio";
    viecCoGio
      .filter((v) => Number(v.gio.slice(0, 2)) === gio)
      .forEach((v) => o.appendChild(taoTheViec(v)));

    hang.appendChild(nhan);
    hang.appendChild(o);
    dongThoiGian.appendChild(hang);
  }
}

// Tạo "thẻ" hiển thị cho một công việc
function taoTheViec(viec) {
  // Xen kẽ màu xanh / hồng cho đẹp mắt (dựa theo id nên màu không đổi)
  const mauHong = Number(viec.id) % 2 === 1;

  const the = document.createElement("div");
  the.className = "viec" + (mauHong ? " mau-hong" : "") + (viec.xong ? " da-xong" : "");

  // Nút tròn để đánh dấu xong / chưa xong
  const nutTich = document.createElement("button");
  nutTich.className = "o-tich";
  nutTich.textContent = viec.xong ? "✓" : "";
  nutTich.setAttribute("aria-label", "Đánh dấu hoàn thành");
  nutTich.onclick = () => doiTrangThaiXong(viec.id);

  const noiDung = document.createElement("div");
  noiDung.className = "noi-dung";

  // Phần đầu thẻ: bấm vào để sửa
  const dauThe = document.createElement("div");
  dauThe.className = "dau-the";
  dauThe.onclick = () => moKhungNhap(viec);

  const ten = document.createElement("div");
  ten.className = "ten";
  ten.textContent = viec.ten;
  dauThe.appendChild(ten);

  if (viec.gio) {
    const thoiGian = document.createElement("div");
    thoiGian.className = "thoi-gian";
    thoiGian.textContent = "🕒 " + viec.gio + (viec.gioKetThuc ? " – " + viec.gioKetThuc : "");
    dauThe.appendChild(thoiGian);
  }

  if (viec.ghiChu) {
    const ghiChu = document.createElement("div");
    ghiChu.className = "ghi-chu";
    ghiChu.textContent = viec.ghiChu;
    dauThe.appendChild(ghiChu);
  }
  noiDung.appendChild(dauThe);

  // Checklist: bấm vào từng bước để đánh dấu
  if (viec.checklist.length) {
    const soXong = viec.checklist.filter((m) => m.xong).length;
    const phanTram = Math.round((soXong / viec.checklist.length) * 100);

    const khung = document.createElement("div");
    khung.className = "checklist";
    khung.innerHTML = `
      <div class="thanh-tien-do">
        <div class="vach"><i style="width:${phanTram}%"></i></div>
        <span>${soXong}/${viec.checklist.length}</span>
      </div>`;

    viec.checklist.forEach((muc, viTri) => {
      const dong = document.createElement("button");
      dong.className = "muc" + (muc.xong ? " xong" : "");
      const hop = document.createElement("span");
      hop.className = "hop";
      hop.textContent = muc.xong ? "✓" : "";
      const chu = document.createElement("span");
      chu.textContent = muc.ten;
      dong.appendChild(hop);
      dong.appendChild(chu);
      dong.onclick = () => doiTrangThaiMuc(viec.id, viTri);
      khung.appendChild(dong);
    });
    noiDung.appendChild(khung);
  }

  the.appendChild(nutTich);
  the.appendChild(noiDung);
  return the;
}


// ----- 6. ĐÁNH DẤU XONG / XÓA -----

function doiTrangThaiXong(id) {
  const viec = danhSachViec.find((v) => v.id === id);
  viec.xong = !viec.xong;
  luuDanhSach();
  veTatCa();
}

function doiTrangThaiMuc(id, viTri) {
  const viec = danhSachViec.find((v) => v.id === id);
  viec.checklist[viTri].xong = !viec.checklist[viTri].xong;
  luuDanhSach();
  veTatCa();
}

function xoaViec(id) {
  danhSachViec = danhSachViec.filter((v) => v.id !== id);
  luuDanhSach();
  veTatCa();
}


// ----- 7. KHUNG NHẬP (thêm hoặc sửa) -----

const khungNhap = document.getElementById("khung-nhap");
const nenMo = document.getElementById("nen-mo");
const oTen = document.getElementById("o-ten");
const oNgay = document.getElementById("o-ngay");
const oGio = document.getElementById("o-gio");
const oGioKetThuc = document.getElementById("o-gio-ket-thuc");
const oGhiChu = document.getElementById("o-ghi-chu");
const oMucMoi = document.getElementById("o-muc-moi");
const khungSuaChecklist = document.getElementById("sua-checklist");
const nutXoa = document.getElementById("nut-xoa");
const nutLichMay = document.getElementById("nut-lich-may");

let idDangSua = null;       // id của việc đang sửa (null = đang thêm mới)
let checklistDangSua = [];  // bản nháp checklist trong khung nhập

// viec = null nghĩa là thêm mới; có viec nghĩa là sửa việc đó
function moKhungNhap(viec) {
  idDangSua = viec ? viec.id : null;
  document.getElementById("tieu-de-khung").textContent = viec ? "Sửa công việc" : "Thêm việc mới";
  oTen.value = viec ? viec.ten : "";
  oNgay.value = viec ? viec.ngay : ngayDangChon; // thêm mới: lấy ngày đang xem
  oGio.value = viec ? viec.gio : "";
  oGioKetThuc.value = viec ? viec.gioKetThuc : "";
  oGhiChu.value = viec ? viec.ghiChu : "";
  oMucMoi.value = "";
  // Chép checklist ra bản nháp, để bấm "Hủy" thì không bị thay đổi
  checklistDangSua = viec ? viec.checklist.map((m) => ({ ...m })) : [];
  veSuaChecklist();

  nutXoa.classList.toggle("an", !viec); // chỉ hiện nút Xóa khi đang sửa
  // Nút "Thêm vào lịch điện thoại" chỉ hiện khi sửa việc đã có giờ
  nutLichMay.classList.toggle("an", !(viec && viec.gio));

  khungNhap.classList.remove("an");
  nenMo.classList.remove("an");
  khungNhap.scrollTop = 0;
}

function dongKhungNhap() {
  khungNhap.classList.add("an");
  nenMo.classList.add("an");
}

// Vẽ danh sách các bước trong khung nhập
function veSuaChecklist() {
  khungSuaChecklist.innerHTML = "";
  checklistDangSua.forEach((muc, viTri) => {
    const dong = document.createElement("div");
    dong.className = "dong-muc";

    const hop = document.createElement("input");
    hop.type = "checkbox";
    hop.className = "hop-sua";
    hop.checked = muc.xong;
    hop.onchange = () => (muc.xong = hop.checked);

    const chu = document.createElement("input");
    chu.type = "text";
    chu.value = muc.ten;
    chu.oninput = () => (muc.ten = chu.value);

    const nutBo = document.createElement("button");
    nutBo.type = "button";
    nutBo.className = "nut-bo";
    nutBo.textContent = "×";
    nutBo.setAttribute("aria-label", "Bỏ bước này");
    nutBo.onclick = () => {
      checklistDangSua.splice(viTri, 1);
      veSuaChecklist();
    };

    dong.appendChild(hop);
    dong.appendChild(chu);
    dong.appendChild(nutBo);
    khungSuaChecklist.appendChild(dong);
  });
}

function themMucChecklist() {
  const ten = oMucMoi.value.trim();
  if (!ten) return;
  checklistDangSua.push({ ten, xong: false });
  oMucMoi.value = "";
  veSuaChecklist();
}

document.getElementById("nut-them-muc").onclick = () => {
  themMucChecklist();
  oMucMoi.focus();
};
// Bấm Enter trong ô "Thêm một bước" thì thêm bước, không lưu cả form
oMucMoi.onkeydown = (suKien) => {
  if (suKien.key === "Enter") {
    suKien.preventDefault();
    themMucChecklist();
  }
};

// Bấm "Lưu"
khungNhap.onsubmit = (suKien) => {
  suKien.preventDefault(); // không cho trang tải lại

  // Bước còn gõ dở trong ô "Thêm một bước" cũng được thêm vào
  themMucChecklist();

  const thongTin = {
    ten: oTen.value.trim(),
    ngay: oNgay.value,
    gio: oGio.value,
    gioKetThuc: oGio.value ? oGioKetThuc.value : "", // không có giờ bắt đầu thì bỏ giờ kết thúc
    ghiChu: oGhiChu.value.trim(),
    checklist: checklistDangSua.filter((m) => m.ten.trim()),
  };
  if (!thongTin.ten) return;
  if (thongTin.gioKetThuc && thongTin.gioKetThuc <= thongTin.gio) {
    alert("Giờ kết thúc phải sau giờ bắt đầu.");
    return;
  }

  if (idDangSua) {
    // Sửa: ghi đè thông tin mới lên việc cũ
    const viec = danhSachViec.find((v) => v.id === idDangSua);
    // Đổi ngày hoặc giờ thì cho phép nhắc lại theo giờ mới
    if (viec.ngay !== thongTin.ngay || viec.gio !== thongTin.gio || viec.gioKetThuc !== thongTin.gioKetThuc) {
      viec.daNhac = viec.daNhacGiua = viec.daNhacKetThuc = false;
    }
    Object.assign(viec, thongTin);
  } else {
    // Thêm mới: tạo id riêng dựa trên thời điểm hiện tại
    danhSachViec.push({ id: String(Date.now()), xong: false, ...thongTin });
  }

  // Chuyển lịch tới ngày của việc vừa lưu
  ngayDangChon = thongTin.ngay;
  thangDangXem = chuThanhNgay(thongTin.ngay);
  thangDangXem.setDate(1);

  luuDanhSach();
  veTatCa();
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


// ----- 8. LỜI CHÀO THEO GIỜ -----
function capNhatLoiChao() {
  const gio = new Date().getHours();
  const loiChao =
    gio < 11 ? "Chào buổi sáng ☀️" :
    gio < 14 ? "Chào buổi trưa 🌤️" :
    gio < 18 ? "Chào buổi chiều 🌸" : "Chào buổi tối 🌙";
  document.getElementById("loi-chao").textContent = loiChao;
}


// ----- 9. KHỞI ĐỘNG APP -----
capNhatLoiChao();
veTatCa();

// Đăng ký "người giữ kho" để app cài được và chạy khi mất mạng
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js");
}


// ----- 10. MÁY CHỦ NHẮC GIỜ -----
// Gửi danh sách "lúc nào nhắc, nhắc gì" lên máy chủ. Đến giờ, máy chủ gửi
// thông báo về điện thoại kể cả khi app đang tắt hẳn.
// (DIA_CHI_MAY_CHU nằm trong file may-chu.js)

function coMayChu() {
  return typeof DIA_CHI_MAY_CHU === "string" && DIA_CHI_MAY_CHU !== "" && "PushManager" in window;
}

function daDangKyMayChu() {
  return coMayChu() && localStorage.getItem("da-dang-ky-may-chu-2") === "1";
}

// Lấy sẵn "khóa" của máy chủ khi mở app, để lúc bấm 🔔 đăng ký được ngay
let khoaMayChu = null;
if (coMayChu()) {
  fetch(DIA_CHI_MAY_CHU + "/khoa")
    .then((kq) => kq.json())
    .then((dl) => (khoaMayChu = dl.khoa))
    .catch(() => {});
}

// Đăng ký điện thoại này với máy chủ (cần bấm nút chuông 🔔)
async function dangKyMayChu() {
  try {
    const nguoiGiuKho = await navigator.serviceWorker.ready;
    const khoa = khoaMayChu || (await (await fetch(DIA_CHI_MAY_CHU + "/khoa")).json()).khoa;
    const khoaByte = Uint8Array.from(atob(khoa.replace(/-/g, "+").replace(/_/g, "/")), (k) => k.charCodeAt(0));
    const dangKy =
      (await nguoiGiuKho.pushManager.getSubscription()) ||
      (await nguoiGiuKho.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: khoaByte }));
    if (!(await guiLenMayChu(dangKy))) throw new Error("máy chủ không nhận được lịch nhắc");
    localStorage.setItem("da-dang-ky-may-chu-2", "1");
    alert("Đã bật thông báo! Từ giờ máy chủ sẽ nhắc bạn cả khi app đang tắt.");
  } catch (loi) {
    alert("Chưa bật được thông báo từ máy chủ. Hãy kiểm tra mạng rồi bấm 🔔 lại nhé.\n(" + loi.message + ")");
  }
}

// Đợi 1 giây sau lần sửa cuối rồi mới gửi, tránh gửi liên tục khi bấm nhiều
let henDongBo = null;
function dongBoMayChu() {
  if (!daDangKyMayChu()) return;
  clearTimeout(henDongBo);
  henDongBo = setTimeout(() => guiLenMayChu(), 1000);
}

// Trả về true nếu máy chủ đã nhận
async function guiLenMayChu(dangKy) {
  try {
    const nguoiGiuKho = await navigator.serviceWorker.ready;
    dangKy = dangKy || (await nguoiGiuKho.pushManager.getSubscription());
    if (!dangKy) {
      // Điện thoại đã tắt thông báo → cho hiện lại nút 🔔
      localStorage.removeItem("da-dang-ky-may-chu-2");
      capNhatNutBatNhac();
      return false;
    }

    // Chỉ gửi các lần nhắc chưa tới giờ của việc chưa xong
    const bayGio = Date.now();
    const cacNhac = [];
    danhSachViec.forEach((viec) => {
      if (viec.xong || !viec.gio) return;
      cacMocNhac(viec).forEach((moc) => {
        if (moc.luc.getTime() > bayGio) {
          cacNhac.push({ luc: moc.luc.getTime(), tieuDe: moc.tieuDe, noiDung: moc.noiDung, the: viec.id + moc.co });
        }
      });
    });

    const ketQua = await fetch(DIA_CHI_MAY_CHU + "/dong-bo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dangKy: dangKy.toJSON(), cacNhac }),
    });
    return ketQua.ok;
  } catch (loi) {
    // Mất mạng: lần sửa sau hoặc lần mở app sau sẽ gửi lại
    return false;
  }
}


// ----- 11. NHẮC LỊCH -----
// Cứ 20 giây app xem một lần: việc nào đến giờ mà chưa xong, chưa nhắc → nhắc.
// LƯU Ý: điện thoại chỉ cho web app nhắc khi app đang mở hoặc vừa chạy ngầm.
// Nếu tắt hẳn app, hãy dùng nút "Thêm vào lịch điện thoại" để chắc chắn được nhắc.

const nutBatNhac = document.getElementById("nut-bat-nhac");
const loiNhac = document.getElementById("loi-nhac");

// Hiện nút chuông nếu chưa cho phép thông báo, hoặc chưa đăng ký với máy chủ nhắc giờ
function capNhatNutBatNhac() {
  const coThongBao = "Notification" in window;
  const chuaHoi = coThongBao && Notification.permission === "default";
  const chuaDangKy = coThongBao && coMayChu() && Notification.permission !== "denied" && !daDangKyMayChu();
  nutBatNhac.classList.toggle("an", !(chuaHoi || chuaDangKy));
}

nutBatNhac.onclick = async () => {
  if ((await Notification.requestPermission()) === "granted" && coMayChu()) {
    await dangKyMayChu();
  }
  capNhatNutBatNhac();
};

// Gửi một thông báo lên điện thoại + hiện dòng nhắc trong app
async function guiThongBao(viec, tieuDe, noiDung) {
  // Đã đăng ký máy chủ thì máy chủ sẽ gửi thông báo, ở đây chỉ hiện dòng nhắc trong app
  if ("Notification" in window && Notification.permission === "granted" && !daDangKyMayChu()) {
    const nguoiGiuKho = await navigator.serviceWorker.ready;
    nguoiGiuKho.showNotification(tieuDe, {
      body: noiDung,
      icon: "icons/icon-192.png",
      tag: viec.id + tieuDe, // tránh hiện trùng
    });
  }

  loiNhac.textContent = tieuDe;
  loiNhac.classList.remove("an");
  setTimeout(() => loiNhac.classList.add("an"), 8000);
}

// Ví dụ: "Checklist: xong 2/5 bước" (không có checklist thì để trống)
function chuTienDo(viec) {
  if (!viec.checklist.length) return "";
  const soXong = viec.checklist.filter((m) => m.xong).length;
  return `Checklist: xong ${soXong}/${viec.checklist.length} bước`;
}

// Đổi ngày + giờ của việc thành thời điểm cụ thể
function thoiDiem(viec, gioPhut) {
  const [gio, phut] = gioPhut.split(":").map(Number);
  const d = chuThanhNgay(viec.ngay);
  d.setHours(gio, phut);
  return d;
}

// Mỗi việc có tối đa 3 lần nhắc: bắt đầu, giữa chừng, kết thúc
function cacMocNhac(viec) {
  const moc = [];
  const batDau = thoiDiem(viec, viec.gio);
  const tienDo = chuTienDo(viec);

  moc.push({
    co: "daNhac",
    luc: batDau,
    tieuDe: "▶️ Bắt đầu: " + viec.ten,
    noiDung: [viec.gio + (viec.gioKetThuc ? " – " + viec.gioKetThuc : ""), viec.ghiChu].filter(Boolean).join(" · "),
  });

  if (viec.gioKetThuc) {
    const ketThuc = thoiDiem(viec, viec.gioKetThuc);
    moc.push({
      co: "daNhacGiua",
      luc: new Date((batDau.getTime() + ketThuc.getTime()) / 2),
      tieuDe: "⏳ Đã được nửa thời gian: " + viec.ten,
      noiDung: tienDo || "Còn đến " + viec.gioKetThuc + " là kết thúc",
    });
    moc.push({
      co: "daNhacKetThuc",
      luc: ketThuc,
      tieuDe: "🏁 Kết thúc: " + viec.ten,
      noiDung: (tienDo ? tienDo + ". " : "") + "Bấm vào app để đánh dấu hoàn thành nhé!",
    });
  }
  return moc;
}

let ngayDangHien = homNay();
let gioDangHien = new Date().getHours();

function kiemTraNhacViec() {
  // Sang giờ mới hoặc qua nửa đêm thì vẽ lại (vạch giờ hiện tại, ô "hôm nay")
  if (homNay() !== ngayDangHien || new Date().getHours() !== gioDangHien) {
    // Đang xem "hôm nay" mà qua nửa đêm thì tự chuyển sang ngày mới
    if (ngayDangChon === ngayDangHien) ngayDangChon = homNay();
    ngayDangHien = homNay();
    gioDangHien = new Date().getHours();
    capNhatLoiChao();
    veTatCa();
  }

  const bayGio = new Date();
  let coThayDoi = false;

  danhSachViec.forEach((viec) => {
    if (viec.xong || !viec.gio) return;

    cacMocNhac(viec).forEach((moc) => {
      if (viec[moc.co] || moc.luc > bayGio) return; // đã nhắc rồi, hoặc chưa tới giờ
      viec[moc.co] = true;
      coThayDoi = true;
      // Trễ quá 1 tiếng (ví dụ lâu rồi mới mở app) thì bỏ qua, không nhắc dồn
      if (bayGio - moc.luc < 60 * 60 * 1000) guiThongBao(viec, moc.tieuDe, moc.noiDung);
    });
  });

  if (coThayDoi) luuDanhSach();
}

capNhatNutBatNhac();
kiemTraNhacViec();
dongBoMayChu(); // mỗi lần mở app gửi lại lịch nhắc cho chắc
setInterval(kiemTraNhacViec, 20000);
// Mở lại app từ nền thì kiểm tra ngay
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) kiemTraNhacViec();
});


// ----- 12. THÊM VÀO LỊCH ĐIỆN THOẠI -----
// Tạo một file lịch (.ics). Mở file này, điện thoại sẽ hỏi thêm vào ứng dụng Lịch,
// và Lịch sẽ nhắc đúng giờ kể cả khi app này đang tắt.

nutLichMay.onclick = () => {
  const viec = danhSachViec.find((v) => v.id === idDangSua);
  const ngayGon = viec.ngay.replaceAll("-", "");
  const gioGon = (gio) => gio.replace(":", "") + "00";
  const chu = (x) => x.replace(/[\\,;]/g, (k) => "\\" + k).replace(/\n/g, "\\n");

  // Ghi chú + checklist gộp vào phần mô tả
  const moTa = [viec.ghiChu, ...viec.checklist.map((m) => "☐ " + m.ten)].filter(Boolean).join("\n");

  // Báo thức trong Lịch: lúc bắt đầu, và nếu có giờ kết thúc thì thêm giữa chừng + kết thúc
  const baoThuc = (moTaBaoThuc, kichHoat) =>
    ["BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + chu(moTaBaoThuc), "TRIGGER" + kichHoat, "END:VALARM"];
  const baoThucLich = baoThuc("Bắt đầu: " + viec.ten, ":PT0M");
  if (viec.gioKetThuc) {
    const soPhut = (thoiDiem(viec, viec.gioKetThuc) - thoiDiem(viec, viec.gio)) / 60000;
    baoThucLich.push(...baoThuc("Đã được nửa thời gian: " + viec.ten, ":PT" + Math.round(soPhut / 2) + "M"));
    baoThucLich.push(...baoThuc("Kết thúc: " + viec.ten, ";RELATED=END:PT0M"));
  }

  const noiDungFile = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Viec Hom Nay//VI",
    "BEGIN:VEVENT",
    "UID:" + viec.id + "@viec-hom-nay",
    "DTSTAMP:" + new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z",
    "DTSTART:" + ngayGon + "T" + gioGon(viec.gio),
    viec.gioKetThuc ? "DTEND:" + ngayGon + "T" + gioGon(viec.gioKetThuc) : "DURATION:PT30M",
    "SUMMARY:" + chu(viec.ten),
    "DESCRIPTION:" + chu(moTa),
    ...baoThucLich,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const file = new Blob([noiDungFile], { type: "text/calendar" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(file);
  link.download = "viec.ics";
  link.click();
};
