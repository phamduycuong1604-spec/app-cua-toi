// =====================================================
// PhaHa – Lồng tiếng video Trung → Việt
// Quy trình: chọn video → tách tiếng → Gemini nghe & dịch
//            → Gemini đọc tiếng Việt → ghép tiếng vào video
// Mọi thứ chạy ngay trên điện thoại, chỉ gửi phần âm thanh/chữ lên Gemini.
// =====================================================
import { FFmpeg } from "./ffmpeg/index.js";

const $ = (id) => document.getElementById(id);
const API = "https://generativelanguage.googleapis.com/v1beta";
// Bộ xử lý video (ffmpeg) tải từ mạng, lần sau trình duyệt tự giữ lại
const LOI_FFMPEG = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";
const TAN_SO_NGHE = 16000; // âm thanh gửi đi nghe: 16.000 mẫu/giây, 1 kênh
const TAN_SO_DOC = 24000; // giọng đọc Gemini trả về
const DOAN_NGHE = 300; // mỗi lần gửi tối đa 5 phút âm thanh
const NHANH_TOI_DA = 1.6; // câu dài quá thì đọc nhanh hơn, tối đa 1,6 lần

// ----- CÀI ĐẶT (lưu trên máy) -----
const caiDat = Object.assign(
  { khoa: "", giong: "Kore", amGoc: 15, mhNghe: "", mhDoc: "" },
  docLuu("phaha-dv-cai-dat")
);
function docLuu(ten) {
  try { return JSON.parse(localStorage.getItem(ten)) || {}; } catch { return {}; }
}
function luuCaiDat() {
  try { localStorage.setItem("phaha-dv-cai-dat", JSON.stringify(caiDat)); } catch {}
}

// ----- TRẠNG THÁI -----
let tepVideo = null;
let thoiLuong = 0; // giây
let cacCau = []; // [{start, end, zh, vi}]
const khoGiong = new Map(); // "giọng|câu" → Float32Array, để làm lại không phải đọc lại
let videoKetQua = null; // Blob
let ff = null;
let nhatKy = [];
let dangChay = false;
let amThanh = null; // AudioContext để nghe thử

// =====================================================
// GIAO DIỆN
// =====================================================
$("o-video").addEventListener("change", (e) => {
  const tep = e.target.files[0];
  if (!tep) return;
  tepVideo = tep;
  cacCau = [];
  videoKetQua = null;
  $("chu-chon-video").textContent = `${tep.name} · ${(tep.size / 1048576).toFixed(1)}MB (bấm để đổi)`;
  const xem = $("xem-goc");
  xem.src = URL.createObjectURL(tep);
  xem.classList.remove("an");
  xem.onloadedmetadata = () => (thoiLuong = xem.duration || 0);
  $("nut-bat-dau").classList.remove("an");
  ["the-tien-do", "the-ket-qua", "the-loi-thoai"].forEach((id) => $(id).classList.add("an"));
});

$("nut-bat-dau").addEventListener("click", () => chay(true));
$("nut-lam-lai").addEventListener("click", () => chay(false));

$("nut-cai-dat").addEventListener("click", moCaiDat);
function moCaiDat() {
  $("o-khoa").value = caiDat.khoa;
  $("o-giong").value = caiDat.giong;
  $("o-am-goc").value = caiDat.amGoc;
  $("chu-am-goc").textContent = caiDat.amGoc + "%";
  $("o-mh-nghe").value = caiDat.mhNghe;
  $("o-mh-doc").value = caiDat.mhDoc;
  $("hop-cai-dat").showModal();
}
$("o-am-goc").addEventListener("input", (e) => ($("chu-am-goc").textContent = e.target.value + "%"));
$("hop-cai-dat").addEventListener("close", () => {
  caiDat.khoa = $("o-khoa").value.trim();
  caiDat.giong = $("o-giong").value;
  caiDat.amGoc = Number($("o-am-goc").value);
  caiDat.mhNghe = $("o-mh-nghe").value.trim();
  caiDat.mhDoc = $("o-mh-doc").value.trim();
  luuCaiDat();
});

$("nut-luu").addEventListener("click", async () => {
  if (!videoKetQua) return;
  const ten = (tepVideo?.name || "video").replace(/\.[^.]+$/, "") + "-tieng-viet.mp4";
  const tep = new File([videoKetQua], ten, { type: "video/mp4" });
  // iPhone: mở bảng Chia sẻ → "Lưu video" vào Ảnh
  if (navigator.canShare?.({ files: [tep] })) {
    try { await navigator.share({ files: [tep] }); return; } catch (loi) { if (loi.name === "AbortError") return; }
  }
  taiXuong(videoKetQua, ten);
});

