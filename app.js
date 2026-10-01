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

// Đang xem tab nào: "hom-nay", "ngay-mai" hoặc "tuan-nay"
let cheDoXem = "hom-nay";

// Cộng thêm số ngày vào hôm nay. Ví dụ congNgay(1) = ngày mai
function congNgay(soNgay) {
  const d = new Date();
  d.setDate(d.getDate() + soNgay);
  return ngayThanhChu(d);
}

// Tuần tính từ Thứ Hai đến Chủ Nhật
function dauVaCuoiTuan() {
  const thuHomNay = new Date().getDay(); // 0 = Chủ Nhật, 1 = Thứ Hai...
  const luiVeThuHai = thuHomNay === 0 ? -6 : 1 - thuHomNay;
  return [congNgay(luiVeThuHai), congNgay(luiVeThuHai + 6)];
}

// Chọn ra những việc thuộc tab đang xem
function locTheoCheDo() {
  if (cheDoXem === "hom-nay") return danhSachViec.filter((v) => v.ngay === homNay());
  if (cheDoXem === "ngay-mai") return danhSachViec.filter((v) => v.ngay === congNgay(1));
  const [dau, cuoi] = dauVaCuoiTuan();
  return danhSachViec.filter((v) => v.ngay >= dau && v.ngay <= cuoi);
}

function veDanhSach() {
  const ds = sapXep(locTheoCheDo());
  khungDanhSach.innerHTML = "";

  if (ds.length === 0) {
    khungDanhSach.innerHTML = `<p class="trong">Không có việc nào.<br>Bấm nút + để thêm.</p>`;
    return;
  }

  // Tab "Tuần này": thêm dòng tiêu đề mỗi khi sang ngày mới
  let ngayTruoc = null;
  ds.forEach((viec) => {
    if (cheDoXem === "tuan-nay" && viec.ngay !== ngayTruoc) {
      const tieuDe = document.createElement("div");
      tieuDe.className = "tieu-de-ngay";
      tieuDe.textContent = viec.ngay === homNay() ? "Hôm nay" : ngayDeDoc(viec.ngay);
      khungDanhSach.appendChild(tieuDe);
      ngayTruoc = viec.ngay;
    }
    khungDanhSach.appendChild(taoTheViec(viec));
  });
}

// Bấm vào một tab
document.querySelectorAll(".tab").forEach((tab) => {
  tab.onclick = () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("dang-chon"));
    tab.classList.add("dang-chon");
    cheDoXem = tab.dataset.cheDo;
    veDanhSach();
  };
});

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

  if (viec.gio) {
    const gio = document.createElement("div");
    gio.className = "gio";
    gio.textContent = "🕒 " + viec.gio;
    noiDung.appendChild(gio);
  }

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
const nutLichMay = document.getElementById("nut-lich-may");

// viec = null nghĩa là thêm mới; có viec nghĩa là sửa việc đó
function moKhungNhap(viec) {
  idDangSua = viec ? viec.id : null;
  document.getElementById("tieu-de-khung").textContent = viec ? "Sửa công việc" : "Thêm việc mới";
  oTen.value = viec ? viec.ten : "";
  // Thêm mới khi đang ở tab "Ngày mai" thì điền sẵn ngày mai cho tiện
  oNgay.value = viec ? viec.ngay : (cheDoXem === "ngay-mai" ? congNgay(1) : homNay());
  oGio.value = viec ? viec.gio : "";
  oGhiChu.value = viec ? viec.ghiChu : "";
  nutXoa.classList.toggle("an", !viec); // chỉ hiện nút Xóa khi đang sửa
  // Nút "Thêm vào lịch điện thoại" chỉ hiện khi sửa việc đã có giờ
  nutLichMay.classList.toggle("an", !(viec && viec.gio));

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
    // Đổi ngày hoặc giờ thì cho phép nhắc lại theo giờ mới
    if (viec.ngay !== thongTin.ngay || viec.gio !== thongTin.gio) viec.daNhac = false;
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

// ----- 7. ĐĂNG KÝ "NGƯỜI GIỮ KHO" để app cài được và chạy khi mất mạng -----
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js");
}


