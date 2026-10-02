// =====================================================
// QUẢN LÝ THU CHI (tab "Thu chi")
// Mỗi khoản là một "hộp" thông tin như sau:
//   Bán preset: { id, loai: "preset", ngay, tenPreset, soLuong, giaGoi, nguon, ghiChu }
//   Thu khác:   { id, loai: "thu",    ngay, noiDung, soTien, ghiChu }
//   Chi:        { id, loai: "chi",    ngay, noiDung, soTien, ghiChu }
// (Các hàm ngày tháng như homNay, ngayDeDoc... lấy từ app.js)
// =====================================================


// ----- 1. LƯU VÀ ĐỌC DỮ LIỆU (cuốn sổ riêng, không lẫn với sổ công việc) -----

const SO_THU_CHI = "so-thu-chi";
const CAC_NGUON = ["TikTok", "Facebook", "Instagram", "Zalo", "Khác"];

// Các gói màu bán sẵn: bấm 1 cái là điền tên + giá.
// gia: null = combo tùy biến, tự gõ giá. Muốn thêm/bớt gói thì sửa danh sách này.
const CAC_GOI_MAU = [
  { ten: "KODAK FILM WEDDING – Preset màu film Kodak 2026", gia: 100000 },
  { ten: "TỬ CHU BAY – Full Collection", gia: 150000 },
  { ten: "BLACK PIXEL – 15 bộ sưu tập màu cưới 2026", gia: 200000 },
  { ten: "BLACK PIXEL – 52 preset phóng sự cưới", gia: 100000 },
  { ten: "KINDNESS KINDRED – Gói preset đa nền tảng", gia: 200000 },
  { ten: "Combo 1", gia: null },
  { ten: "Combo 2", gia: null },
  { ten: "Combo 3", gia: null },
  { ten: "Combo 4", gia: null },
];

function docThuChi() {
  try {
    return JSON.parse(localStorage.getItem(SO_THU_CHI)) || [];
  } catch (loi) {
    return [];
  }
}

function luuThuChi() {
  localStorage.setItem(SO_THU_CHI, JSON.stringify(danhSachThuChi));
}

let danhSachThuChi = docThuChi();

// Số tiền của một khoản (bán preset = số lượng × giá gói)
function soTienCua(khoan) {
  return khoan.loai === "preset" ? khoan.soLuong * khoan.giaGoi : khoan.soTien;
}

// Ví dụ: 1250000 → "1.250.000 đ"
function dinhDangTien(so) {
  return Math.round(so).toLocaleString("vi-VN") + " đ";
}


// ----- 2. CHUYỂN TAB "LỊCH VIỆC" ↔ "THU CHI" -----

let tabDangMo = "trang-lich";

document.querySelectorAll(".tab").forEach((tab) => {
  tab.onclick = () => {
    tabDangMo = tab.dataset.trang;
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("dang-chon", t === tab));
    document.getElementById("trang-lich").classList.toggle("an", tabDangMo !== "trang-lich");
    document.getElementById("trang-thu-chi").classList.toggle("an", tabDangMo !== "trang-thu-chi");
    if (tabDangMo === "trang-thu-chi") veThuChi();
    window.scrollTo(0, 0);
  };
});

// Nút "+" thêm việc hoặc thêm khoản thu chi, tùy tab đang mở
document.getElementById("nut-them").onclick = () => {
  if (tabDangMo === "trang-thu-chi") moKhungThuChi(null);
  else moKhungNhap(null);
};


// ----- 3. CHỌN KỲ XEM: NGÀY / THÁNG / NĂM -----

let kyXem = "thang";          // "ngay", "thang" hoặc "nam"
let ngayMoc = homNay();       // một ngày nằm trong kỳ đang xem

document.querySelectorAll(".nut-ky").forEach((nut) => {
  nut.onclick = () => {
    // Nếu kỳ đang xem có chứa hôm nay thì đổi kiểu xem vẫn giữ ở hôm nay
    if (trongKy({ ngay: homNay() })) ngayMoc = homNay();
    kyXem = nut.dataset.ky;
    document.querySelectorAll(".nut-ky").forEach((n) => n.classList.toggle("dang-chon", n === nut));
    veThuChi();
  };
});

