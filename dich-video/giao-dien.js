// =====================================================
// GIAO DIỆN MÀN HÌNH CHÍNH: chọn video / dán link RedNote, tuỳ chỉnh âm thanh – phụ đề – lớp che – logo,
// ô xem trước, bảng lời thoại, tự kiểm tra phụ đề (SRT), lưu kết quả, nhật ký
// =====================================================
import { $, caiDat, S, nhat, ghiChu, luuCaiDat, dongHo, taiXuong, tenTep, coMayChu, daDangNhap, dungDuocMayChu, mayChu, veDangNhap, TEN_BUOC, ghiDangChay } from "./nen.js";
import { veLop } from "./lop-phu.js";
import { taoSrt, docSrt, ganBanDich } from "./phu-de.js";
import { taiFfmpeg } from "./video.js";
import { docCau, dvDocDung } from "./giong-doc.js";
import { veGiongNhanh } from "./cai-dat-ui.js";
import { bamNghe } from "./nghe-thu.js";

// ----- Nhận video (chọn file hoặc tải từ link) -----
export function nhanVideo(tep) {
  S.tepVideo = tep;
  S.cacCau = [];
  S.videoKetQua = null;
  S.nhacNen = null;
  veGiongNhanh();
  $("chu-chon-video").textContent = `${tep.name} · ${(tep.size / 1048576).toFixed(1)}MB (bấm để đổi)`;
  const xem = $("xem-goc");
  xem.src = URL.createObjectURL(tep);
  xem.classList.remove("an");
  xem.onloadedmetadata = () => (S.thoiLuong = xem.duration || 0);
  xem.onloadeddata = xem.onseeked = xem.onpause = () => veXemTruoc();
  $("nut-bat-dau").classList.remove("an");
  ["the-tien-do", "the-ket-qua", "the-loi-thoai"].forEach((id) => $(id).classList.add("an"));
  $("the-tuy-chon").classList.remove("an");
  // Tải sẵn bộ xử lý video trong lúc người dùng chỉnh tuỳ chọn → bấm Bắt đầu chạy ngay
  if (!S.dangChay) taiFfmpeg().catch(() => {});
}

// Tải video từ link RedNote (小红书): máy chủ PHAHA tìm file video trong bài rồi tải hộ
const LINK_REDNOTE = /https?:\/\/[^\s，。]*(xiaohongshu\.com|xhslink\.com|rednote\.com)/i;
let dangTaiLink = false;
async function taiTuLink() {
  const chu = $("o-link").value.trim();
  const tt = $("tt-tai-link");
  const bao = (x) => { tt.textContent = x; tt.classList.remove("an"); };
  if (dangTaiLink || S.dangChay) return;
  if (!LINK_REDNOTE.test(chu)) return bao("⚠️ Chưa thấy link RedNote. Trong RedNote bấm Chia sẻ → Sao chép link, rồi dán vào ô trên.");
  if (!coMayChu() || !daDangNhap()) return bao("⚠️ Cần đăng nhập app PHAHA (tab Lịch việc) để tải video từ link.");
  if (!dungDuocMayChu()) return bao("⚠️ Tải từ link chỉ dành cho chủ app. Cách khác: trong RedNote bấm Chia sẻ → Lưu video (保存视频), rồi bấm 🎬 Chọn video ở trên.");
  dangTaiLink = true;
  $("nut-tai-link").disabled = true;
  try {
    bao("⏳ Đang tìm video trong bài…");
    const goiMayChu = (duong, than) => fetch(mayChu() + duong, { method: "POST", headers: { "Content-Type": "application/json", "X-Ve": veDangNhap() }, body: JSON.stringify(than) });
    const r1 = await goiMayChu("/ai/rednote", { link: chu });
    const j = await r1.json().catch(() => ({}));
    if (!r1.ok) throw new Error(r1.status === 401 ? "Phiên đăng nhập PHAHA đã hết hạn – mở tab Lịch việc để đăng nhập lại." : j.loi || `Máy chủ báo lỗi ${r1.status}`);
    bao(`⏳ Đang tải video${j.tieuDe ? " «" + j.tieuDe + "»" : ""}…`);
    const r2 = await goiMayChu("/ai/rednote-tai", { cacLink: j.cacLink });
    if (!r2.ok) throw new Error((await r2.json().catch(() => ({}))).loi || `Tải video lỗi ${r2.status}`);
    const tong = +r2.headers.get("content-length") || 0;
    const doc = r2.body.getReader(), manh = [];
    let da = 0;
    for (;;) {
      const { done, value } = await doc.read();
      if (done) break;
      manh.push(value);
      da += value.length;
      bao(`⏳ Đang tải video: ${(da / 1048576).toFixed(1)}MB${tong ? ` / ${(tong / 1048576).toFixed(1)}MB (${Math.round((da / tong) * 100)}%)` : ""}`);
    }
    if (da < 10000) throw new Error("File tải về quá nhỏ, không phải video.");
    const ten = `${(j.tieuDe || "video").replace(/[\\/:*?"<>|]/g, "").trim() || "video"} - rednote.mp4`;
    nhanVideo(new File(manh, ten, { type: "video/mp4" }));
    bao(`✅ Đã tải xong ${(da / 1048576).toFixed(1)}MB – bấm ▶ Bắt đầu để dịch`);
    $("o-link").value = "";
  } catch (loi) {
    bao("❌ " + loi.message);
  } finally {
    dangTaiLink = false;
    $("nut-tai-link").disabled = false;
  }
}

