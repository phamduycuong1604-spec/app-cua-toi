// =====================================================
// TÁCH NHẠC NỀN khỏi giọng nói (chạy ngầm, ngay trên điện thoại)
// Dùng mô hình AI MDX-Net của dự án Ultimate Vocal Remover (giấy phép MIT).
// Nhận: âm thanh 2 kênh 44.100 mẫu/giây → Trả: nhạc nền (đã bỏ giọng).
// =====================================================
import * as ort from "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/ort.webgpu.min.mjs";

ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/";
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;

const MO_HINH = {
  // giong: true = mô hình đoán GIỌNG, nhạc nền = gốc − giọng; false = đoán thẳng NHẠC NỀN
  nhanh: { tep: "mo-hinh/UVR_MDXNET_9482.onnx", nfft: 6144, dimF: 2048, bu: 1.035, giong: true },
  ky: { tep: "mo-hinh/UVR-MDX-NET-Inst_HQ_4.onnx", nfft: 5120, dimF: 2560, bu: 1.019, giong: false },
};
const HOP = 1024, DIM_T = 256;
const CHUNK = HOP * (DIM_T - 1);

const bao = (tin) => self.postMessage(tin);
let phien = null, phienTen = "";

self.onmessage = async (e) => {
  const { L, R, loai } = e.data;
  try {
    const mh = MO_HINH[loai] || MO_HINH.nhanh;
    if (phienTen !== loai) {
      const du = await taiMoHinh(mh.tep);
      bao({ loai: "tien-do", chu: "Đang khởi động AI…" });
      phien = null;
      for (const ep of ["webgpu", "wasm"]) {
        if (ep === "webgpu" && !navigator.gpu) continue;
        try {
          phien = await ort.InferenceSession.create(du, { executionProviders: [ep], graphOptimizationLevel: "all" });
          bao({ loai: "may", may: ep });
          break;
        } catch (loi) {
          console.warn("Không dùng được", ep, loi);
        }
      }
      if (!phien) throw new Error("Điện thoại không chạy được AI tách nhạc.");
      phienTen = loai;
    }
    const [nL, nR] = await tach(L, R, mh);
    self.postMessage({ loai: "xong", L: nL, R: nR }, [nL.buffer, nR.buffer]);
  } catch (loi) {
    bao({ loai: "loi", chu: String(loi?.message || loi) });
  }
};

// Tải mô hình 1 lần, cất vào kho của trình duyệt cho lần sau
async function taiMoHinh(tep) {
  const diaChi = new URL(tep, self.location.href).href;
  let kho = null;
  try { kho = await caches.open("phaha-mo-hinh"); } catch {}
  const daCo = await kho?.match(diaChi);
  if (daCo) return new Uint8Array(await daCo.arrayBuffer());
  const r = await fetch(diaChi);
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
  try { await kho?.put(diaChi, new Response(du.slice(), { headers: { "Content-Type": "application/octet-stream" } })); } catch {}
  return du;
}

// Chia âm thanh thành từng khúc ~6 giây, mỗi khúc chạy qua AI rồi ghép lại
async function tach(L, R, mh) {
  const N = L.length;
  const { nfft, dimF } = mh;
  const trim = nfft / 2;
  const gen = CHUNK - 2 * trim;
  const pad = gen - (N % gen);
  const dai = trim + N + pad + trim;
  const vao = [new Float32Array(dai), new Float32Array(dai)];
  vao[0].set(L, trim);
  vao[1].set(R, trim);
  const ra = [new Float32Array(N + pad), new Float32Array(N + pad)];
  const bien = taoBienDoi(nfft);
  const soKhuc = (N + pad) / gen;
  const dauVao = new Float32Array(4 * dimF * DIM_T);
  const batDau = Date.now();
  for (let k = 0; k < soKhuc; k++) {
    const o = k * gen;
    for (let c = 0; c < 2; c++) bien.stft(vao[c].subarray(o, o + CHUNK), dauVao, c, dimF);
    const kq = await phien.run({ [phien.inputNames[0]]: new ort.Tensor("float32", dauVao, [1, 4, dimF, DIM_T]) });
    const pho = kq[phien.outputNames[0]].data;
    for (let c = 0; c < 2; c++) {
      const song = bien.istft(pho, c, dimF);
      const dich = ra[c], goc = vao[c];
      for (let i = 0; i < gen; i++) {
        const v = song[trim + i] * mh.bu;
        dich[o + i] = mh.giong ? goc[o + trim + i] - v : v;
      }
    }
    const conLai = ((Date.now() - batDau) / (k + 1)) * (soKhuc - k - 1) / 1000;
    bao({ loai: "tien-do", chu: `${Math.round(((k + 1) / soKhuc) * 100)}% · còn ~${Math.ceil(conLai)} giây` });
  }
  return [ra[0].slice(0, N), ra[1].slice(0, N)];
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