// Lùi / tiến 1 ngày, 1 tháng hoặc 1 năm
function doiKy(buoc) {
  const d = chuThanhNgay(ngayMoc);
  if (kyXem === "ngay") d.setDate(d.getDate() + buoc);
  if (kyXem === "thang") d.setMonth(d.getMonth() + buoc, 1);
  if (kyXem === "nam") d.setFullYear(d.getFullYear() + buoc, 0, 1);
  ngayMoc = ngayThanhChu(d);
  veThuChi();
}
document.getElementById("ky-truoc").onclick = () => doiKy(-1);
document.getElementById("ky-sau").onclick = () => doiKy(1);

// Khoản này có nằm trong kỳ đang xem không?
// (so phần đầu của chữ ngày: "2026-10-02" / "2026-10" / "2026")
function doDaiMa() {
  return kyXem === "ngay" ? 10 : kyXem === "thang" ? 7 : 4;
}
function trongKy(khoan) {
  return khoan.ngay.slice(0, doDaiMa()) === ngayMoc.slice(0, doDaiMa());
}

function tenKy() {
  const [nam, thang] = ngayMoc.split("-");
  if (kyXem === "ngay") return ngayMoc === homNay() ? "Hôm nay · " + ngayDeDoc(ngayMoc) : ngayDeDoc(ngayMoc);
  if (kyXem === "thang") return `Tháng ${Number(thang)}, ${nam}`;
  return `Năm ${nam}`;
}


// ----- 4. VẼ TAB THU CHI -----

function veThuChi() {
  document.getElementById("ten-ky").textContent = tenKy();

  const cacKhoan = danhSachThuChi.filter(trongKy);
  const tongThu = cacKhoan.filter((k) => k.loai !== "chi").reduce((t, k) => t + soTienCua(k), 0);
  const tongChi = cacKhoan.filter((k) => k.loai === "chi").reduce((t, k) => t + soTienCua(k), 0);

  document.getElementById("tong-thu").textContent = dinhDangTien(tongThu);
  document.getElementById("tong-chi").textContent = dinhDangTien(tongChi);
  const conLai = document.getElementById("con-lai");
  conLai.textContent = (tongThu - tongChi < 0 ? "−" : "") + dinhDangTien(Math.abs(tongThu - tongChi));

  vePhanPreset(cacKhoan.filter((k) => k.loai === "preset"));
  veChiaNho(cacKhoan);
  veDanhSachKhoan(cacKhoan);
}

// Vẽ các thanh ngang: mỗi dòng gồm tên, thanh dài theo giá trị, và số tiền
function veThanhNgang(khung, cacDong, chuPhu) {
  khung.innerHTML = "";
  if (!cacDong.length) {
    khung.innerHTML = `<p class="trong">Chưa có dữ liệu</p>`;
    return;
  }
  const lonNhat = Math.max(...cacDong.map((d) => d.giaTri), 1);
  cacDong.forEach((d) => {
    const dong = document.createElement("div");
    dong.className = "dong-thanh";
    const ten = document.createElement("span");
    ten.className = "ten-thanh";
    ten.textContent = d.ten;
    const vach = document.createElement("div");
    vach.className = "vach-thanh";
    const phan = document.createElement("i");
    phan.style.width = Math.max((d.giaTri / lonNhat) * 100, d.giaTri > 0 ? 2 : 0) + "%";
    vach.appendChild(phan);
    const so = document.createElement("span");
    so.className = "so-thanh";
    so.textContent = dinhDangTien(d.giaTri) + (chuPhu ? chuPhu(d) : "");
    dong.append(ten, vach, so);
    khung.appendChild(dong);
  });
}

// Gom các khoản theo một "chìa khóa" (nguồn, tên preset, ngày...) rồi cộng tiền
function gomNhom(cacKhoan, layKhoa) {
  const nhom = {};
  cacKhoan.forEach((k) => {
    const khoa = layKhoa(k);
    nhom[khoa] = nhom[khoa] || { ten: khoa, giaTri: 0, soLuong: 0 };
    nhom[khoa].giaTri += soTienCua(k);
    nhom[khoa].soLuong += k.soLuong || 0;
  });
  return Object.values(nhom);
}

