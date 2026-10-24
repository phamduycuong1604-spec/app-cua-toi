// =====================================================
// PhaHa – Lồng tiếng video Trung → Việt
// Quy trình: chọn video → tách tiếng → nghe & dịch → (tự kiểm tra phụ đề) → lồng tiếng Việt
//            → tách nhạc nền → chèn phụ đề/lớp che/logo → xuất video
// Mọi thứ chạy ngay trên điện thoại, chỉ gửi phần âm thanh/chữ lên dịch vụ AI.
//
// Các phần:
//   nen.js        cài đặt, trạng thái chung, nhật ký, đếm lượt
//   video.js      ffmpeg: đọc video, tách tiếng, tách nhạc nền, xuất video
//   nghe-dich.js  nghe tiếng Trung & dịch (Gemini / DeepSeek / dự phòng)
//   giong-doc.js  9 dịch vụ đọc tiếng Việt + lồng tiếng cả video
//   gemini.js     gọi Gemini (xoay mã, chờ giới hạn, giữ 1 loại cho giọng đồng nhất)
//   lop-phu.js    vẽ phụ đề/lớp che/logo lên hình
//   giao-dien.js, cai-dat-ui.js, dong-bo-ui.js, kiem-ma.js  màn hình & cài đặt
//   cua-vao.js    chỉ tài khoản do chủ app cấp (còn hạn) mới dùng được app
// =====================================================
import { $, caiDat, S, nhat, buoc, ghiChu, baoLoi, batDauNhat, giayDaChay, ghiDangChay, ghiMocCaiDat, moTaMay, dongHo } from "./nen.js";
import { canVe, veLop, xuatHinh } from "./lop-phu.js";
import { KENH } from "./chuyen-mon.js";
import { batDauLanMoiGemini, maNghe } from "./gemini.js";
import { ngheVaDich, duPhong, dungDeepSeek, batDauLanMoiNghe } from "./nghe-dich.js";
import { longTieng, dvDocDung, DICH_VU, tenGiong } from "./giong-doc.js";
import { taiFfmpeg, tatFfmpeg, ffDangBat, ganVideo, tachTieng, tachNhacNen, dungTachNhac, xuatVideo, ghiDoToGoc } from "./video.js";
import { khoiDongGiaoDien, veLoiThoai, choKiemPhuDe, hienKetQua } from "./giao-dien.js";
import { khoiDongCaiDat, moCaiDat } from "./cai-dat-ui.js";
import { khoiDongDongBo } from "./dong-bo-ui.js";
import { khoiDongKiemMa } from "./kiem-ma.js";
import { loiDeHieu } from "./loi.js";
import { khoiDongCuaVao, kiemTraVao } from "./cua-vao.js";

// Tách nhạc và chèn chữ chạy CÙNG LÚC thì nhanh hơn ~1 phút nhưng iPhone hay tràn bộ nhớ và tắt trang
// → mặc định chạy LẦN LƯỢT (chỉ chạy cùng lúc khi bật "phaha-song-song" = "bat", dành cho máy mạnh).
const docSongSong = () => { try { return localStorage.getItem("phaha-song-song"); } catch { return null; } };
const giuManHinh = async () => { try { return await navigator.wakeLock?.request("screen"); } catch { return null; } };
const canTachNhacLai = () => S.nhacNen?.tep !== S.tepVideo || S.nhacNen.loai !== caiDat.mhTach;

function ghiCaiDatVaoNhat(lamTuDau) {
  const l = caiDat.lop;
  nhat(`BẮT ĐẦU ${lamTuDau ? "(làm từ đầu)" : "(làm lại)"} · ${new Date().toLocaleString("vi-VN")}`);
  nhat(`Máy: ${moTaMay()}`);
  nhat(`Video: ${S.tepVideo.name} · ${(S.tepVideo.size / 1048576).toFixed(1)}MB`);
  nhat([
    `Cài đặt: dịch bằng ${dungDeepSeek() ? "DeepSeek (nghe bằng Groq/Cloudflare)" : "Gemini"}`,
    `thứ tự giọng ${dvDocDung(true).map((dv) => DICH_VU[dv].ten + (tenGiong(dv) ? " / " + tenGiong(dv) : "")).join(" → ")}`,
    `tách nhạc: ${caiDat.tachNhac ? caiDat.mhTach : "tắt"}`,
    `phụ đề: ${l.phuDe.bat ? "bật" : "tắt"}`,
    `chuyên môn: ${KENH[caiDat.kenh]?.label || "thông thường"}${caiDat.quyTacRieng?.[caiDat.kenh]?.trim() ? " + quy tắc riêng" : ""}`,
    `lớp che: ${[l.che.bat && "thanh 1", l.che2?.bat && "thanh 2"].filter(Boolean).join(" + ") || "tắt"}`,
    `logo: ${l.logo.bat && S.anhLogo ? "bật" : "tắt"}`,
  ].join(" · "));
}