$("nut-phu-de").addEventListener("click", () => {
  const ten = (tepVideo?.name || "video").replace(/\.[^.]+$/, "") + "-tieng-viet.srt";
  taiXuong(new Blob([taoSrt()], { type: "text/plain" }), ten);
});

function taiXuong(blob, ten) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = ten;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

// ----- Tiến độ từng bước -----
function buoc(ten, trangThai, ghiChu = "") {
  const li = document.querySelector(`[data-buoc="${ten}"]`);
  li.classList.toggle("dang", trangThai === "dang");
  li.querySelector(".dau").textContent = { cho: "○", dang: "⏳", xong: "✅", loi: "❌", bo: "–" }[trangThai];
  li.querySelector("em").textContent = ghiChu;
}
function ghiChu(ten, chu) {
  document.querySelector(`[data-buoc="${ten}"] em`).textContent = chu;
}
function baoLoi(chu) {
  $("loi").textContent = chu;
  $("loi").classList.toggle("an", !chu);
}

// ----- Bảng lời thoại -----
function veLoiThoai() {
  $("the-loi-thoai").classList.toggle("an", !cacCau.length);
  $("dem-cau").textContent = `${cacCau.length} câu`;
  const ds = $("ds-cau");
  ds.innerHTML = "";
  cacCau.forEach((c, i) => {
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
    const o2 = o.querySelector("textarea");
    o2.value = c.vi;
    o2.addEventListener("input", () => (cacCau[i].vi = o2.value));
    o.querySelector(".gio").addEventListener("click", () => {
      const xem = $("xem-goc");
      xem.currentTime = c.start;
      xem.play();
      xem.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    o.querySelector(".nghe-thu").addEventListener("click", () => ngheThu(i));
    ds.appendChild(o);
  });
}

async function ngheThu(i) {
  try {
    amThanh ||= new AudioContext();
    await amThanh.resume();
    const mau = await docCau(cacCau[i].vi);
    const b = amThanh.createBuffer(1, mau.length, TAN_SO_DOC);
    b.copyToChannel(mau, 0);
    const nguon = amThanh.createBufferSource();
    nguon.buffer = b;
    nguon.connect(amThanh.destination);
    nguon.start();
  } catch (loi) {
    alert(loiDeHieu(loi));
  }
}

// =====================================================
// CHẠY CẢ QUY TRÌNH
// lamTuDau = true: tách tiếng + dịch lại; false: dùng lời thoại đang sửa
// =====================================================
async function chay(lamTuDau) {
  if (dangChay || !tepVideo) return;
  if (!caiDat.khoa) {
    alert("Cần dán mã Gemini trước (miễn phí). Mở Cài đặt nhé.");
    moCaiDat();
    return;
  }
  dangChay = true;
  ["nut-bat-dau", "nut-lam-lai"].forEach((id) => ($(id).disabled = true));
  $("the-tien-do").classList.remove("an");
  $("the-ket-qua").classList.add("an");
  baoLoi("");
  ["tai", "tach", "dich", "long", "xuat"].forEach((b) => buoc(b, "cho"));
  if (!lamTuDau) { buoc("tach", "bo"); buoc("dich", "bo", "Dùng lời thoại bạn đã sửa"); }
  const khoaMan = await giuManHinh();
  let buocDang = "tai";
  try {
    buoc("tai", "dang");
    await taiFfmpeg();
    buoc("tai", "xong");
    const thongTin = await ganVideo();

    if (lamTuDau) {
      buocDang = "tach";
      buoc("tach", "dang");
      if (!thongTin.coTieng) throw new Error("Video này không có tiếng.");
      const pcm = await tachTieng();
      buoc("tach", "xong", `${dongHo(thoiLuong)} âm thanh`);

      buocDang = "dich";
      buoc("dich", "dang");
      cacCau = await ngheVaDich(pcm);
      if (!cacCau.length) throw new Error("Không nghe thấy lời nói tiếng Trung nào trong video.");
      buoc("dich", "xong", `${cacCau.length} câu`);
      veLoiThoai();
    }

    buocDang = "long";
    buoc("long", "dang");
    const tiengViet = await longTieng();
    buoc("long", "xong");

    buocDang = "xuat";
    buoc("xuat", "dang");
    videoKetQua = await xuatVideo(tiengViet, thongTin);
    buoc("xuat", "xong", `${(videoKetQua.size / 1048576).toFixed(1)}MB`);

    $("xem-ket-qua").src = URL.createObjectURL(videoKetQua);
    $("the-ket-qua").classList.remove("an");
    $("the-ket-qua").scrollIntoView({ behavior: "smooth" });
  } catch (loi) {
    console.error(loi);
    buoc(buocDang, "loi");
    baoLoi(loiDeHieu(loi));
  } finally {
    dangChay = false;
    ["nut-bat-dau", "nut-lam-lai"].forEach((id) => ($(id).disabled = false));
    khoaMan?.release?.().catch(() => {});
  }
}

async function giuManHinh() {
  try { return await navigator.wakeLock?.request("screen"); } catch { return null; }
}

// =====================================================
// BỘ XỬ LÝ VIDEO (ffmpeg chạy trong trình duyệt)
// =====================================================
async function taiFfmpeg() {
  if (ff) return;
  const moi = new FFmpeg();
  moi.on("log", ({ message }) => {
    nhatKy.push(message);
    if (nhatKy.length > 400) nhatKy.shift();
  });
  const coreURL = await taiThanhBlob(`${LOI_FFMPEG}/ffmpeg-core.js`, "text/javascript");
  const wasmURL = await taiThanhBlob(`${LOI_FFMPEG}/ffmpeg-core.wasm`, "application/wasm", (da, tong) =>
    ghiChu("tai", tong ? `${Math.round((da / tong) * 100)}%` : `${(da / 1048576).toFixed(0)}MB`)
  );
  await moi.load({ coreURL, wasmURL });
  ff = moi;
}

async function taiThanhBlob(diaChi, kieu, baoTienDo) {
  const r = await fetch(diaChi);
  if (!r.ok) throw new Error("Không tải được bộ xử lý video. Kiểm tra mạng rồi thử lại.");
  const tong = Number(r.headers.get("content-length")) || 0;
  const doc = r.body.getReader();
  const manh = [];
  let da = 0;
  for (;;) {
    const { done, value } = await doc.read();
    if (done) break;
    manh.push(value);
    da += value.length;
    baoTienDo?.(da, tong);
  }
  return URL.createObjectURL(new Blob(manh, { type: kieu }));
}

// Chạy 1 lệnh ffmpeg, trả về nhật ký của lệnh đó
async function lenh(thamSo, tenBuoc) {
  nhatKy = [];
  const theoDoi = ({ message }) => {
    const m = /time=(\d+):(\d+):([\d.]+)/.exec(message);
    if (m && thoiLuong && tenBuoc) {
      const s = +m[1] * 3600 + +m[2] * 60 + +m[3];
      ghiChu(tenBuoc, `${Math.min(99, Math.round((s / thoiLuong) * 100))}%`);
    }
  };
  ff.on("log", theoDoi);
  try {
    const ma = await ff.exec(thamSo);
    return { ma, log: nhatKy.join("\n") };
  } finally {
    ff.off("log", theoDoi);
  }
}

// Cho ffmpeg đọc thẳng file video (không chép cả file vào bộ nhớ)
let duongDanVideo = null;
async function ganVideo() {
  if (duongDanVideo?.tep !== tepVideo) {
    if (duongDanVideo?.gan) await ff.unmount("/vao").catch(() => {});
    for (const ten of await ff.listDir("/").catch(() => [])) {
      if (ten.name.startsWith("tam-")) await ff.deleteFile("/" + ten.name).catch(() => {});
    }
    let duong, gan = false;
    try {
      await ff.createDir("/vao").catch(() => {});
      await ff.mount("WORKERFS", { files: [tepVideo] }, "/vao");
      duong = "/vao/" + tepVideo.name;
      gan = true;
    } catch {
      duong = "/tam-video" + (/\.[^.]+$/.exec(tepVideo.name)?.[0] || ".mp4");
      await ff.writeFile(duong, new Uint8Array(await tepVideo.arrayBuffer()));
    }
    duongDanVideo = { tep: tepVideo, duong, gan };
  }
  // Hỏi ffmpeg video có những gì (lệnh sẽ "lỗi" vì không có đầu ra, không sao)
  const { log } = await lenh(["-hide_banner", "-i", duongDanVideo.duong]);
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(log);
  if (m) thoiLuong = +m[1] * 3600 + +m[2] * 60 + +m[3];
  if (!thoiLuong) throw new Error("Không đọc được video này. Thử video khác (MP4/MOV).");
  return {
    duong: duongDanVideo.duong,
    coTieng: /Stream #.*Audio:/.test(log),
    hevc: /Stream #.*Video: hevc/.test(log),
  };
}

async function tachTieng() {
  const ra = "/tieng.pcm";
  const { ma, log } = await lenh(
    ["-hide_banner", "-i", duongDanVideo.duong, "-vn", "-ac", "1", "-ar", String(TAN_SO_NGHE), "-f", "s16le", ra],
    "tach"
  );
  if (ma !== 0) throw new Error("Không tách được tiếng khỏi video.\n" + log.split("\n").slice(-3).join("\n"));
  const du = await ff.readFile(ra);
  await ff.deleteFile(ra);
  return new Int16Array(du.buffer, du.byteOffset, du.byteLength >> 1);
}

// =====================================================
// GEMINI: NGHE & DỊCH
// =====================================================
async function ngheVaDich(pcm) {
  const moiDoan = DOAN_NGHE * TAN_SO_NGHE;
  const soDoan = Math.ceil(pcm.length / moiDoan);
  const ketQua = [];
  for (let d = 0; d < soDoan; d++) {
    ghiChu("dich", soDoan > 1 ? `Đoạn ${d + 1}/${soDoan}…` : "Đang nghe…");
    const mau = pcm.subarray(d * moiDoan, (d + 1) * moiDoan);
    const batDau = d * DOAN_NGHE;
    const dai = mau.length / TAN_SO_NGHE;
    const duLieu = await sangBase64(taoWav(mau, TAN_SO_NGHE));
    const tl = await goiGemini("nghe", {
      contents: [{
        parts: [
          { inlineData: { mimeType: "audio/wav", data: duLieu } },
          { text: loiNhacDich(dai) },
        ],
      }],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              start: { type: "NUMBER" },
              end: { type: "NUMBER" },
              zh: { type: "STRING" },
              vi: { type: "STRING" },
            },
            required: ["start", "end", "zh", "vi"],
          },
        },
      },
    });
    let ds;
    try { ds = JSON.parse(layChu(tl)); } catch { throw new Error("Gemini trả lời không đúng dạng, bấm Bắt đầu để thử lại."); }
    for (const c of Array.isArray(ds) ? ds : []) {
      let s = Number(c.start), e = Number(c.end);
      if (!isFinite(s) || !String(c.vi || "").trim()) continue;
      s = Math.max(0, Math.min(s, dai));
      if (!isFinite(e) || e <= s) e = s + 2;
      e = Math.min(e, dai);
      ketQua.push({ start: +(batDau + s).toFixed(2), end: +(batDau + e).toFixed(2), zh: String(c.zh || ""), vi: String(c.vi).trim() });
    }
  }
  return ketQua.sort((a, b) => a.start - b.start);
}

