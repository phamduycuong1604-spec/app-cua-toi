// =====================================================
// TRANG ⚙️ CÀI ĐẶT
// - Tài khoản: đổi mật khẩu, đăng xuất
// - Sửa danh sách gói màu và mục chi của riêng mình
// - Quản trị viên: cấp tài khoản, đặt lại mật khẩu, xóa tài khoản
// =====================================================

const manCaiDat = document.getElementById("man-cai-dat");
const cd = (id) => document.getElementById("cd-" + id);

// Bản nháp để sửa; bấm "Lưu" mới ghi vào cài đặt thật
let goiMauDangSua = [];
let mucChiDangSua = [];

function moCaiDat() {
  const toi = thongTinToi();
  const daDangNhap = CO_TAI_KHOAN && veDangNhap();
  cd("phan-tai-khoan").classList.toggle("an", !daDangNhap);
  cd("phan-quan-tri").classList.toggle("an", !(daDangNhap && toi.quanTri));
  cd("dong-bo").textContent = daDangNhap ? moTaTinhTrang() : "";
  cd("ten").textContent = daDangNhap ? `Đang đăng nhập: ${toi.ten}${toi.quanTri ? " (quản trị viên)" : ""}` : "";
  cd("mk-cu").value = cd("mk-moi").value = "";

  // Bản sao lưu cất lúc đăng nhập (nếu có)
  const saoLuu = docSo("sao-luu-may");
  cd("phan-sao-luu").classList.toggle("an", !saoLuu);
  if (saoLuu) {
    cd("sao-luu-mo-ta").textContent =
      `Cất lúc ${new Date(saoLuu.luc).toLocaleString("vi-VN")}: ${(saoLuu.viec || []).length} việc, ` +
      `${(saoLuu.thuChi || []).length} khoản thu chi. Gộp vào sẽ không xóa dữ liệu đang có, mục nào đã có thì bỏ qua.`;
  }

  goiMauDangSua = caiDat.goiMau.map((g) => ({ ...g }));
  mucChiDangSua = [...caiDat.mucChi];
  veSuaGoiMau();
  veSuaMucChi();
  if (daDangNhap && toi.quanTri) taiDanhSachNguoiDung();
  if (daDangNhap) taiDanhSachBanLuu();
  else cd("ban-luu").innerHTML = "";

  manCaiDat.classList.remove("an");
  manCaiDat.scrollTop = 0;
}

document.getElementById("nut-cai-dat").onclick = moCaiDat;
cd("dong").onclick = () => manCaiDat.classList.add("an");


// ----- 1. TÀI KHOẢN -----

cd("doi-mk").onclick = async () => {
  try {
    const { ve } = await goiMayChu("/tai-khoan/doi-mat-khau", {
      cach: "POST",
      than: { matKhauCu: cd("mk-cu").value, matKhauMoi: cd("mk-moi").value },
    });
    localStorage.setItem("ve-dang-nhap", ve);
    cd("mk-cu").value = cd("mk-moi").value = "";
    alert("Đã đổi mật khẩu! Các máy khác đang đăng nhập tài khoản này sẽ phải đăng nhập lại.");
  } catch (loi) {
    alert(loi.message);
  }
};

cd("dong-bo-ngay").onclick = async () => {
  const nut = cd("dong-bo-ngay");
  nut.disabled = true;
  nut.textContent = "Đang đồng bộ…";
  await guiLenTaiKhoan();
  await taiVeTuTaiKhoan();
  cd("dong-bo").textContent = moTaTinhTrang();
  nut.textContent = "🔄 Đồng bộ ngay";
  nut.disabled = false;
};

cd("dang-xuat").onclick = () => {
  if (confirm("Đăng xuất khỏi máy này? Dữ liệu vẫn được giữ trên tài khoản.")) dangXuat();
};


cd("khoi-phuc").onclick = () => {
  if (!confirm("Gộp bản sao lưu trên máy vào dữ liệu hiện tại?")) return;
  const soMoi = khoiPhucSaoLuu();
  alert(soMoi ? `Đã khôi phục ${soMoi} mục! Dữ liệu sẽ tự gửi lên tài khoản.` : "Mọi mục trong bản sao lưu đều đã có sẵn, không cần thêm gì.");
};


// ----- 1b. BẢN LƯU TỰ ĐỘNG TRÊN MÁY CHỦ + XUẤT/NHẬP FILE -----

const TEN_PHAN = { viec: "Lịch việc", "thu-chi": "Thu chi", "cai-dat": "Cài đặt" };