// =====================================================
// CHẠY CẢ QUY TRÌNH
// lamTuDau = true: tách tiếng + nghe & dịch lại; false: dùng lời thoại đang sửa trong bảng
// =====================================================
async function chay(lamTuDau) {
  if (S.dangChay || !S.tepVideo) return;
  if (!(await kiemTraVao())) return; // tài khoản hết hạn / bị thu hồi → không cho chạy
  if (!maNghe() && !duPhong.coDuPhong()) {
    alert("Cần dán mã Gemini vào ô “Mã Gemini” trên cùng trong ⚙️ Cài đặt (hoặc cài dịch vụ dự phòng) trước nhé.");
    moCaiDat();
    return;
  }
  S.dangChay = true;
  batDauLanMoiGemini();
  batDauLanMoiNghe();
  batDauNhat();
  ghiCaiDatVaoNhat(lamTuDau);
  ["nut-bat-dau", "nut-lam-lai"].forEach((id) => ($(id).disabled = true));
  $("the-tien-do").classList.remove("an");
  $("the-ket-qua").classList.add("an");
  baoLoi("");
  ["tai", "tach", "dich", "nhac", "long", "ve", "xuat"].forEach((b) => buoc(b, "cho"));
  if (!lamTuDau) { buoc("tach", "bo"); buoc("dich", "bo", "Dùng lời thoại bạn đã sửa"); }
  const khoaMan = await giuManHinh();
  const viec = { buocDang: "tai", huaNhacSom: null };
  try {
    await quyTrinh(lamTuDau, viec);
  } catch (loi) {
    console.error(loi);
    nhat("❌ Chi tiết lỗi: " + (loi?.message || loi) + (loi?.status ? ` (mã ${loi.status})` : ""));
    buoc(viec.buocDang, "loi");
    baoLoi(loiDeHieu(loi));
  } finally {
    // Lỗi giữa chừng mà tách nhạc (chạy song song) vẫn đang làm → dừng hẳn để lần sau chạy lại sạch sẽ
    if (viec.huaNhacSom && S.dangTachNhac) dungTachNhac();
    S.dangChay = false;
    ghiDangChay(null);
    S.dangTachNhac = null;
    dongChoVeHinh();
    ["nut-bat-dau", "nut-lam-lai"].forEach((id) => ($(id).disabled = false));
    khoaMan?.release?.().catch(() => {});
  }
}

let xongVeHinh = () => {}; // báo "chèn chữ/logo đã xong" cho Giọng máy đang chờ
function moChoVeHinh(coVe) {
  S.dangVeHinh = coVe ? new Promise((x) => (xongVeHinh = x)) : null;
}
function dongChoVeHinh() {
  S.veDangChay = false;
  xongVeHinh();
  S.dangVeHinh = null;
}