// ----- 8. NHẮC LỊCH -----
// Cứ 20 giây app xem một lần: việc nào đến giờ mà chưa xong, chưa nhắc → nhắc.
// LƯU Ý: điện thoại chỉ cho web app nhắc khi app đang mở hoặc vừa chạy ngầm.
// Nếu tắt hẳn app, hãy dùng nút "Thêm vào lịch điện thoại" để chắc chắn được nhắc.

const nutBatNhac = document.getElementById("nut-bat-nhac");
const loiNhac = document.getElementById("loi-nhac");

// Hiện nút "Bật nhắc lịch" nếu chưa cho phép thông báo
function capNhatNutBatNhac() {
  const coTheBat = "Notification" in window && Notification.permission === "default";
  nutBatNhac.classList.toggle("an", !coTheBat);
}

nutBatNhac.onclick = async () => {
  await Notification.requestPermission();
  capNhatNutBatNhac();
};

// Gửi một thông báo lên điện thoại + hiện dòng nhắc trong app
async function guiThongBao(viec) {
  const tieuDe = "⏰ Đến giờ: " + viec.ten;
  const noiDung = viec.ghiChu || "Lúc " + viec.gio;

  if ("Notification" in window && Notification.permission === "granted") {
    const nguoiGiuKho = await navigator.serviceWorker.ready;
    nguoiGiuKho.showNotification(tieuDe, {
      body: noiDung,
      icon: "icons/icon-192.png",
      tag: viec.id, // tránh hiện trùng
    });
  }

  loiNhac.textContent = tieuDe;
  loiNhac.classList.remove("an");
  setTimeout(() => loiNhac.classList.add("an"), 8000);
}

let ngayDangHien = homNay();

function kiemTraNhacViec() {
  // Qua nửa đêm thì cập nhật lại ngày và danh sách
  if (homNay() !== ngayDangHien) {
    ngayDangHien = homNay();
    document.getElementById("ngay-hien-tai").textContent = ngayDeDoc(ngayDangHien);
    veDanhSach();
  }

  const bayGio = new Date();
  let coThayDoi = false;

  danhSachViec.forEach((viec) => {
    if (viec.xong || viec.daNhac || !viec.gio) return;
    const [nam, thang, ngay] = viec.ngay.split("-").map(Number);
    const [gio, phut] = viec.gio.split(":").map(Number);
    const lucNhac = new Date(nam, thang - 1, ngay, gio, phut);

    if (lucNhac <= bayGio) {
      viec.daNhac = true;
      coThayDoi = true;
      guiThongBao(viec);
    }
  });

  if (coThayDoi) luuDanhSach();
}

capNhatNutBatNhac();
kiemTraNhacViec();
setInterval(kiemTraNhacViec, 20000);
// Mở lại app từ nền thì kiểm tra ngay
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) kiemTraNhacViec();
});


// ----- 9. THÊM VÀO LỊCH ĐIỆN THOẠI -----
// Tạo một file lịch (.ics). Mở file này, điện thoại sẽ hỏi thêm vào ứng dụng Lịch,
// và Lịch sẽ nhắc đúng giờ kể cả khi app này đang tắt.

nutLichMay.onclick = () => {
  const viec = danhSachViec.find((v) => v.id === idDangSua);
  const thoiDiem = viec.ngay.replaceAll("-", "") + "T" + viec.gio.replace(":", "") + "00";
  const chu = (x) => x.replace(/[\\,;]/g, (k) => "\\" + k).replace(/\n/g, "\\n");

  const noiDungFile = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Viec Hom Nay//VI",
    "BEGIN:VEVENT",
    "UID:" + viec.id + "@viec-hom-nay",
    "DTSTAMP:" + new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z",
    "DTSTART:" + thoiDiem,
    "DURATION:PT30M",
    "SUMMARY:" + chu(viec.ten),
    "DESCRIPTION:" + chu(viec.ghiChu || ""),
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:" + chu(viec.ten),
    "TRIGGER:PT0M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const file = new Blob([noiDungFile], { type: "text/calendar" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(file);
  link.download = "viec.ics";
  link.click();
};