async function taiDanhSachBanLuu() {
  const khung = cd("ban-luu");
  khung.innerHTML = `<p class="tom-tat">Đang tải bản lưu…</p>`;
  let banLuu;
  try {
    ({ banLuu } = await goiMayChu("/du-lieu/lich-su"));
  } catch (loi) {
    khung.innerHTML = `<p class="tom-tat">Không tải được danh sách bản lưu (kiểm tra mạng).</p>`;
    return;
  }
  khung.innerHTML = "";
  if (!banLuu.length) {
    khung.innerHTML = `<p class="tom-tat">Chưa có bản lưu nào. Bản lưu đầu tiên sẽ được cất khi dữ liệu thay đổi.</p>`;
    return;
  }
  banLuu.slice(0, 20).forEach((b) => {
    const dong = document.createElement("div");
    dong.className = "dong-nguoi";
    const ten = document.createElement("b");
    ten.textContent = new Date(b.luc).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }) + " ";
    const phu = document.createElement("small");
    phu.textContent = "· " + TEN_PHAN[b.phan] + (b.soMuc !== null ? ` · ${b.soMuc} mục` : "");
    ten.appendChild(phu);
    const nut = document.createElement("button");
    nut.className = "nut-nho";
    nut.textContent = "Khôi phục";
    nut.onclick = () => khoiPhucBanLuu(b);
    dong.append(ten, nut);
    khung.appendChild(dong);
  });
}

async function khoiPhucBanLuu(b) {
  if (!confirm(`Khôi phục bản lưu ${TEN_PHAN[b.phan]} lúc ${new Date(b.luc).toLocaleString("vi-VN")}?\nChỉ thêm lại những mục đang thiếu, không xóa gì.`)) return;
  try {
    const { phan, giaTri } = await goiMayChu("/du-lieu/lich-su/" + b.ma);
    if (phan === "cai-dat") {
      caiDat = { ...caiDat, ...giaTri };
      luuCaiDat();
      moCaiDat();
      alert("Đã khôi phục cài đặt (gói màu, mục chi).");
      return;
    }
    const soMoi = themMucDaMat(phan, chuanHoaPhan(giaTri).muc);
    alert(soMoi ? `Đã khôi phục ${soMoi} mục ${TEN_PHAN[phan]}!` : "Bản lưu này không có mục nào đang thiếu.");
  } catch (loi) {
    alert(loi.message);
  }
}

// Xuất toàn bộ dữ liệu ra 1 file (lưu vào Tệp hoặc gửi Zalo cho chính mình)
cd("xuat-file").onclick = async () => {
  const duLieu = {
    app: "PHAHA",
    taiKhoan: thongTinToi().ten || null,
    luc: new Date().toISOString(),
    viec: danhSachViec,
    thuChi: danhSachThuChi,
    caiDat,
  };
  const ngay = homNay();
  const file = new File([JSON.stringify(duLieu, null, 1)], `phaha-sao-luu-${ngay}.json`, { type: "application/json" });
  // iPhone/Android: mở bảng Chia sẻ (Lưu vào Tệp, Zalo...); máy tính: tải file về
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Sao lưu PHAHA " + ngay });
      return;
    } catch (loi) {
      if (loi.name === "AbortError") return;
    }
  }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(file);
  link.download = file.name;
  link.click();
};

// Nhập file sao lưu: thêm lại các mục còn thiếu
cd("nhap-file").onclick = () => cd("o-file").click();
cd("o-file").onchange = async () => {
  const file = cd("o-file").files[0];
  cd("o-file").value = "";
  if (!file) return;
  try {
    const duLieu = JSON.parse(await file.text());
    if (duLieu.app !== "PHAHA") throw new Error("Đây không phải file sao lưu của PHAHA");
    const soMoi = themMucDaMat("viec", duLieu.viec) + themMucDaMat("thu-chi", duLieu.thuChi);
    alert(soMoi ? `Đã thêm lại ${soMoi} mục từ file sao lưu!` : "Mọi mục trong file đều đã có sẵn.");
  } catch (loi) {
    alert("Không đọc được file: " + loi.message);
  }
};


// ----- 2. GÓI MÀU & MỤC CHI -----

// Tạo một ô nhập nhỏ
function oNhap(giaTri, goiY, khiGo, them = {}) {
  const o = document.createElement("input");
  o.className = "o-nhap";
  o.value = giaTri;
  o.placeholder = goiY;
  Object.assign(o, them);
  o.oninput = () => khiGo(o.value);
  return o;
}

function nutBo(khiBam) {
  const nut = document.createElement("button");
  nut.type = "button";
  nut.className = "nut-bo";
  nut.textContent = "×";
  nut.setAttribute("aria-label", "Bỏ");
  nut.onclick = khiBam;
  return nut;
}

function veSuaGoiMau() {
  const khung = cd("goi-mau");
  khung.innerHTML = "";
  goiMauDangSua.forEach((goi, viTri) => {
    const dong = document.createElement("div");
    dong.className = "dong-sua";
    dong.append(
      oNhap(goi.ten, "Tên gói", (v) => (goi.ten = v)),
      oNhap(goi.gia ?? "", "Giá", (v) => (goi.gia = v === "" ? null : Number(v)), {
        type: "number",
        inputMode: "numeric",
        className: "o-nhap o-gia",
      }),
      nutBo(() => {
        goiMauDangSua.splice(viTri, 1);
        veSuaGoiMau();
      })
    );
    khung.appendChild(dong);
  });
}