async function quyTrinh(lamTuDau, viec) {
  buoc("tai", "dang");
  await taiFfmpeg();
  buoc("tai", "xong");
  let thongTin = await ganVideo();

  // 1. Tách tiếng + nghe & dịch (bỏ qua khi "Làm lại" với lời thoại đã sửa)
  if (lamTuDau) {
    viec.buocDang = "tach";
    buoc("tach", "dang");
    if (!thongTin.coTieng) throw new Error("Video này không có tiếng.");
    const pcm = await tachTieng();
    ghiDoToGoc(pcm); // để sau này tìm chỗ nhạc nền còn sót giọng gốc
    buoc("tach", "xong", `${dongHo(S.thoiLuong)} âm thanh`);
    // Tách nhạc chạy trên máy, nghe & dịch chủ yếu chờ mạng → bắt đầu tách nhạc NGAY, chạy song song cho nhanh.
    // Trừ khi đọc bằng Giọng máy: nó cần nhiều bộ nhớ lúc khởi động → phải đọc TRƯỚC khi tách nhạc (iPhone báo "Out of memory")
    if (caiDat.tachNhac && caiDat.mhTach !== "giam" && dvDocDung(true)[0] !== "may" && canTachNhacLai()) {
      buoc("nhac", "dang");
      nhat("Tách nhạc nền chạy song song với nghe & dịch");
      S.dangTachNhac = tachNhacNen();
      viec.huaNhacSom = S.dangTachNhac.then((wav) => { S.nhacNen = { tep: S.tepVideo, loai: caiDat.mhTach, wav }; return wav; });
      viec.huaNhacSom.catch(() => {});
    }
    viec.buocDang = "dich";
    buoc("dich", "dang");
    S.cacCau = await ngheVaDich(pcm);
    if (!S.cacCau.length) throw new Error("Không nghe thấy lời nói tiếng Trung nào trong video.");
    buoc("dich", "xong", `${S.cacCau.length} câu`);
    veLoiThoai();
    if (caiDat.kiemPd) await choKiemPhuDe();
  }

  // 2. Lồng tiếng: chủ yếu chờ mạng → chạy song song với tách nhạc / chèn chữ (chạy trên máy)
  buoc("long", "dang");
  const coVe = canVe(caiDat.lop, S.cacCau, S.anhLogo);
  moChoVeHinh(coVe);
  const daChonGiong = new Promise((x) => (S.baoChonGiong = x));
  const huaLong = Promise.resolve().then(longTieng).then((r) => { buoc("long", "xong"); return r; });
  huaLong.catch(() => {});
  // Giọng máy cần nhiều bộ nhớ lúc khởi động: nếu phải dùng Giọng máy thì cho đọc TRƯỚC khi tách nhạc/chèn chữ
  // (lúc điện thoại còn rảnh), đọc xong tắt hẳn rồi mới làm các bước nặng
  const giongChon = await Promise.race([daChonGiong, huaLong.then(() => "", () => ""), new Promise((x) => setTimeout(() => x(""), 90000))]);
  if (giongChon === "may") {
    viec.buocDang = "long";
    await huaLong; // Giọng máy hỏng thì báo luôn, khỏi tách nhạc/chèn chữ vô ích
    if (!ffDangBat()) { await taiFfmpeg(); thongTin = await ganVideo(); }
  }

  // 3. Tách nhạc nền + chèn chữ/logo
  const kq = { wavNen: null, giamTheoLoi: false, hinh: null };
  const songSong = caiDat.tachNhac && thongTin.coTieng && caiDat.mhTach !== "giam" && coVe && docSongSong() === "bat";
  if (songSong) {
    viec.buocDang = "ve";
    nhat("Tách nhạc và chèn chữ/logo chạy cùng lúc cho nhanh");
    await Promise.all([buocTachNhac(thongTin, viec, kq), buocVeHinh(kq)]);
  } else {
    viec.buocDang = "nhac";
    await buocTachNhac(thongTin, viec, kq);
  }
  // Bộ xử lý video có thể đã được tắt để nhường bộ nhớ cho AI tách nhạc → bật lại (song song với chèn chữ)
  const huaFf = ffDangBat() ? null : taiFfmpeg().then(ganVideo);
  S.dangBatFf = huaFf;
  huaFf?.catch(() => {});
  if (!songSong) {
    viec.buocDang = "ve";
    await buocVeHinh(kq);
  }
  dongChoVeHinh();

  // 4. Xuất video
  viec.buocDang = "long";
  const tiengViet = await huaLong;
  if (huaFf) { viec.buocDang = "xuat"; thongTin = await huaFf; }
  // Bộ xử lý video có thể vừa bị tắt để nhường bộ nhớ cho giọng máy → bật lại trước khi xuất
  if (!ffDangBat()) { viec.buocDang = "xuat"; await taiFfmpeg(); thongTin = await ganVideo(); }
  viec.buocDang = "xuat";
  buoc("xuat", "dang");
  S.videoKetQua = await xuatVideo(tiengViet, thongTin, kq.wavNen, kq.hinh, kq.giamTheoLoi);
  buoc("xuat", "xong", `${(S.videoKetQua.size / 1048576).toFixed(1)}MB`);
  nhat(`🎉 HOÀN TẤT · tổng ${giayDaChay().toFixed(0)} giây · ${(S.videoKetQua.size / 1048576).toFixed(1)}MB`);
  hienKetQua();
}