function loiNhacDich(dai) {
  return `Đây là ${dai.toFixed(1)} giây âm thanh lấy từ một video tiếng Trung.
Hãy nghe kỹ phần LỜI NÓI (bỏ qua nhạc nền, tiếng động) và chia thành từng câu ngắn, mỗi câu tối đa khoảng 8 giây.
Với mỗi câu trả về:
- start, end: thời điểm bắt đầu và kết thúc, tính bằng GIÂY (số thập phân) kể từ đầu đoạn âm thanh này, thật chính xác.
- zh: lời gốc tiếng Trung (chữ Hán).
- vi: bản dịch tiếng Việt tự nhiên như người Việt nói, xưng hô hợp ngữ cảnh. Dịch NGẮN GỌN để đọc lồng tiếng vừa khít thời lượng câu (khoảng 4–5 âm tiết mỗi giây). Không thêm chú thích.
Nếu không có lời nói thì trả về mảng rỗng [].`;
}

// =====================================================
// GEMINI: ĐỌC TIẾNG VIỆT
// =====================================================
async function docCau(chu) {
  const khoa = caiDat.giong + "|" + chu.trim();
  if (khoGiong.has(khoa)) return khoGiong.get(khoa);
  const tl = await goiGemini("doc", {
    contents: [{ parts: [{ text: `Đọc bằng tiếng Việt, giọng tự nhiên, tốc độ hơi nhanh: ${chu.trim()}` }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: caiDat.giong } } },
    },
  });
  const phan = tl.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!phan) throw new Error("Gemini không trả về giọng đọc. Thử lại sau ít phút.");
  const tanSo = Number(/rate=(\d+)/.exec(phan.inlineData.mimeType || "")?.[1]) || TAN_SO_DOC;
  const byte = Uint8Array.from(atob(phan.inlineData.data), (k) => k.charCodeAt(0));
  const i16 = new Int16Array(byte.buffer, 0, byte.length >> 1);
  let mau = Float32Array.from(i16, (v) => v / 32768);
  if (tanSo !== TAN_SO_DOC) mau = doiTanSo(mau, tanSo, TAN_SO_DOC);
  mau = lamGon(mau);
  khoGiong.set(khoa, mau);
  return mau;
}