function vePhanPreset(cacBan) {
  const doanhThu = cacBan.reduce((t, k) => t + soTienCua(k), 0);
  const soGoi = cacBan.reduce((t, k) => t + k.soLuong, 0);
  document.getElementById("doanh-thu-preset").textContent = dinhDangTien(doanhThu);
  document.getElementById("tom-tat-preset").textContent = `${soGoi} gói · ${cacBan.length} đơn`;

  // Nguồn khách: giữ đúng thứ tự TikTok, Facebook... (bỏ nguồn không có đơn)
  const theoNguon = gomNhom(cacBan, (k) => k.nguon);
  theoNguon.sort((a, b) => CAC_NGUON.indexOf(a.ten) - CAC_NGUON.indexOf(b.ten));
  veThanhNgang(document.getElementById("theo-nguon"), theoNguon, (d) => ` · ${d.soLuong} gói`);

  // Preset bán chạy: nhiều tiền nhất lên đầu, tối đa 5
  const theoPreset = gomNhom(cacBan, (k) => k.tenPreset).sort((a, b) => b.giaTri - a.giaTri).slice(0, 5);
  veThanhNgang(document.getElementById("theo-preset"), theoPreset, (d) => ` · ${d.soLuong} gói`);
}

// Xem tháng → doanh thu từng ngày; xem năm → doanh thu từng tháng; xem ngày → ẩn
function veChiaNho(cacKhoan) {
  const khung = document.getElementById("khung-chia-nho");
  khung.classList.toggle("an", kyXem === "ngay");
  if (kyXem === "ngay") return;

  const cacThu = cacKhoan.filter((k) => k.loai !== "chi");
  let cacDong;
  if (kyXem === "thang") {
    document.getElementById("tieu-de-chia-nho").textContent = "📈 Doanh thu từng ngày";
    cacDong = gomNhom(cacThu, (k) => k.ngay)
      .sort((a, b) => a.ten.localeCompare(b.ten))
      .map((d) => ({ ...d, ten: d.ten.slice(8, 10) + "/" + d.ten.slice(5, 7) }));
  } else {
    document.getElementById("tieu-de-chia-nho").textContent = "📈 Doanh thu từng tháng";
    const theoThang = gomNhom(cacThu, (k) => k.ngay.slice(0, 7));
    // Đủ 12 tháng, tháng không có thu thì bằng 0
    cacDong = Array.from({ length: 12 }, (_, i) => {
      const ma = ngayMoc.slice(0, 4) + "-" + String(i + 1).padStart(2, "0");
      const co = theoThang.find((d) => d.ten === ma);
      return { ten: "Th " + (i + 1), giaTri: co ? co.giaTri : 0 };
    });
  }
  veThanhNgang(document.getElementById("chia-nho"), cacDong);
}

function veDanhSachKhoan(cacKhoan) {
  const khung = document.getElementById("danh-sach-thu-chi");
  khung.innerHTML = "";
  if (!cacKhoan.length) {
    khung.innerHTML = `<p class="trong">Chưa có khoản nào.<br>Bấm nút + để thêm.</p>`;
    return;
  }

  // Mới nhất lên đầu, chia nhóm theo ngày
  const sapXep = [...cacKhoan].sort((a, b) => b.ngay.localeCompare(a.ngay) || b.id.localeCompare(a.id));
  let ngayTruoc = null;
  sapXep.forEach((k) => {
    if (k.ngay !== ngayTruoc && kyXem !== "ngay") {
      const tieuDe = document.createElement("p");
      tieuDe.className = "tieu-de-ngay-tc";
      tieuDe.textContent = ngayDeDoc(k.ngay);
      khung.appendChild(tieuDe);
      ngayTruoc = k.ngay;
    }

    const dong = document.createElement("button");
    dong.className = "khoan khoan-" + k.loai;
    dong.onclick = () => moKhungThuChi(k);

    const bieuTuong = document.createElement("span");
    bieuTuong.className = "bieu-tuong";
    bieuTuong.textContent = k.loai === "preset" ? "🎨" : k.loai === "thu" ? "➕" : "➖";

    const giua = document.createElement("span");
    giua.className = "giua";
    const ten = document.createElement("b");
    ten.textContent = k.loai === "preset" ? k.tenPreset : k.noiDung;
    const phu = document.createElement("small");
    phu.textContent =
      k.loai === "preset"
        ? `${k.soLuong} × ${dinhDangTien(k.giaGoi)} · ${k.nguon}`
        : k.loai === "thu" ? "Thu khác" : "Chi";
    if (k.ghiChu) phu.textContent += " · " + k.ghiChu;
    giua.append(ten, phu);

    const tien = document.createElement("span");
    tien.className = "tien";
    tien.textContent = (k.loai === "chi" ? "−" : "+") + dinhDangTien(soTienCua(k));

    dong.append(bieuTuong, giua, tien);
    khung.appendChild(dong);
  });
}