// Tách nhạc nền (AI) – hoặc chỉ giảm tiếng gốc lúc có lời (không dùng AI / AI không chạy được trên máy)
async function buocTachNhac(thongTin, viec, kq) {
  if (!caiDat.tachNhac || !thongTin.coTieng) {
    buoc("nhac", "bo", "Không bật");
  } else if (caiDat.mhTach === "giam") {
    kq.giamTheoLoi = true;
    buoc("nhac", "bo", "Giảm tiếng gốc lúc có lời (không dùng AI)");
  } else {
    if (!viec.huaNhacSom) buoc("nhac", "dang");
    try {
      if (viec.huaNhacSom) await viec.huaNhacSom; // đã bắt đầu từ lúc nghe & dịch
      else if (canTachNhacLai()) {
        S.dangTachNhac = tachNhacNen();
        S.nhacNen = { tep: S.tepVideo, loai: caiDat.mhTach, wav: await S.dangTachNhac };
      }
      kq.wavNen = S.nhacNen.wav;
      buoc("nhac", "xong");
    } catch (loi) {
      S.nhacNen = null;
      nhat("Tách nhạc hỏng: " + (loi?.message || loi));
      kq.giamTheoLoi = true;
      buoc("nhac", "loi", "AI không chạy được trên máy này → chuyển sang giảm tiếng gốc lúc có lời");
    }
  }
  S.dangTachNhac = null;
}

// Chèn phụ đề / lớp che / logo vào hình (bộ mã hoá video của máy).
// Đứng im hoặc bộ giải mã/mã hoá báo lỗi (vd "Decoder failure" – iPhone thiếu bộ nhớ hoặc vừa chuyển app)
// → tắt bộ xử lý video cho rảnh bộ nhớ rồi làm lại 1 lần; vẫn hỏng thì xuất video không chữ/logo
async function buocVeHinh(kq) {
  if (!canVe(caiDat.lop, S.cacCau, S.anhLogo)) return buoc("ve", "bo", "Không bật");
  buoc("ve", "dang");
  const batDau = Date.now();
  let mocVe = -1;
  const lamVe = () => xuatHinh(
    S.tepVideo,
    (ctx, W, H, t) => veLop(ctx, W, H, t, caiDat.lop, S.cacCau, S.anhLogo),
    (p) => {
      ghiChu("ve", `${Math.round(p * 100)}%`);
      const nac = Math.floor(p * 4);
      if (nac !== mocVe) { mocVe = nac; nhat(`Chèn chữ/logo: ${Math.round(p * 100)}%`); }
    },
    globalThis.__phahaChoVe || 60,
    (viec) => nhat("Chèn chữ: " + viec)
  );
  try {
    S.veDangChay = true;
    try {
      kq.hinh = await lamVe();
    } catch (loi) {
      if (loi.khongHoTro || loi.khongHinh) throw loi;
      nhat(`⚠️ ${loi.treo ? loi.message : "Chèn chữ/logo bị lỗi: " + loi.message} → làm lại chèn chữ/logo (lần 2)`);
      ghiChu("ve", "Bị lỗi, đang làm lại…");
      await S.dangBatFf?.catch(() => {});
      if (ffDangBat() && !S.dangTachNhac) { tatFfmpeg(); nhat("Tạm tắt bộ xử lý video để nhường bộ nhớ cho chèn chữ/logo"); }
      mocVe = -1;
      try {
        kq.hinh = await lamVe();
      } catch (loi2) {
        if (loi2.khongHoTro) throw loi2;
        throw Object.assign(new Error(`${loi2.treo ? loi2.message : "Chèn chữ/logo bị lỗi (" + loi2.message + ")"} cả 2 lần. Máy đang thiếu bộ nhớ hoặc bộ mã hoá video bị kẹt.`), { khongHoTro: true });
      }
    }
    nhat(`Dựng hình xong: ${kq.hinh.W}×${kq.hinh.H}, mã hoá ${kq.hinh.codec}, ${(kq.hinh.blob.size / 1048576).toFixed(1)}MB`);
    buoc("ve", "xong", `${Math.round((Date.now() - batDau) / 1000)} giây`);
  } catch (loi) {
    if (!loi.khongHoTro) throw loi;
    // Máy không hỗ trợ: vẫn xuất video (không chữ/logo), vẫn tải được phụ đề .srt
    buoc("ve", "loi", loi.message + " Video sẽ xuất không có chữ/logo.");
  }
}

// ----- MỞ APP -----
khoiDongGiaoDien();
khoiDongCaiDat();
khoiDongDongBo();
khoiDongKiemMa();
ghiMocCaiDat();
khoiDongCuaVao();
$("nut-bat-dau").addEventListener("click", () => chay(true));
$("nut-lam-lai").addEventListener("click", () => chay(false));