async function longTieng() {
  const tong = new Float32Array(Math.ceil(thoiLuong * TAN_SO_DOC) + TAN_SO_DOC);
  let xong = 0;
  const cau = cacCau.filter((c) => c.vi.trim());
  // Đọc 3 câu cùng lúc cho nhanh
  const hang = cau.map((c, i) => i);
  const cacGiong = new Array(cau.length);
  await Promise.all([0, 1, 2].map(async () => {
    while (hang.length) {
      const i = hang.shift();
      cacGiong[i] = await docCau(cau[i].vi);
      ghiChu("long", `${++xong}/${cau.length} câu`);
    }
  }));
  // Đặt từng câu vào đúng thời điểm
  cau.forEach((c, i) => {
    let mau = cacGiong[i];
    const sau = cau[i + 1] ? cau[i + 1].start : thoiLuong;
    const choPhep = Math.max(c.end - c.start, sau - c.start - 0.08);
    const dai = mau.length / TAN_SO_DOC;
    if (choPhep > 0.3 && dai > choPhep * 1.02) mau = coGian(mau, Math.min(dai / choPhep, NHANH_TOI_DA));
    const viTri = Math.round(c.start * TAN_SO_DOC);
    for (let k = 0; k < mau.length && viTri + k < tong.length; k++) tong[viTri + k] += mau[k];
  });
  return taoWav(tong, TAN_SO_DOC);
}

