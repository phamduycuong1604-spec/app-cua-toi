// =====================================================
// XỬ LÝ VIDEO (ffmpeg chạy ngay trong trình duyệt): đọc video, tách tiếng, tách nhạc nền (AI), xuất video
// =====================================================
import { FFmpeg } from "./ffmpeg/index.js";
import { caiDat, S, nhat, ghiChu, dongHo, TEN_BUOC, TAN_SO_NGHE } from "./nen.js";

// Bộ xử lý video tải từ mạng, lần sau trình duyệt tự giữ lại
const LOI_FFMPEG = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";

let ff = null;
let dangTaiFf = null;
let nhatKyFf = []; // nhật ký của lệnh ffmpeg đang chạy
let duongDanVideo = null; // { tep, duong, gan } file video đang được ffmpeg đọc

export const ffDangBat = () => !!ff;

// Tắt hẳn bộ xử lý video để trả bộ nhớ (iPhone ít bộ nhớ); lần sau dùng sẽ tự bật lại
export function tatFfmpeg() {
  try { ff?.terminate(); } catch {}
  ff = null;
  duongDanVideo = null;
}

export function taiFfmpeg() {
  if (ff) return Promise.resolve();
  dangTaiFf ||= taiFfmpegThat().finally(() => (dangTaiFf = null));
  return dangTaiFf;
}
async function taiFfmpegThat() {
  const moi = new FFmpeg();
  moi.on("log", ({ message }) => {
    nhatKyFf.push(message);
    if (nhatKyFf.length > 400) nhatKyFf.shift();
  });
  const coreURL = await taiThanhBlob(`${LOI_FFMPEG}/ffmpeg-core.js`, "text/javascript");
  const wasmURL = await taiThanhBlob(`${LOI_FFMPEG}/ffmpeg-core.wasm`, "application/wasm", (da, tong) =>
    ghiChu("tai", tong ? `${Math.min(100, Math.round((da / tong) * 100))}%` : `${(da / 1048576).toFixed(0)}MB`)
  );
  await moi.load({ coreURL, wasmURL });
  ff = moi;
}
async function taiThanhBlob(diaChi, kieu, baoTienDo) {
  const r = await fetch(diaChi);
  if (!r.ok) throw new Error("Không tải được bộ xử lý video. Kiểm tra mạng rồi thử lại.");
  const tong = Number(r.headers.get("content-length")) || 0;
  const doc = r.body.getReader(), manh = [];
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

// Chạy 1 lệnh ffmpeg (hiện % lên bước đang chạy), trả về mã kết thúc + nhật ký của lệnh đó
async function lenh(thamSo, tenBuoc) {
  nhatKyFf = [];
  const theoDoi = ({ message }) => {
    const m = /time=(\d+):(\d+):([\d.]+)/.exec(message);
    if (m && S.thoiLuong && tenBuoc) {
      const s = +m[1] * 3600 + +m[2] * 60 + +m[3];
      ghiChu(tenBuoc, `${Math.min(99, Math.round((s / S.thoiLuong) * 100))}%`);
    }
  };
  ff.on("log", theoDoi);
  const bd = Date.now();
  try {
    const ma = await ff.exec(thamSo);
    if (tenBuoc) nhat(`ffmpeg (${TEN_BUOC[tenBuoc]}): mã ${ma}, ${((Date.now() - bd) / 1000).toFixed(1)} giây${ma ? " · " + nhatKyFf.slice(-2).join(" / ") : ""}`);
    return { ma, log: nhatKyFf.join("\n") };
  } finally {
    ff.off("log", theoDoi);
  }
}

// Cho ffmpeg đọc thẳng file video (không chép cả file vào bộ nhớ), rồi hỏi video có những gì
export async function ganVideo() {
  const tep = S.tepVideo;
  if (duongDanVideo?.tep !== tep) {
    if (duongDanVideo?.gan) await ff.unmount("/vao").catch(() => {});
    for (const f of await ff.listDir("/").catch(() => [])) {
      if (f.name.startsWith("tam-")) await ff.deleteFile("/" + f.name).catch(() => {});
    }
    let duong, gan = false;
    try {
      await ff.createDir("/vao").catch(() => {});
      await ff.mount("WORKERFS", { files: [tep] }, "/vao");
      duong = "/vao/" + tep.name;
      gan = true;
    } catch {
      duong = "/tam-video" + (/\.[^.]+$/.exec(tep.name)?.[0] || ".mp4");
      await ff.writeFile(duong, new Uint8Array(await tep.arrayBuffer()));
    }
    duongDanVideo = { tep, duong, gan };
  }
  // Lệnh chỉ đọc thông tin sẽ "lỗi" vì không có đầu ra, không sao
  const { log } = await lenh(["-hide_banner", "-i", duongDanVideo.duong]);
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(log);
  if (m) S.thoiLuong = +m[1] * 3600 + +m[2] * 60 + +m[3];
  if (!S.thoiLuong) throw new Error("Không đọc được video này. Thử video khác (MP4/MOV).");
  const hinh = /Stream #.*Video: (\w+)[^\n]*?(\d{2,5})x(\d{2,5})/.exec(log);
  const tieng = /Stream #.*Audio: (\w+)[^\n]*?(\d+) Hz, (\w+)/.exec(log);
  nhat(`Thông tin video: dài ${dongHo(S.thoiLuong)} · hình ${hinh ? `${hinh[1]} ${hinh[2]}×${hinh[3]}` : "?"} · tiếng ${tieng ? `${tieng[1]} ${tieng[2]}Hz ${tieng[3]}` : "không có"}`);
  return {
    duong: duongDanVideo.duong,
    coTieng: /Stream #.*Audio:/.test(log),
    hevc: /Stream #.*Video: hevc/.test(log),
  };
}

// Tách tiếng để gửi đi nghe: 16.000 mẫu/giây, 1 kênh, 16 bit
export async function tachTieng() {
  const ra = "/tieng.pcm";
  const { ma, log } = await lenh(["-hide_banner", "-i", duongDanVideo.duong, "-vn", "-ac", "1", "-ar", String(TAN_SO_NGHE), "-f", "s16le", ra], "tach");
  if (ma !== 0) throw new Error("Không tách được tiếng khỏi video.\n" + log.split("\n").slice(-3).join("\n"));
  const du = await ff.readFile(ra);
  await ff.deleteFile(ra);
  return new Int16Array(du.buffer, du.byteOffset, du.byteLength >> 1);
}

// =====================================================
// TÁCH NHẠC NỀN khỏi giọng gốc (AI chạy ngầm trong tach-nhac.js)
// =====================================================
let thoTach = null;
export function dungTachNhac() { thoTach?.terminate(); thoTach = null; }

export async function tachNhacNen() {
  const ra = "/nen.pcm";
  const { ma } = await lenh(["-hide_banner", "-i", duongDanVideo.duong, "-vn", "-ac", "2", "-ar", "44100", "-f", "s16le", ra], "nhac");
  if (ma !== 0) throw new Error("Không lấy được tiếng gốc để tách nhạc.");
  let du = await ff.readFile(ra);
  await ff.deleteFile(ra);
  // Chép một lần vào file WAV (44 byte đầu để trống); AI đọc 16 bit và ghi nhạc nền đè lên chính chỗ đó
  // → cả quá trình chỉ giữ một bản âm thanh (iPhone hay tắt trang khi hết bộ nhớ)
  const n = du.byteLength >> 2;
  let wav = new ArrayBuffer(44 + n * 4);
  new Uint8Array(wav, 44).set(du.subarray(0, n * 4));
  du = null;
  // iPhone ít bộ nhớ: tạm tắt bộ xử lý video trong lúc AI chạy, xuất video sẽ bật lại
  tatFfmpeg();
  nhat("Tạm tắt bộ xử lý video để nhường bộ nhớ cho AI tách nhạc");
  nhat(`Tách nhạc: ${dongHo(n / 44100)} âm thanh, kiểu ${caiDat.mhTach}`);
  // iPhone hay báo "Out of memory" khi AI khởi động ngay sau bước nặng khác (bộ nhớ chưa kịp trả lại)
  // → tắt AI, chờ cho máy dọn bộ nhớ rồi thử lại (tối đa 2 lần), làm tiếp từ khúc đang dở
  let viec = { wav, tu: 0, duoi: null };
  wav = null;
  for (let lan = 0; ; lan++) {
    try {
      const kq = await tachMotLan(viec);
      dungTachNhac(); // tách xong thì tắt AI để trả bộ nhớ cho bước dựng hình/xuất video
      return new Uint8Array(kq.wav);
    } catch (loi) {
      if (!loi.traLai || lan >= 2 || !/out of memory|memory|OOM|allocation|RangeError|no available backend/i.test(loi.message)) throw loi;
      viec = loi.traLai;
      const giay = 5 * (lan + 1);
      nhat(`Tách nhạc thiếu bộ nhớ → chờ ${giay} giây cho điện thoại dọn bộ nhớ rồi thử lại (lần ${lan + 2})${viec.tu ? ", làm tiếp từ chỗ đang dở" : ""}`);
      ghiChu("nhac", "Tách nhạc đang chờ điện thoại dọn bộ nhớ…");
      await new Promise((x) => setTimeout(x, giay * 1000));
    }
  }
}
function tachMotLan(viec) {
  thoTach ||= new Worker(new URL("./tach-nhac.js", import.meta.url), { type: "module" });
  let mocPhanTram = -1;
  return new Promise((xong, hong) => {
    thoTach.onmessage = ({ data: d }) => {
      if (d.loai === "tien-do") {
        ghiChu("nhac", d.chu);
        const pt = Number(/(\d+)%/.exec(d.chu)?.[1]);
        const nac = Math.floor(pt / 25);
        if (!isFinite(pt) || nac !== mocPhanTram) { if (isFinite(pt)) mocPhanTram = nac; nhat("Tách nhạc: " + d.chu); }
      } else if (d.loai === "nhat") {
        nhat("Tách nhạc: " + d.chu);
      } else if (d.loai === "may") {
        ghiChu("nhac", d.may === "webgpu" ? "Đang tách bằng chip đồ hoạ…" : "Đang tách bằng CPU (chậm hơn)…");
        nhat(`Tách nhạc chạy bằng: ${d.may === "webgpu" ? "chip đồ hoạ (WebGPU)" : "CPU (WASM, chậm)"}`);
      } else if (d.loai === "xong") {
        xong(d);
      } else if (d.loai === "loi") {
        dungTachNhac();
        // AI trả lại âm thanh kèm chỗ đang làm → thử lại được mà không phải trích tiếng lại
        hong(Object.assign(new Error("Tách nhạc bị lỗi: " + d.chu), d.wav ? { traLai: { wav: d.wav, tu: d.tu, duoi: d.duoi } } : {}));
      }
    };
    thoTach.onerror = (e) => { thoTach = null; hong(new Error("Tách nhạc bị lỗi: " + (e.message || "không tải được AI"))); };
    const gui = [viec.wav];
    if (viec.duoi) gui.push(viec.duoi[0].buffer, viec.duoi[1].buffer);
    thoTach.postMessage({ wav: viec.wav, tu: viec.tu, duoi: viec.duoi, loai: caiDat.mhTach }, gui);
  });
}

// ----- DẬP GIỌNG GỐC CÒN SÓT trong nhạc nền đã tách -----
// AI tách nhạc đôi khi bỏ sót cả một khúc giọng (giọng lẫn trong nhạc to, giọng qua hiệu ứng…).
// So độ to từng ô 0,25 giây: tiếng gốc (lấy lúc tách tiếng) và nhạc nền đã tách. Trong câu thoại mà nhạc nền
// vẫn to gần bằng tiếng gốc → AI chưa bỏ được giọng → giảm nhỏ nhạc nền ở câu đó (lời Việt đè lên nghe rõ, không lẫn giọng Trung)
const O_DO_TO = 0.25;
export function ghiDoToGoc(pcm) {
  const n = Math.round(TAN_SO_NGHE * O_DO_TO), so = Math.floor(pcm.length / n), r = new Float32Array(so);
  for (let o = 0; o < so; o++) {
    let e = 0;
    for (let k = o * n; k < (o + 1) * n; k += 2) e += (pcm[k] / 32768) ** 2;
    r[o] = e / (n / 2);
  }
  S.doToGoc = { tep: S.tepVideo, r };
}
function dapGiongSot(wav) {
  const goc = S.doToGoc?.tep === S.tepVideo ? S.doToGoc.r : null;
  if (!goc || wav.byteLength < 44 + 4 * 44100) return;
  const pcm = new Int16Array(wav.buffer, wav.byteOffset + 44, (wav.byteLength - 44) >> 1);
  const n = Math.round(44100 * O_DO_TO), so = Math.min(goc.length, Math.floor(pcm.length / 2 / n));
  const nen = new Float32Array(so);
  for (let o = 0; o < so; o++) {
    let e = 0;
    for (let k = o * n; k < (o + 1) * n; k += 2) e += ((pcm[2 * k] + pcm[2 * k + 1]) / 65536) ** 2;
    nen[o] = e / (n / 2);
  }
  // các khúc có lời Việt (gộp câu sát nhau)
  const doan = [];
  for (const c of S.cacCau) {
    if (!String(c.vi || "").trim()) continue;
    const a = Math.max(0, c.start - 0.15), b = c.end + 0.15, cuoi = doan[doan.length - 1];
    if (cuoi && a <= cuoi[1] + 0.3) cuoi[1] = Math.max(cuoi[1], b);
    else doan.push([a, b]);
  }
  const sot = [];
  for (const [a, b] of doan) {
    const oa = Math.floor(a / O_DO_TO), ob = Math.min(so, Math.ceil(b / O_DO_TO));
    let eg = 0, en = 0;
    for (let o = oa; o < ob; o++) { eg += goc[o]; en += nen[o]; }
    if (ob > oa && eg > 1e-5 * (ob - oa) && en / eg > 0.65) sot.push([a, b]);
  }
  if (!sot.length) return;
  const GIAM = 0.15, mo = Math.round(0.1 * 44100);
  for (const [a, b] of sot) {
    const ia = Math.round(a * 44100), ib = Math.min(pcm.length / 2, Math.round(b * 44100));
    for (let i = Math.max(0, ia - mo); i < Math.min(pcm.length / 2, ib + mo); i++) {
      const vao = Math.min(1, Math.max(0, (i - (ia - mo)) / mo)), ra = Math.min(1, Math.max(0, (ib + mo - i) / mo));
      const g = 1 - (1 - GIAM) * Math.min(vao, ra);
      pcm[2 * i] *= g;
      pcm[2 * i + 1] *= g;
    }
  }
  const giay = sot.reduce((t, [a, b]) => t + b - a, 0);
  nhat(`🔇 Nhạc nền còn sót giọng gốc ở ${sot.length} khúc (${giay.toFixed(0)} giây, vd ${sot.slice(0, 3).map(([a, b]) => `${dongHo(a)}–${dongHo(b)}`).join(", ")}) → giảm nhỏ nhạc nền ở các khúc đó`);
}

// Âm lượng tiếng gốc theo thời gian (khi không tách được nhạc): gần như tắt trong các câu thoại, bình thường ở chỗ khác
function bieuThucGiam() {
  const doan = [];
  for (const c of S.cacCau) {
    const a = Math.max(0, c.start - 0.15), b = c.end + 0.15;
    const cuoi = doan[doan.length - 1];
    if (cuoi && a <= cuoi[1] + 0.3) cuoi[1] = Math.max(cuoi[1], b);
    else doan.push([a, b]);
  }
  const cao = (caiDat.amNen / 100).toFixed(2);
  if (!doan.length) return cao;
  const trong = doan.map(([a, b]) => `between(t,${a.toFixed(2)},${b.toFixed(2)})`).join("+");
  return `if(gt(${trong},0),0.03,${cao})`;
}

// =====================================================
// XUẤT VIDEO: ghép hình (gốc hoặc đã chèn chữ/logo) với tiếng Việt (+ nhạc nền / tiếng gốc nhỏ)
// =====================================================
export async function xuatVideo(wav, tt, wavNen, hinh, giamTheoLoi) {
  const tiengLong = "/long-tieng.wav", tepNen = "/nhac-nen.wav", ra = "/ket-qua.mp4";
  await ff.writeFile(tiengLong, wav);
  const thamSo = ["-hide_banner", "-y", "-i", tt.duong, "-i", tiengLong];
  let soVao = 2, chonAm;
  if (wavNen) {
    // Video ngắn: gửi bản sao, bản gốc giữ lại để bấm "Làm lại" khỏi tách nhạc lại.
    // Video dài (nhạc nền > 60MB, khoảng 6 phút trở lên): gửi luôn bản gốc cho đỡ tốn gấp đôi bộ nhớ (iPhone hay tắt trang);
    // bấm "Làm lại" thì tách nhạc lại.
    if (wavNen.byteLength > 60 * 1048576) {
      S.nhacNen = null;
      nhat(`Nhạc nền ${(wavNen.byteLength / 1048576).toFixed(0)}MB → không giữ bản sao để đỡ tốn bộ nhớ`);
      dapGiongSot(wavNen);
      await ff.writeFile(tepNen, wavNen);
    } else {
      const ban = wavNen.slice();
      dapGiongSot(ban);
      await ff.writeFile(tepNen, ban);
    }
    thamSo.push("-i", tepNen, "-filter_complex", `[${soVao}:a]volume=${caiDat.amNen / 100}[nen];[nen][1:a]amix=inputs=2:duration=first:normalize=0[am]`);
    chonAm = "[am]";
    soVao++;
  } else if (giamTheoLoi) {
    // Không tách được nhạc: lúc có lời thoại thì gần như tắt tiếng gốc, lúc khác giữ nhạc nền
    thamSo.push("-filter_complex", `[0:a:0]volume='${bieuThucGiam()}':eval=frame[nen];[nen][1:a]amix=inputs=2:duration=first:normalize=0[am]`);
    chonAm = "[am]";
  } else if (tt.coTieng && caiDat.amGoc > 0) {
    thamSo.push("-filter_complex", `[0:a:0]volume=${caiDat.amGoc / 100}[goc];[goc][1:a]amix=inputs=2:duration=first:normalize=0[am]`);
    chonAm = "[am]";
  } else {
    chonAm = "1:a";
  }
  // Hình: lấy bản đã chèn phụ đề/logo nếu có, không thì giữ nguyên hình gốc (không mã hoá lại)
  let chonHinh = "0:v:0", hevc = tt.hevc;
  if (hinh) {
    await ff.createDir("/hinh").catch(() => {});
    await ff.mount("WORKERFS", { files: [new File([hinh.blob], "hinh.mp4")] }, "/hinh");
    thamSo.push("-i", "/hinh/hinh.mp4");
    chonHinh = `${soVao}:v:0`;
    hevc = hinh.codec === "hevc";
  }
  thamSo.push("-map", chonHinh, "-map", chonAm, "-t", String(S.thoiLuong), "-c:v", "copy");
  if (hevc) thamSo.push("-tag:v", "hvc1"); // để iPhone phát được video HEVC
  // Hình chèn chữ do bộ mã hoá của trình duyệt làm ra bị ghi nhầm là "dải màu đầy đủ" trong khi dữ liệu là dải màu
  // thường → máy phát hiển thị bạc màu (trắng thành xám). Sửa lại nhãn màu cho đúng (không mã hoá lại, rất nhanh).
  const suaMau = hinh?.codec === "avc" ? ["-bsf:v", "h264_metadata=video_full_range_flag=0:transfer_characteristics=1"] : [];
  const cuoi = ["-c:a", "aac", "-b:a", "160k", ra];
  try {
    let { ma, log } = await lenh([...thamSo, ...suaMau, ...cuoi], "xuat");
    if (ma !== 0 && suaMau.length) {
      nhat("Sửa nhãn màu không được → xuất lại không sửa");
      ({ ma, log } = await lenh([...thamSo, ...cuoi], "xuat"));
    }
    if (ma !== 0) throw new Error("Ghép video bị lỗi.\n" + log.split("\n").slice(-3).join("\n"));
    return new Blob([await ff.readFile(ra)], { type: "video/mp4" });
  } finally {
    await ff.deleteFile(tiengLong).catch(() => {});
    await ff.deleteFile(tepNen).catch(() => {});
    await ff.deleteFile(ra).catch(() => {});
    if (hinh) await ff.unmount("/hinh").catch(() => {});
  }
}
