// =====================================================
// TÁCH NHẠC NỀN khỏi giọng nói (chạy ngầm, ngay trên điện thoại)
// Dùng mô hình AI MDX-Net của dự án Ultimate Vocal Remover (giấy phép MIT).
// Nhận: file WAV (44 byte đầu để trống + âm thanh 2 kênh 44.100 mẫu/giây, số nguyên 16 bit, xen kẽ trái/phải)
// → Trả: chính file đó, nay là nhạc nền (đã bỏ giọng).
// Tiết kiệm bộ nhớ (iPhone hay tắt trang khi hết bộ nhớ): chỉ giữ MỘT bản âm thanh, ghi đè kết quả lên chỗ đã đọc xong.
// Hỏng giữa chừng (vd. hết bộ nhớ) thì trả lại âm thanh kèm chỗ đang làm, để lần sau làm tiếp từ đó.
// =====================================================
const CDN = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/";

const MO_HINH = {
  // giong: true = mô hình đoán GIỌNG, nhạc nền = gốc − giọng; false = đoán thẳng NHẠC NỀN
  nhanh: { tep: "mo-hinh/UVR_MDXNET_9482.onnx", co: 29704436, nfft: 6144, dimF: 2048, bu: 1.035, giong: true },
  ky: { tep: "mo-hinh/UVR-MDX-NET-Inst_HQ_4.onnx", co: 59074342, nfft: 5120, dimF: 2560, bu: 1.019, giong: false },
};
const HOP = 1024, DIM_T = 256;
const CHUNK = HOP * (DIM_T - 1);

const bao = (tin) => self.postMessage(tin);
const ghi = (chu) => bao({ loai: "nhat", chu });
let ort = null, phien = null, phienTen = "", may = "";

self.onmessage = async (e) => {
  const { wav, loai } = e.data;
  // tu = khúc làm tiếp; duoi = phần tiếng gốc của khúc trước mà khúc sau còn cần (đã bị ghi đè trong wav)
  const viec = { tu: e.data.tu || 0, duoi: e.data.duoi || null };
  try {
    const mh = MO_HINH[loai] || MO_HINH.nhanh;
    if (phienTen !== loai) {
      const du = await taiMoHinh(mh);
      bao({ loai: "tien-do", chu: "Đang khởi động AI…" });
      ({ ort, phien, may } = await taoPhien(du, false));
      phienTen = loai;
    }
    try {
      await tach(wav, mh, viec);
    } catch (loi) {
      // Chip đồ hoạ khởi động được nhưng chạy lỗi → chuyển sang CPU, làm tiếp từ khúc đang dở
      if (may !== "webgpu") throw loi;
      ghi(`chip đồ hoạ chạy lỗi (${String(loi?.message || loi).slice(0, 150)}), chuyển sang CPU`);
      await phien?.release?.().catch(() => {});
      ({ ort, phien, may } = await taoPhien(await taiMoHinh(mh), true));
      await tach(wav, mh, viec);
    }
    self.postMessage({ loai: "xong", wav }, [wav]);
  } catch (loi) {
    const gui = [wav];
    if (viec.duoi) gui.push(viec.duoi[0].buffer, viec.duoi[1].buffer);
    self.postMessage({ loai: "loi", chu: String(loi?.message || loi), wav, tu: viec.tu, duoi: viec.duoi }, gui);
  }
};