// =====================================================
// XUẤT VIDEO: giữ nguyên hình, thay tiếng
// =====================================================
async function xuatVideo(wav, tt) {
  const tiengLong = "/long-tieng.wav";
  const ra = "/ket-qua.mp4";
  await ff.writeFile(tiengLong, wav);
  const amGoc = caiDat.amGoc / 100;
  const thamSo = ["-hide_banner", "-y", "-i", tt.duong, "-i", tiengLong];
  if (tt.coTieng && amGoc > 0) {
    thamSo.push(
      "-filter_complex", `[0:a:0]volume=${amGoc}[goc];[goc][1:a]amix=inputs=2:duration=first:normalize=0[am]`,
      "-map", "0:v:0", "-map", "[am]"
    );
  } else {
    thamSo.push("-map", "0:v:0", "-map", "1:a", "-t", String(thoiLuong));
  }
  thamSo.push("-c:v", "copy");
  if (tt.hevc) thamSo.push("-tag:v", "hvc1"); // để iPhone phát được video HEVC
  thamSo.push("-c:a", "aac", "-b:a", "160k", ra);
  const { ma, log } = await lenh(thamSo, "xuat");
  await ff.deleteFile(tiengLong).catch(() => {});
  if (ma !== 0) throw new Error("Ghép video bị lỗi.\n" + log.split("\n").slice(-3).join("\n"));
  const du = await ff.readFile(ra);
  await ff.deleteFile(ra).catch(() => {});
  return new Blob([du], { type: "video/mp4" });
}

// =====================================================
// GỌI GEMINI (tự chờ khi hết lượt/phút, tự tìm mô hình còn dùng được)
// =====================================================
const MO_HINH = {
  nghe: ["gemini-flash-latest", "gemini-2.5-flash", "gemini-2.0-flash"],
  doc: ["gemini-2.5-flash-preview-tts", "gemini-2.5-flash-tts", "gemini-2.5-pro-preview-tts"],
};
const moHinhDung = {}; // mô hình đã chạy được