function veSuaMucChi() {
  const khung = cd("muc-chi");
  khung.innerHTML = "";
  mucChiDangSua.forEach((muc, viTri) => {
    const dong = document.createElement("div");
    dong.className = "dong-sua";
    dong.append(
      oNhap(muc, "Tên mục", (v) => (mucChiDangSua[viTri] = v)),
      nutBo(() => {
        mucChiDangSua.splice(viTri, 1);
        veSuaMucChi();
      })
    );
    khung.appendChild(dong);
  });
}

cd("them-goi").onclick = () => {
  goiMauDangSua.push({ ten: "", gia: null });
  veSuaGoiMau();
  cd("goi-mau").lastChild.querySelector("input").focus();
};

cd("them-muc").onclick = () => {
  mucChiDangSua.push("");
  veSuaMucChi();
  cd("muc-chi").lastChild.querySelector("input").focus();
};

cd("luu-danh-sach").onclick = () => {
  caiDat.goiMau = goiMauDangSua
    .map((g) => ({ ten: g.ten.trim(), gia: g.gia > 0 ? g.gia : null }))
    .filter((g) => g.ten);
  caiDat.mucChi = mucChiDangSua.map((m) => m.trim()).filter(Boolean);
  luuCaiDat();
  goiMauDangSua = caiDat.goiMau.map((g) => ({ ...g }));
  mucChiDangSua = [...caiDat.mucChi];
  veSuaGoiMau();
  veSuaMucChi();
  alert("Đã lưu danh sách gói màu và mục chi.");
};


// ----- 3. QUẢN TRỊ: QUẢN LÝ TÀI KHOẢN -----

async function taiDanhSachNguoiDung() {
  const khung = cd("nguoi-dung");
  khung.innerHTML = `<p class="tom-tat">Đang tải…</p>`;
  let ds;
  try {
    ({ nguoiDung: ds } = await goiMayChu("/quan-tri/nguoi-dung"));
  } catch (loi) {
    khung.innerHTML = "";
    const p = document.createElement("p");
    p.className = "tom-tat";
    p.textContent = "Không tải được danh sách: " + loi.message;
    khung.appendChild(p);
    return;
  }

  khung.innerHTML = "";
  const toi = thongTinToi();
  ds.forEach((nguoi) => {
    const dong = document.createElement("div");
    dong.className = "dong-nguoi";
    const ten = document.createElement("b");
    ten.textContent = nguoi.ten + " ";
    const phu = document.createElement("small");
    phu.textContent = nguoi.quanTri ? "· quản trị" : "";
    ten.appendChild(phu);
    dong.appendChild(ten);

    const nutDatLai = document.createElement("button");
    nutDatLai.className = "nut-nho";
    nutDatLai.textContent = "Đặt lại MK";
    nutDatLai.onclick = async () => {
      const moi = prompt(`Mật khẩu mới cho "${nguoi.ten}" (ít nhất 6 ký tự):`);
      if (!moi) return;
      try {
        await goiMayChu("/quan-tri/dat-lai-mat-khau", { cach: "POST", than: { ten: nguoi.ten, matKhau: moi } });
        alert(`Đã đặt lại mật khẩu cho "${nguoi.ten}". Hãy gửi mật khẩu mới cho họ.`);
      } catch (loi) {
        alert(loi.message);
      }
    };
    dong.appendChild(nutDatLai);

    if (nguoi.ten !== toi.ten) {
      const nutXoa = document.createElement("button");
      nutXoa.className = "nut-nho do";
      nutXoa.textContent = "Xóa";
      nutXoa.onclick = async () => {
        if (!confirm(`Xóa tài khoản "${nguoi.ten}" và TOÀN BỘ dữ liệu của họ? Không khôi phục được.`)) return;
        try {
          await goiMayChu("/quan-tri/xoa", { cach: "POST", than: { ten: nguoi.ten } });
          taiDanhSachNguoiDung();
        } catch (loi) {
          alert(loi.message);
        }
      };
      dong.appendChild(nutXoa);
    }
    khung.appendChild(dong);
  });
}

cd("tao-tai-khoan").onclick = async () => {
  const ten = cd("ten-moi").value.trim();
  const matKhau = cd("mk-nguoi-moi").value;
  try {
    await goiMayChu("/quan-tri/nguoi-dung", {
      cach: "POST",
      than: { ten, matKhau, quanTri: cd("la-quan-tri").checked },
    });
    alert(`Đã tạo tài khoản!\n\nGửi cho người dùng:\n• Link app: ${location.origin + location.pathname}\n• Tên đăng nhập: ${ten.toLowerCase()}\n• Mật khẩu: ${matKhau}\n\nNhắc họ vào ⚙️ Cài đặt để đổi mật khẩu.`);
    cd("ten-moi").value = cd("mk-nguoi-moi").value = "";
    cd("la-quan-tri").checked = false;
    taiDanhSachNguoiDung();
  } catch (loi) {
    alert(loi.message);
  }
};