// Thử chip đồ hoạ trước, hỏng thì dùng CPU. Mỗi cách nạp một bộ chạy AI riêng,
// để cách này hỏng không kéo cách kia hỏng theo.
async function taoPhien(du, chiCpu) {
  const cacCach = [];
  if (navigator.gpu && !chiCpu) cacCach.push({ goi: "ort.webgpu.min.mjs", ep: "webgpu" });
  cacCach.push({ goi: "ort.wasm.min.mjs", ep: "wasm" });
  const loi = [];
  for (const { goi, ep } of cacCach) {
    try {
      const o = await import(CDN + goi);
      o.env.wasm.wasmPaths = CDN;
      o.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
      const bd = Date.now();
      const p = await o.InferenceSession.create(du, { executionProviders: [ep], graphOptimizationLevel: "all" });
      ghi(`khởi động bằng ${ep} mất ${((Date.now() - bd) / 1000).toFixed(1)} giây`);
      bao({ loai: "may", may: ep });
      return { ort: o, phien: p, may: ep };
    } catch (l) {
      const chu = String(l?.message || l).slice(0, 200);
      loi.push(`${ep}: ${chu}`);
      ghi(`không chạy được bằng ${ep}: ${chu}`);
    }
  }
  throw new Error("Điện thoại không chạy được AI tách nhạc (" + loi.join(" | ") + ")");
}

// Tải mô hình 1 lần, cất vào kho của trình duyệt cho lần sau
async function taiMoHinh(mh) {
  const diaChi = new URL(mh.tep, self.location.href).href;
  let kho = null;
  try { kho = await caches.open("phaha-mo-hinh"); } catch {}
  const daCo = await kho?.match(diaChi).catch(() => null);
  if (daCo) {
    const du = new Uint8Array(await daCo.arrayBuffer());
    if (du.length === mh.co) { ghi(`dùng mô hình đã lưu (${(du.length / 1048576).toFixed(1)}MB)`); return du; }
    ghi(`mô hình đã lưu bị thiếu (${du.length} byte), tải lại`);
    await kho.delete(diaChi).catch(() => {});
  }
  const r = await fetch(diaChi, { cache: "no-store" });
  if (!r.ok) throw new Error("Không tải được mô hình AI tách nhạc.");
  const tong = Number(r.headers.get("content-length")) || 0;
  const doc = r.body.getReader();
  const manh = [];
  let da = 0;
  for (;;) {
    const { done, value } = await doc.read();
    if (done) break;
    manh.push(value);
    da += value.length;
    bao({ loai: "tien-do", chu: `Tải AI tách nhạc (chỉ lần đầu): ${tong ? Math.round((da / tong) * 100) + "%" : (da / 1048576).toFixed(0) + "MB"}` });
  }
  const du = new Uint8Array(da);
  let o = 0;
  for (const m of manh) { du.set(m, o); o += m.length; }
  if (du.length !== mh.co) throw new Error(`Tải mô hình AI không đủ (${du.length}/${mh.co} byte). Kiểm tra mạng rồi thử lại.`);
  ghi(`đã tải mô hình ${(du.length / 1048576).toFixed(1)}MB`);
  try { await kho?.put(diaChi, new Response(du.slice(), { headers: { "Content-Type": "application/octet-stream" } })); } catch {}
  return du;
}