// ----- 5. KHUNG NHẬP THU CHI -----

const khungTC = document.getElementById("khung-thu-chi");
const nenMoTC = document.getElementById("nen-mo-tc");
const tc = (id) => document.getElementById("tc-" + id);

let idKhoanDangSua = null;
let loaiDangChon = "preset";
let nguonDangChon = CAC_NGUON[0];

// Vẽ các nút chọn nguồn khách
function veChonNguon() {
  const khung = document.getElementById("chon-nguon");
  khung.innerHTML = "";
  CAC_NGUON.forEach((nguon) => {
    const nut = document.createElement("button");
    nut.type = "button";
    nut.className = "nut-nguon" + (nguon === nguonDangChon ? " dang-chon" : "");
    nut.textContent = nguon;
    nut.onclick = () => {
      nguonDangChon = nguon;
      veChonNguon();
    };
    khung.appendChild(nut);
  });
}

function chonLoai(loai) {
  loaiDangChon = loai;
  document.querySelectorAll(".nut-loai").forEach((n) => n.classList.toggle("dang-chon", n.dataset.loai === loai));
  document.getElementById("phan-preset").classList.toggle("an", loai !== "preset");
  document.getElementById("phan-thu-chi-khac").classList.toggle("an", loai === "preset");
}
document.querySelectorAll(".nut-loai").forEach((nut) => (nut.onclick = () => chonLoai(nut.dataset.loai)));

// Vẽ các nút gói màu; gói đang chọn được tô màu
function veChonGoi() {
  const khung = document.getElementById("chon-goi");
  khung.innerHTML = "";
  CAC_GOI_MAU.forEach((goi) => {
    const nut = document.createElement("button");
    nut.type = "button";
    nut.className = "nut-goi" + (tc("ten-preset").value.trim() === goi.ten ? " dang-chon" : "");
    const ten = document.createElement("span");
    ten.textContent = goi.ten;
    const gia = document.createElement("small");
    gia.textContent = goi.gia ? dinhDangTien(goi.gia) : "Tự nhập giá";
    nut.append(ten, gia);
    nut.onclick = () => {
      tc("ten-preset").value = goi.ten;
      tc("gia-goi").value = goi.gia || "";
      capNhatThanhTien();
      veChonGoi();
      if (!goi.gia) tc("gia-goi").focus(); // combo: nhảy tới ô giá để gõ luôn
    };
    khung.appendChild(nut);
  });
}
tc("ten-preset").addEventListener("input", veChonGoi);

// Thành tiền tự tính khi gõ số lượng / giá gói
function capNhatThanhTien() {
  const thanhTien = (Number(tc("so-luong").value) || 0) * (Number(tc("gia-goi").value) || 0);
  tc("thanh-tien").textContent = dinhDangTien(thanhTien);
}
tc("so-luong").oninput = capNhatThanhTien;
tc("gia-goi").oninput = capNhatThanhTien;