// ----- TUỲ CHỈNH VIDEO: âm thanh, phụ đề, lớp che, logo -----
// Mỗi ô điều khiển có data-o="đường.dẫn" tới mục trong caiDat
const layO = (duong) => duong.split(".").reduce((o, k) => o?.[k], caiDat);
function datO(duong, giaTri) {
  const k = duong.split("."), cuoi = k.pop();
  k.reduce((o, x) => o[x], caiDat)[cuoi] = giaTri;
}
let oDieuKhien = [];
function hienDieuKhien() {
  oDieuKhien.forEach((o) => {
    const v = layO(o.dataset.o);
    if (o.type === "checkbox") o.checked = !!v;
    else o.value = v;
    if (o.type === "range") o.closest(".truot").querySelector("b").textContent = v + (o.dataset.donVi || "");
  });
  // Ẩn/hiện phần phụ thuộc: data-hien="a.b" / "!a.b" / "a.b=giá trị"
  document.querySelectorAll("#the-tuy-chon [data-hien]").forEach((o) => {
    const dk = o.dataset.hien;
    let hien;
    if (dk.includes("=")) { const [d, g] = dk.split("="); hien = String(layO(d)) === g; }
    else hien = dk.startsWith("!") ? !layO(dk.slice(1)) : !!layO(dk);
    o.classList.toggle("an", !hien);
  });
  $("phan-logo").classList.toggle("an", !S.anhLogo);
  $("chu-logo").textContent = S.anhLogo ? "Đổi ảnh logo" : "Chọn ảnh logo";
}

function napAnh(nguon) {
  return new Promise((xong, hong) => {
    const a = new Image();
    a.onload = () => xong(a);
    a.onerror = hong;
    a.src = nguon;
  });
}
// Logo: thu nhỏ còn tối đa 600px rồi lưu trên máy
async function chonLogo(e) {
  const tep = e.target.files[0];
  if (!tep) return;
  try {
    const anh = await createImageBitmap(tep);
    const tile = Math.min(1, 600 / Math.max(anh.width, anh.height));
    const kc = document.createElement("canvas");
    kc.width = Math.round(anh.width * tile);
    kc.height = Math.round(anh.height * tile);
    kc.getContext("2d").drawImage(anh, 0, 0, kc.width, kc.height);
    const du = kc.toDataURL("image/png");
    try { localStorage.setItem("phaha-dv-logo", du); } catch {}
    S.anhLogo = await napAnh(du);
    caiDat.lop.logo.bat = true;
    luuCaiDat();
    hienDieuKhien();
    veXemTruoc();
  } catch {
    alert("Không mở được ảnh này. Thử ảnh PNG hoặc JPG khác.");
  }
  e.target.value = "";
}

// ----- Ô xem thử: vẽ khung hình đang dừng của video + các lớp -----
export function veXemTruoc() {
  const xem = $("xem-goc"), kv = $("xem-truoc");
  if (!xem.videoWidth) return;
  const tile = Math.min(1, 720 / Math.max(xem.videoWidth, xem.videoHeight));
  const W = Math.round(xem.videoWidth * tile), H = Math.round(xem.videoHeight * tile);
  if (kv.width !== W || kv.height !== H) { kv.width = W; kv.height = H; }
  const ctx = kv.getContext("2d");
  ctx.drawImage(xem, 0, 0, W, H);
  veLop(ctx, W, H, xem.currentTime, caiDat.lop, S.cacCau, S.anhLogo, "Đây là phụ đề tiếng Việt mẫu");
  $("goi-y-xem").textContent = xem.readyState >= 2
    ? "Tua video ở trên tới đoạn có chữ Trung, rồi kéo các thanh để căn chỉnh."
    : "Bấm ▶ video ở trên rồi dừng ở đoạn có chữ Trung để căn chỉnh.";
}