// Chia âm thanh thành từng khúc ~6 giây, mỗi khúc chạy qua AI rồi ghi đè kết quả lên chỗ vừa đọc
async function tach(wav, mh, viec) {
  const pcm = new Int16Array(wav, 44);
  const N = pcm.length >> 1;
  const { nfft, dimF } = mh;
  const trim = nfft / 2;
  const gen = CHUNK - 2 * trim;
  const soKhuc = Math.floor(N / gen) + 1;
  // Khúc sau đọc lùi trim mẫu vào chỗ khúc trước đã ghi đè → giữ riêng trim mẫu gốc đó
  viec.duoi ||= [new Float32Array(trim), new Float32Array(trim)];
  const khuc = new Float32Array(CHUNK);
  const bien = taoBienDoi(nfft);
  const dauVao = new Float32Array(4 * dimF * DIM_T);
  const batDau = Date.now(), tu = viec.tu;
  for (let k = tu; k < soKhuc; k++) {
    const o = k * gen;
    // mẫu gốc thứ j của kênh c (ngoài khoảng thì là im lặng), số thực −1…1
    const mau = (c, j) => (j < 0 || j >= N ? 0 : j < o ? viec.duoi[c][j - o + trim] : pcm[2 * j + c] / 32768);
    for (let c = 0; c < 2; c++) {
      for (let i = 0; i < CHUNK; i++) khuc[i] = mau(c, o + i - trim);
      bien.stft(khuc, dauVao, c, dimF);
    }
    const kq = await phien.run({ [phien.inputNames[0]]: new ort.Tensor("float32", dauVao, [1, 4, dimF, DIM_T]) });
    const pho = kq[phien.outputNames[0]].data;
    const song = [bien.istft(pho, 0, dimF), bien.istft(pho, 1, dimF)];
    // AI chạy xong khúc này mới ghi (hỏng giữa chừng thì âm thanh vẫn nguyên, làm lại được)
    const het = Math.min(gen, N - o);
    for (let c = 0; c < 2; c++) {
      for (let i = 0; i < trim; i++) viec.duoi[c][i] = mau(c, o + gen - trim + i);
      for (let i = 0; i < het; i++) {
        const v = song[c][trim + i] * mh.bu;
        const idx = 2 * (o + i) + c;
        const x = mh.giong ? pcm[idx] / 32768 - v : v;
        pcm[idx] = Math.max(-1, Math.min(1, x)) * 32767;
      }
    }
    viec.tu = k + 1;
    const conLai = ((Date.now() - batDau) / (k + 1 - tu)) * (soKhuc - k - 1) / 1000;
    bao({ loai: "tien-do", chu: `${Math.round(((k + 1) / soKhuc) * 100)}% · còn ~${Math.ceil(conLai)} giây` });
  }
  ghiDauWav(wav, N, 44100);
}

function ghiDauWav(wav, n, tanSo) {
  const v = new DataView(wav);
  const chu = (o, s) => [...s].forEach((k, i) => v.setUint8(o + i, k.charCodeAt(0)));
  chu(0, "RIFF"); v.setUint32(4, 36 + n * 4, true); chu(8, "WAVE");
  chu(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
  v.setUint32(24, tanSo, true); v.setUint32(28, tanSo * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true);
  chu(36, "data"); v.setUint32(40, n * 4, true);
}

// ----- Biến đổi âm thanh ↔ phổ (STFT), giống hệt cách mô hình được huấn luyện -----
function taoBienDoi(nfft) {
  const fft = taoFFT(nfft);
  const w = new Float64Array(nfft);
  for (let n = 0; n < nfft; n++) w[n] = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / nfft);
  const nua = nfft / 2;
  const re = new Float64Array(nfft), im = new Float64Array(nfft);
  const dem = new Float64Array(CHUNK + nfft);
  const tong = new Float64Array(CHUNK + nfft);
  // tổng bình phương cửa sổ (giống nhau cho mọi khúc)
  const tongW = new Float64Array(CHUNK + nfft);
  for (let t = 0; t < DIM_T; t++) for (let n = 0; n < nfft; n++) tongW[t * HOP + n] += w[n] * w[n];

  function stft(x, ra, kenh, dimF) {
    // đệm phản chiếu 2 đầu (center=True)
    for (let i = 0; i < CHUNK + nfft; i++) {
      let j = i - nua;
      if (j < 0) j = -j;
      else if (j >= CHUNK) j = 2 * (CHUNK - 1) - j;
      dem[i] = x[j];
    }
    const oRe = kenh * 2 * dimF * DIM_T, oIm = oRe + dimF * DIM_T;
    for (let t = 0; t < DIM_T; t++) {
      const b = t * HOP;
      for (let n = 0; n < nfft; n++) { re[n] = dem[b + n] * w[n]; im[n] = 0; }
      fft(re, im);
      for (let k = 0; k < dimF; k++) {
        ra[oRe + k * DIM_T + t] = re[k];
        ra[oIm + k * DIM_T + t] = im[k];
      }
    }
  }

  function istft(pho, kenh, dimF) {
    tong.fill(0);
    const oRe = kenh * 2 * dimF * DIM_T, oIm = oRe + dimF * DIM_T;
    for (let t = 0; t < DIM_T; t++) {
      re.fill(0); im.fill(0);
      for (let k = 0; k < dimF; k++) {
        const a = pho[oRe + k * DIM_T + t], b = pho[oIm + k * DIM_T + t];
        // nghịch đảo = liên hợp → FFT → liên hợp; phổ đối xứng vì tín hiệu là số thực
        re[k] = a; im[k] = -b;
        if (k > 0 && k < nua) { re[nfft - k] = a; im[nfft - k] = b; }
      }
      im[0] = 0;
      fft(re, im);
      const b0 = t * HOP;
      for (let n = 0; n < nfft; n++) tong[b0 + n] += (re[n] / nfft) * w[n];
    }
    const ra = new Float32Array(CHUNK);
    for (let i = 0; i < CHUNK; i++) {
      const s = tongW[i + nua];
      ra[i] = s > 1e-11 ? tong[i + nua] / s : 0;
    }
    return ra;
  }
  return { stft, istft };
}