// Gợi ý tên preset đã từng bán (gõ vài chữ là hiện ra)
function capNhatGoiYPreset() {
  const cacTen = [...new Set(danhSachThuChi.filter((k) => k.loai === "preset").map((k) => k.tenPreset))];
  const ds = document.getElementById("ds-ten-preset");
  ds.innerHTML = "";
  cacTen.forEach((ten) => {
    const lc = document.createElement("option");
    lc.value = ten;
    ds.appendChild(lc);
  });
}

// Chọn tên preset cũ thì tự điền giá gói lần bán gần nhất
tc("ten-preset").onchange = () => {
  const lanTruoc = danhSachThuChi
    .filter((k) => k.loai === "preset" && k.tenPreset === tc("ten-preset").value.trim())
    .sort((a, b) => b.ngay.localeCompare(a.ngay))[0];
  if (lanTruoc && !tc("gia-goi").value) {
    tc("gia-goi").value = lanTruoc.giaGoi;
    capNhatThanhTien();
  }
};

// khoan = null nghĩa là thêm mới
function moKhungThuChi(khoan) {
  idKhoanDangSua = khoan ? khoan.id : null;
  document.getElementById("tieu-de-thu-chi").textContent = khoan ? "Sửa khoản" : "Thêm khoản mới";
  chonLoai(khoan ? khoan.loai : "preset");
  // Thêm mới: lấy ngày đang xem nếu xem theo ngày, còn lại lấy hôm nay
  tc("ngay").value = khoan ? khoan.ngay : (kyXem === "ngay" ? ngayMoc : homNay());
  tc("ten-preset").value = khoan && khoan.loai === "preset" ? khoan.tenPreset : "";
  tc("so-luong").value = khoan && khoan.loai === "preset" ? khoan.soLuong : 1;
  tc("gia-goi").value = khoan && khoan.loai === "preset" ? khoan.giaGoi : "";
  tc("noi-dung").value = khoan && khoan.loai !== "preset" ? khoan.noiDung : "";
  tc("so-tien").value = khoan && khoan.loai !== "preset" ? khoan.soTien : "";
  tc("ghi-chu").value = khoan ? khoan.ghiChu : "";
  nguonDangChon = khoan && khoan.loai === "preset" ? khoan.nguon : CAC_NGUON[0];
  veChonNguon();
  veChonGoi();
  capNhatThanhTien();
  capNhatGoiYPreset();
  tc("xoa").classList.toggle("an", !khoan);

  khungTC.classList.remove("an");
  nenMoTC.classList.remove("an");
  khungTC.scrollTop = 0;
}

function dongKhungThuChi() {
  khungTC.classList.add("an");
  nenMoTC.classList.add("an");
}

khungTC.onsubmit = (suKien) => {
  suKien.preventDefault();

  const khoan = { loai: loaiDangChon, ngay: tc("ngay").value, ghiChu: tc("ghi-chu").value.trim() };
  if (loaiDangChon === "preset") {
    khoan.tenPreset = tc("ten-preset").value.trim();
    khoan.soLuong = Number(tc("so-luong").value);
    khoan.giaGoi = Number(tc("gia-goi").value);
    khoan.nguon = nguonDangChon;
    if (!khoan.tenPreset) return alert("Bạn chưa nhập tên preset.");
    if (!(khoan.soLuong > 0)) return alert("Số lượng phải lớn hơn 0.");
    if (!(khoan.giaGoi >= 0) || tc("gia-goi").value === "") return alert("Bạn chưa nhập giá gói.");
  } else {
    khoan.noiDung = tc("noi-dung").value.trim();
    khoan.soTien = Number(tc("so-tien").value);
    if (!khoan.noiDung) return alert("Bạn chưa nhập nội dung.");
    if (!(khoan.soTien > 0)) return alert("Số tiền phải lớn hơn 0.");
  }

  if (idKhoanDangSua) {
    // Thay hẳn khoản cũ (vì đổi loại thì các trường cũng khác)
    const viTri = danhSachThuChi.findIndex((k) => k.id === idKhoanDangSua);
    danhSachThuChi[viTri] = { id: idKhoanDangSua, ...khoan };
  } else {
    danhSachThuChi.push({ id: String(Date.now()), ...khoan });
  }

  // Chuyển tới kỳ có khoản vừa lưu để thấy ngay
  ngayMoc = khoan.ngay;
  luuThuChi();
  veThuChi();
  dongKhungThuChi();
};