async function goiGemini(loai, noiDung) {
  const tuChon = loai === "nghe" ? caiDat.mhNghe : caiDat.mhDoc;
  if (tuChon) return goiMoHinh(tuChon, noiDung, loai);
  if (moHinhDung[loai]) return goiMoHinh(moHinhDung[loai], noiDung, loai);
  let ds = [...MO_HINH[loai]];
  let daHoi = false;
  for (let i = 0; i < ds.length; i++) {
    try {
      const kq = await goiMoHinh(ds[i], noiDung, loai);
      moHinhDung[loai] = ds[i];
      return kq;
    } catch (loi) {
      if (loi.status !== 404) throw loi;
      // Hết danh sách: hỏi Google xem hiện có mô hình nào
      if (i === ds.length - 1 && !daHoi) {
        daHoi = true;
        ds = ds.concat(await timMoHinh(loai));
      }
    }
  }
  throw new Error("Không tìm thấy mô hình Gemini phù hợp. Vào Cài đặt → Nâng cao để nhập tên mô hình.");
}

async function timMoHinh(loai) {
  try {
    const r = await fetch(`${API}/models?pageSize=200`, { headers: { "x-goog-api-key": caiDat.khoa } });
    const j = await r.json();
    return (j.models || [])
      .map((m) => m.name.replace("models/", ""))
      .filter((t) => (loai === "doc" ? /tts/.test(t) : /flash/.test(t) && !/tts|image|live|audio|lite/.test(t)))
      .sort((a, b) => /flash/.test(b) - /flash/.test(a));
  } catch {
    return [];
  }
}