// FFT cho độ dài N = m · 2^k (m = 1, 3 hoặc 5), tại chỗ
function taoFFT(N) {
  let m = 1;
  for (const p of [3, 5]) if (N % p === 0 && ((N / p) & (N / p - 1)) === 0) m = p;
  const M = N / m;
  if ((M & (M - 1)) !== 0) throw new Error("Độ dài FFT không hỗ trợ: " + N);
  const bit = Math.log2(M);
  const dao = new Uint32Array(M);
  for (let i = 0; i < M; i++) {
    let r = 0;
    for (let b = 0; b < bit; b++) r |= ((i >> b) & 1) << (bit - 1 - b);
    dao[i] = r;
  }
  const cM = new Float64Array(M / 2), sM = new Float64Array(M / 2);
  for (let i = 0; i < M / 2; i++) { cM[i] = Math.cos((2 * Math.PI * i) / M); sM[i] = -Math.sin((2 * Math.PI * i) / M); }
  const cN = new Float64Array(N), sN = new Float64Array(N);
  for (let i = 0; i < N; i++) { cN[i] = Math.cos((2 * Math.PI * i) / N); sN[i] = -Math.sin((2 * Math.PI * i) / N); }
  const yRe = Array.from({ length: m }, () => new Float64Array(M));
  const yIm = Array.from({ length: m }, () => new Float64Array(M));

  function fft2(re, im) {
    for (let i = 0; i < M; i++) {
      const j = dao[i];
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    for (let len = 2; len <= M; len <<= 1) {
      const half = len >> 1, buoc = M / len;
      for (let i = 0; i < M; i += len) {
        for (let j = 0; j < half; j++) {
          const wr = cM[j * buoc], wi = sM[j * buoc];
          const a = i + j, b = a + half;
          const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr; im[a] += ti;
        }
      }
    }
  }

  return function fft(re, im) {
    if (m === 1) return fft2(re, im);
    // tách thành m dãy con x[m·n1 + n2], FFT từng dãy rồi ghép
    for (let n2 = 0; n2 < m; n2++) {
      const r = yRe[n2], i2 = yIm[n2];
      for (let n1 = 0; n1 < M; n1++) { r[n1] = re[m * n1 + n2]; i2[n1] = im[m * n1 + n2]; }
      fft2(r, i2);
    }
    for (let k1 = 0; k1 < M; k1++) {
      for (let k2 = 0; k2 < m; k2++) {
        const k = k1 + M * k2;
        let sr = 0, si = 0;
        for (let n2 = 0; n2 < m; n2++) {
          const idx = (n2 * k) % N;
          const wr = cN[idx], wi = sN[idx];
          const a = yRe[n2][k1], b = yIm[n2][k1];
          sr += a * wr - b * wi;
          si += a * wi + b * wr;
        }
        re[k] = sr; im[k] = si;
      }
    }
  };
}