tc("xoa").onclick = () => {
  if (confirm("Xóa khoản này?")) {
    danhSachThuChi = danhSachThuChi.filter((k) => k.id !== idKhoanDangSua);
    luuThuChi();
    veThuChi();
    dongKhungThuChi();
  }
};
tc("huy").onclick = dongKhungThuChi;
nenMoTC.onclick = dongKhungThuChi;


// ----- 6. NHẬP DỮ LIỆU TỪ GOOGLE SHEETS -----
// Bảng tính dạng: Ngày | Tên preset | Số lượng | Thành tiền  (dòng 1 là tiêu đề)
// - Ô ngày gộp cho nhiều dòng → dòng trống ngày thì lấy ngày của dòng trên
// - Ngày viết "17/8" hoặc "20.8" (không có năm) → lấy năm nay;
//   nếu ra ngày ở tương lai thì hiểu là năm ngoái
// - Mỗi dòng chỉ nhập 1 lần: nhập lại (bằng link hay file) sẽ bỏ qua dòng đã có

// Đọc chữ CSV thành bảng (hiểu cả ô có dấu phẩy nằm trong ngoặc kép)
function docCSV(chu) {
  const bang = [[]];
  let o = "", trongNgoac = false;
  for (let i = 0; i < chu.length; i++) {
    const k = chu[i];
    if (trongNgoac) {
      if (k === '"' && chu[i + 1] === '"') { o += '"'; i++; }
      else if (k === '"') trongNgoac = false;
      else o += k;
    } else if (k === '"') trongNgoac = true;
    else if (k === ",") { bang[bang.length - 1].push(o); o = ""; }
    else if (k === "\n") { bang[bang.length - 1].push(o); bang.push([]); o = ""; }
    else if (k !== "\r") o += k;
  }
  bang[bang.length - 1].push(o);
  return bang;
}

// "17/8", "20.8", "24/9/2026" → "2026-08-17"
function docNgaySheet(chu) {
  const so = (chu.match(/\d+/g) || []).map(Number);
  if (so.length < 2) return null;
  const [ngay, thang] = so;
  if (ngay < 1 || ngay > 31 || thang < 1 || thang > 12) return null;
  let nam = so[2] ? (so[2] < 100 ? 2000 + so[2] : so[2]) : new Date().getFullYear();
  let ketQua = ngayThanhChu(new Date(nam, thang - 1, ngay));
  if (!so[2] && ketQua > homNay()) ketQua = ngayThanhChu(new Date(nam - 1, thang - 1, ngay));
  return ketQua;
}

// "1.250.000", "1,250,000 đ", "1250000" → 1250000
function docTienSheet(chu) {
  const chiSo = String(chu).replace(/[^\d]/g, "");
  return chiSo ? Number(chiSo) : 0;
}

// Biến bảng thành danh sách khoản "bán preset"
function bangThanhKhoan(bang) {
  const cacKhoan = [];
  const soLanGap = {}; // đếm các dòng giống hệt nhau trong cùng ngày
  let ngayDangCo = null;
  bang.slice(1).forEach((dong) => {
    const [oNgay = "", oTen = "", oSoLuong = "", oThanhTien = ""] = dong;
    if (oNgay.trim()) ngayDangCo = docNgaySheet(oNgay) || ngayDangCo;
    const ten = oTen.trim();
    const soLuong = docTienSheet(oSoLuong) || 1;
    const thanhTien = docTienSheet(oThanhTien);
    if (!ten || !thanhTien || !ngayDangCo) return; // bỏ dòng trống / dòng tổng

    // "Dấu vân tay" của dòng để không nhập trùng
    const dauVanTay = `${ngayDangCo}|${ten.toLowerCase()}|${soLuong}|${thanhTien}`;
    soLanGap[dauVanTay] = (soLanGap[dauVanTay] || 0) + 1;
    cacKhoan.push({
      id: "nhap|" + dauVanTay + "|" + soLanGap[dauVanTay],
      loai: "preset",
      ngay: ngayDangCo,
      tenPreset: ten,
      soLuong,
      giaGoi: thanhTien / soLuong, // bảng ghi thành tiền → chia ra giá 1 gói
      nguon: "Khác",
      ghiChu: "Nhập từ Google Sheets",
    });
  });
  return cacKhoan;
}