async function goiMoHinh(moHinh, noiDung, loai) {
  for (let lan = 0; ; lan++) {
    let r;
    try {
      r = await fetch(`${API}/models/${moHinh}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": caiDat.khoa },
        body: JSON.stringify(noiDung),
      });
    } catch {
      if (lan < 3) { await cho(3); continue; }
      throw new Error("Mất kết nối mạng khi gọi Gemini.");
    }
    if (r.ok) return r.json();
    const j = await r.json().catch(() => ({}));
    const thongBao = j.error?.message || r.statusText;
    if (r.status === 429) {
      if (/per ?day|PerDay/i.test(thongBao)) {
        const e = new Error("HET_NGAY");
        e.chiTiet = thongBao;
        throw e;
      }
      if (lan < 10) {
        const giay = Number(/(\d+(?:\.\d+)?)s/.exec(
          j.error?.details?.find((d) => d.retryDelay)?.retryDelay || ""
        )?.[1]) || 15 * (lan + 1);
        await cho(giay + 1, loai === "nghe" ? "dich" : "long");
        continue;
      }
    }
    if (r.status >= 500 && lan < 3) { await cho(5); continue; }
    const e = new Error(thongBao);
    e.status = r.status === 400 && /not found|not supported|is not/i.test(thongBao) ? 404 : r.status;
    throw e;
  }
}

async function cho(giay, tenBuoc) {
  for (let s = Math.ceil(giay); s > 0; s--) {
    if (tenBuoc) ghiChu(tenBuoc, `Gemini bảo chờ chút (giới hạn lượt miễn phí)… ${s}s`);
    await new Promise((x) => setTimeout(x, 1000));
  }
}

function layChu(tl) {
  const ung = tl.candidates?.[0];
  if (!ung?.content?.parts) {
    if (ung?.finishReason === "SAFETY" || tl.promptFeedback?.blockReason) throw new Error("Gemini từ chối nội dung video này.");
    throw new Error("Gemini không trả lời. Bấm Bắt đầu để thử lại.");
  }
  return ung.content.parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("");
}

function loiDeHieu(loi) {
  const m = String(loi?.message || loi);
  if (m === "HET_NGAY") return "Mã Gemini miễn phí đã hết lượt hôm nay.\nCách xử lý: chờ đến mai, hoặc bật thanh toán cho mã ở aistudio.google.com (rất rẻ), rồi bấm “Làm lại”. Những câu đã đọc xong được giữ lại, không tốn lượt lần nữa.";
  if (/API key not valid|API_KEY_INVALID/i.test(m)) return "Mã Gemini không đúng. Mở ⚙️ Cài đặt, dán lại mã.";
  if (loi?.status === 403) return "Mã Gemini không có quyền dùng (403). Kiểm tra mã ở aistudio.google.com.\n" + m;
  if (/out of memory|OOM|Aborted/i.test(m)) return "Video quá nặng so với điện thoại. Thử video ngắn hơn hoặc nhẹ hơn.";
  return m;
}

// =====================================================
// XỬ LÝ ÂM THANH
// =====================================================
// Đóng gói mẫu âm thanh thành file WAV
function taoWav(mau, tanSo) {
  const n = mau.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const chu = (o, s) => [...s].forEach((k, i) => v.setUint8(o + i, k.charCodeAt(0)));
  chu(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); chu(8, "WAVE");
  chu(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, tanSo, true); v.setUint32(28, tanSo * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  chu(36, "data"); v.setUint32(40, n * 2, true);
  const ra = new Int16Array(buf, 44, n);
  if (mau instanceof Int16Array) ra.set(mau);
  else for (let i = 0; i < n; i++) ra[i] = Math.max(-1, Math.min(1, mau[i])) * 32767;
  return new Uint8Array(buf);
}

function sangBase64(byte) {
  return new Promise((xong, hong) => {
    const fr = new FileReader();
    fr.onload = () => xong(String(fr.result).split(",")[1]);
    fr.onerror = hong;
    fr.readAsDataURL(new Blob([byte]));
  });
}

// Cắt khoảng lặng đầu/cuối, làm mềm 2 đầu, chỉnh âm lượng vừa phải
function lamGon(mau) {
  const nguong = 0.01;
  let a = 0, b = mau.length - 1;
  while (a < b && Math.abs(mau[a]) < nguong) a++;
  while (b > a && Math.abs(mau[b]) < nguong) b--;
  const ra = mau.slice(Math.max(0, a - 120), Math.min(mau.length, b + 240));
  let dinh = 0;
  for (const x of ra) dinh = Math.max(dinh, Math.abs(x));
  const tang = dinh > 0 ? Math.min(3, 0.89 / dinh) : 1;
  const mem = Math.min(120, ra.length >> 1);
  for (let i = 0; i < ra.length; i++) {
    let he = tang;
    if (i < mem) he *= i / mem;
    if (i > ra.length - mem) he *= (ra.length - i) / mem;
    ra[i] *= he;
  }
  return ra;
}

function doiTanSo(mau, tu, sang) {
  const ra = new Float32Array(Math.round((mau.length * sang) / tu));
  for (let i = 0; i < ra.length; i++) {
    const x = (i * tu) / sang, k = Math.floor(x), t = x - k;
    ra[i] = (mau[k] || 0) * (1 - t) + (mau[k + 1] || 0) * t;
  }
  return ra;
}

// Đọc nhanh hơn mà không bị "giọng chuột" (WSOLA): tiSo 1.3 = nhanh hơn 30%
function coGian(x, tiSo) {
  const N = 1024, Hs = N / 2, dung = 256;
  const Ha = Hs * tiSo;
  const w = Float32Array.from({ length: N }, (_, n) => 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / N));
  const soKhung = Math.max(1, Math.floor((x.length - N - dung) / Ha));
  const ra = new Float32Array(soKhung * Hs + N);
  let truoc = 0;
  for (let k = 0; k < soKhung; k++) {
    const goc = Math.round(k * Ha);
    let lech = 0;
    if (k > 0) {
      // tìm chỗ cắt khớp nhịp nhất với đoạn vừa ghép
      const mau = truoc + Hs;
      let tot = -Infinity;
      for (let d = -dung; d <= dung; d += 8) {
        const p = goc + d;
        if (p < 0 || p + N > x.length) continue;
        let s = 0;
        for (let n = 0; n < N; n += 2) s += x[p + n] * (x[mau + n] || 0);
        if (s > tot) { tot = s; lech = d; }
      }
    }
    const p = Math.max(0, Math.min(x.length - N, goc + lech));
    for (let n = 0; n < N; n++) ra[k * Hs + n] += (x[p + n] || 0) * w[n];
    truoc = p;
  }
  return ra;
}

// ----- Phụ đề & giờ -----
function dongHo(s) {
  const p = Math.floor(s / 60), g = s - p * 60;
  return `${String(p).padStart(2, "0")}:${g.toFixed(1).padStart(4, "0")}`;
}
function taoSrt() {
  const gio = (s) => {
    const ms = Math.round(s * 1000);
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), g = Math.floor((ms % 60000) / 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(g).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
  };
  return cacCau.map((c, i) => `${i + 1}\n${gio(c.start)} --> ${gio(c.end)}\n${c.vi}\n`).join("\n");
}