// ----- Bảng lời thoại: sửa câu tiếng Việt, bấm giờ để xem đoạn đó, 🔊 nghe thử -----
export function veLoiThoai() {
  $("the-loi-thoai").classList.toggle("an", !S.cacCau.length);
  $("dem-cau").textContent = `${S.cacCau.length} câu`;
  const ds = $("ds-cau");
  ds.innerHTML = "";
  S.cacCau.forEach((c) => {
    const o = document.createElement("div");
    o.className = "cau";
    o.innerHTML = `
      <div class="cau-tren">
        <button class="gio">${dongHo(c.start)} → ${dongHo(c.end)}</button>
        <button class="nghe-thu" aria-label="Nghe giọng lồng">🔊</button>
      </div>
      <p class="chu-trung"></p>
      <textarea rows="2"></textarea>`;
    o.querySelector(".chu-trung").textContent = c.zh;
    const oViet = o.querySelector("textarea");
    oViet.value = c.vi;
    oViet.addEventListener("input", () => (c.vi = oViet.value));
    o.querySelector(".gio").addEventListener("click", () => {
      const xem = $("xem-goc");
      xem.currentTime = c.start;
      xem.play().catch((loi) => nhat("Không phát được video gốc ở đoạn này: " + loi.message));
      xem.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    const nutNghe = o.querySelector(".nghe-thu");
    nutNghe.addEventListener("click", () => bamNghe(nutNghe, () => docCau(c.vi, dvDocDung(true)[0]), "", "⏳", "▶️"));
    ds.appendChild(o);
  });
  veXemTruoc();
}

// ----- Tự kiểm tra phụ đề: dừng sau bước nghe & dịch, đưa SRT tiếng Trung,
// chờ người dùng dán SRT tiếng Việt (hoặc bấm giữ bản dịch của app) -----
export function choKiemPhuDe() {
  const the = $("the-kiem-pd");
  $("pd-trung").value = taoSrt(S.cacCau, "zh");
  $("pd-viet").value = "";
  $("pd-bao").classList.add("an");
  the.classList.remove("an");
  ghiChu("dich", "Chờ bạn kiểm tra phụ đề…");
  nhat("✋ Dừng lại chờ bạn kiểm tra phụ đề");
  the.scrollIntoView?.({ behavior: "smooth", block: "start" });
  return new Promise((xong) => {
    const ket = (lyDo) => {
      the.classList.add("an");
      $("nut-dung-viet").onclick = $("nut-bo-qua-pd").onclick = null;
      nhat(lyDo);
      ghiChu("dich", `${S.cacCau.length} câu`);
      veLoiThoai();
      xong();
    };
    $("nut-dung-viet").onclick = () => {
      try {
        const ds = docSrt($("pd-viet").value).filter((d) => d.chu);
        if (!ds.length) throw new Error("Chưa dán SRT tiếng Việt vào ô số 2.");
        const n = ganBanDich(S.cacCau, ds);
        if (!n) throw new Error("Không ghép được câu nào – kiểm tra lại mốc giờ trong SRT.");
        ket(`✅ Dùng đúng bản dịch bạn dán: ${n} câu${ds[0] && Number.isFinite(ds[0].start) ? " (theo mốc giờ trong SRT của bạn)" : ""}`);
      } catch (loi) {
        $("pd-bao").textContent = "⚠️ " + loi.message;
        $("pd-bao").classList.remove("an");
      }
    };
    $("nut-bo-qua-pd").onclick = () => ket("⏩ Giữ bản dịch của app");
  });
}

// ----- Hiện video kết quả -----
export function hienKetQua() {
  $("xem-ket-qua").src = URL.createObjectURL(S.videoKetQua);
  $("the-ket-qua").classList.remove("an");
  $("the-ket-qua").scrollIntoView({ behavior: "smooth" });
}

// Gắn sự kiện cho màn hình chính (gọi 1 lần lúc mở app)
export function khoiDongGiaoDien() {
  // Nhật ký: hiện lần chạy gần nhất; trang bị tắt giữa chừng lần trước thì báo bước nào
  const oNhat = $("o-nhat-ky");
  try { oNhat.textContent = localStorage.getItem("phaha-dv-nhat-ky") || "(chưa có)"; } catch {}
  try {
    const buocDo = localStorage.getItem("phaha-dang-chay");
    if (buocDo) {
      oNhat.textContent += `\n⚠️ TRANG BỊ TẮT GIỮA CHỪNG ở bước "${TEN_BUOC[buocDo] || buocDo}" (thường do iPhone hết bộ nhớ). Gợi ý: đóng bớt ứng dụng/tab khác, hoặc chọn tách nhạc "Không dùng AI".`;
      localStorage.setItem("phaha-dv-nhat-ky", oNhat.textContent);
      ghiDangChay(null);
    }
  } catch {}
  $("nut-chep-nhat-ky").addEventListener("click", async () => {
    const nut = $("nut-chep-nhat-ky");
    try {
      await navigator.clipboard.writeText(oNhat.textContent);
      nut.textContent = "✅ Đã sao chép – dán gửi người hỗ trợ";
    } catch {
      const r = document.createRange();
      r.selectNodeContents(oNhat);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
      nut.textContent = "Đã bôi đen – bấm Sao chép";
    }
  });
  window.addEventListener("error", (e) => nhat("⚠️ Lỗi trang: " + e.message));
  window.addEventListener("unhandledrejection", (e) => nhat("⚠️ Lỗi ngầm: " + (e.reason?.message || e.reason)));

  // Chọn video / dán link (dán vào là tự tải luôn, không cần bấm nút)
  $("o-video").addEventListener("change", (e) => { if (e.target.files[0]) nhanVideo(e.target.files[0]); });
  $("nut-tai-link").addEventListener("click", taiTuLink);
  $("o-link").addEventListener("paste", () => setTimeout(() => LINK_REDNOTE.test($("o-link").value) && taiTuLink(), 50));

  // Thanh kéo: dựng từ <div class="truot" data-o=... data-min=... data-max=...>Tên</div>
  document.querySelectorAll(".truot").forEach((o) => {
    const ten = o.textContent.trim(), donVi = o.dataset.donVi || "";
    o.innerHTML = `<div class="dong"><span></span><b></b></div><input type="range">`;
    o.querySelector("span").textContent = ten;
    const thanh = o.querySelector("input");
    Object.assign(thanh, { min: o.dataset.min, max: o.dataset.max, step: o.dataset.buoc || 1 });
    thanh.dataset.o = o.dataset.o;
    thanh.dataset.donVi = donVi;
  });
  oDieuKhien = document.querySelectorAll("#the-tuy-chon [data-o]:not(.truot)");
  oDieuKhien.forEach((o) => {
    o.addEventListener("input", () => {
      datO(o.dataset.o, o.type === "checkbox" ? o.checked : o.type === "range" ? Number(o.value) : o.value);
      hienDieuKhien();
      veXemTruoc();
    });
    o.addEventListener("change", luuCaiDat);
  });
  $("o-logo").addEventListener("change", chonLogo);
  $("nut-xoa-logo").addEventListener("click", () => {
    S.anhLogo = null;
    try { localStorage.removeItem("phaha-dv-logo"); } catch {}
    caiDat.lop.logo.bat = false;
    luuCaiDat();
    hienDieuKhien();
    veXemTruoc();
  });
  (async () => {
    try {
      const du = localStorage.getItem("phaha-dv-logo");
      if (du) S.anhLogo = await napAnh(du);
    } catch {}
    hienDieuKhien();
  })();
  document.fonts?.ready.then(veXemTruoc);
  let henVe = 0;
  $("xem-goc").addEventListener("timeupdate", () => {
    if (Date.now() - henVe > 250) { henVe = Date.now(); veXemTruoc(); }
  });

  // Kết quả: lưu video (iPhone: mở bảng Chia sẻ → "Lưu video" vào Ảnh), tải phụ đề
  $("nut-luu").addEventListener("click", async () => {
    if (!S.videoKetQua) return;
    const ten = tenTep("-tieng-viet.mp4");
    const tep = new File([S.videoKetQua], ten, { type: "video/mp4" });
    if (navigator.canShare?.({ files: [tep] })) {
      try { await navigator.share({ files: [tep] }); return; } catch (loi) { if (loi.name === "AbortError") return; }
    }
    taiXuong(S.videoKetQua, ten);
  });
  $("nut-phu-de").addEventListener("click", () => taiXuong(new Blob([taoSrt(S.cacCau)], { type: "text/plain" }), tenTep("-tieng-viet.srt")));
  // Kiểm tra phụ đề: chép / tải SRT tiếng Trung
  $("nut-chep-trung").addEventListener("click", async () => {
    const o = $("pd-trung"), nut = $("nut-chep-trung");
    try { await navigator.clipboard.writeText(o.value); } catch { o.select(); document.execCommand?.("copy"); }
    nut.textContent = "✅ Đã chép";
    setTimeout(() => (nut.textContent = "📋 Chép SRT tiếng Trung"), 2000);
  });
  $("nut-tai-trung").addEventListener("click", () => taiXuong(new Blob([$("pd-trung").value], { type: "text/plain" }), tenTep("-tieng-trung.srt")));
}