function themCacKhoanNhap(cacKhoan) {
  const daCo = new Set(danhSachThuChi.map((k) => k.id));
  const moi = cacKhoan.filter((k) => !daCo.has(k.id));
  if (!cacKhoan.length) return alert("Không tìm thấy dòng nào. Bảng tính cần các cột: Ngày | Tên | Số lượng | Thành tiền.");
  if (!moi.length) return alert(`Cả ${cacKhoan.length} dòng đều đã được nhập trước đó rồi.`);

  const tong = moi.reduce((t, k) => t + soTienCua(k), 0);
  const tuNgay = moi.map((k) => k.ngay).sort()[0];
  const denNgay = moi.map((k) => k.ngay).sort().pop();
  const loiHoi =
    `Tìm thấy ${moi.length} dòng bán preset mới` +
    (moi.length < cacKhoan.length ? ` (bỏ qua ${cacKhoan.length - moi.length} dòng đã nhập)` : "") +
    `\nTừ ${ngayDeDoc(tuNgay)} đến ${ngayDeDoc(denNgay)}\nTổng: ${dinhDangTien(tong)}\n\nThêm tất cả vào app?`;
  if (!confirm(loiHoi)) return;

  danhSachThuChi.push(...moi);
  luuThuChi();
  // Chuyển sang xem tháng có lần bán mới nhất
  kyXem = "thang";
  ngayMoc = denNgay;
  document.querySelectorAll(".nut-ky").forEach((n) => n.classList.toggle("dang-chon", n.dataset.ky === "thang"));
  veThuChi();
  alert(`Đã thêm ${moi.length} dòng! Nguồn khách đang để "Khác", bấm vào từng dòng để sửa nếu cần.`);
}

// Cách 1: dán link Google Sheets → app tự tải về
document.getElementById("nut-nhap-link").onclick = async () => {
  const link = prompt("Dán link Google Sheets (đã chia sẻ \"Bất kỳ ai có đường liên kết\"):", localStorage.getItem("link-sheet") || "");
  if (!link) return;
  const maSheet = (link.match(/\/d\/([\w-]+)/) || [])[1];
  if (!maSheet) return alert("Link chưa đúng. Link cần có dạng docs.google.com/spreadsheets/d/...");
  const maTrang = (link.match(/[#&?]gid=(\d+)/) || [])[1] || "0";
  localStorage.setItem("link-sheet", link);

  try {
    const ketQua = await fetch(`https://docs.google.com/spreadsheets/d/${maSheet}/export?format=csv&gid=${maTrang}`);
    if (!ketQua.ok) throw new Error("mã lỗi " + ketQua.status);
    const chu = await ketQua.text();
    if (chu.trim().startsWith("<")) throw new Error("bảng tính chưa mở quyền xem");
    themCacKhoanNhap(bangThanhKhoan(docCSV(chu)));
  } catch (loi) {
    alert(
      "Không tải được bảng tính (" + loi.message + ").\n\n" +
      "Kiểm tra: Chia sẻ → \"Bất kỳ ai có đường liên kết\".\n" +
      "Hoặc dùng nút \"Chọn file CSV\": trong Google Sheets chọn Tệp → Tải xuống → CSV."
    );
  }
};

// Cách 2: chọn file CSV đã tải về máy
const oFileCSV = document.getElementById("o-file-csv");
document.getElementById("nut-nhap-file").onclick = () => oFileCSV.click();
oFileCSV.onchange = async () => {
  const file = oFileCSV.files[0];
  if (!file) return;
  const chu = await file.text();
  oFileCSV.value = "";
  themCacKhoanNhap(bangThanhKhoan(docCSV(chu)));
};
