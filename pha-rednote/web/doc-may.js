// =====================================================
// GIỌNG ĐỌC MÁY tiếng Việt chạy ngay trên điện thoại (Piper, giọng vais1000)
// Không cần mã, không cần mạng sau lần tải đầu, không giới hạn lượt.
// Nhận { id, chu } → trả { id, pcm (Int16Array), tanSo }
// =====================================================
const CDN_ORT = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/";
const CDN_AM = "https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize";
importScripts(CDN_ORT + "ort.wasm.min.js", CDN_AM + ".js");
ort.env.wasm.wasmPaths = CDN_ORT;
ort.env.wasm.numThreads = 1;

const MO_HINH = { tep: "mo-hinh/vi_VN-vais1000-medium.onnx", co: 63149198 };
let phien = null, cauHinh = null, duLieuAm = null, dangKhoiDong = null;
const bao = (tin) => self.postMessage(tin);

async function taiCoKho(diaChi, co, ten) {
  let kho = null;
  try { kho = await caches.open("phaha-mo-hinh"); } catch {}
  const daCo = await kho?.match(diaChi).catch(() => null);
  if (daCo) {
    const du = await daCo.arrayBuffer();
    if (!co || du.byteLength === co) return du;
    await kho.delete(diaChi).catch(() => {});
  }
  const r = await fetch(diaChi);
  if (!r.ok) throw new Error(`Không tải được ${ten}`);
  const tong = Number(r.headers.get("content-length")) || co || 0;
  const doc = r.body.getReader();
  const manh = [];
  let da = 0, moc = -1;
  for (;;) {
    const { done, value } = await doc.read();
    if (done) break;
    manh.push(value);
    da += value.length;
    const pt = tong ? Math.floor((da / tong) * 4) : 0;
    if (pt !== moc) { moc = pt; bao({ loai: "nhat", chu: `tải ${ten} (chỉ lần đầu): ${tong ? Math.round((da / tong) * 100) + "%" : (da / 1048576).toFixed(0) + "MB"}` }); }
  }
  const du = new Uint8Array(da);
  let o = 0;
  for (const m of manh) { du.set(m, o); o += m.length; }
  if (co && du.length !== co) throw new Error(`Tải ${ten} không đủ, kiểm tra mạng rồi thử lại`);
  try { await kho?.put(diaChi, new Response(du.slice())); } catch {}
  return du.buffer;
}

function khoiDong() {
  dangKhoiDong ||= (async () => {
    const goc = new URL(MO_HINH.tep, self.location.href).href;
    cauHinh = await (await fetch(goc + ".json")).json();
    duLieuAm = await taiCoKho(CDN_AM + ".data", 0, "bộ phát âm tiếng Việt");
    const mh = await taiCoKho(goc, MO_HINH.co, "giọng đọc máy");
    phien = await ort.InferenceSession.create(new Uint8Array(mh), { executionProviders: ["wasm"] });
    bao({ loai: "nhat", chu: "giọng đọc máy sẵn sàng" });
  })().catch((l) => { dangKhoiDong = null; throw l; });
  return dangKhoiDong;
}

// Chữ → mã âm (dùng espeak-ng tiếng Việt chạy bằng WebAssembly)
function phienAm(chu) {
  return new Promise((xong, hong) => {
    createPiperPhonemize({
      noInitialRun: true,
      print: (d) => { try { xong(JSON.parse(d).phoneme_ids); } catch (l) { hong(l); } },
      printErr: () => {},
      getPreloadedPackage: () => duLieuAm,
      locateFile: (u) => (u.endsWith(".wasm") ? CDN_AM + ".wasm" : u.endsWith(".data") ? CDN_AM + ".data" : u),
    }).then((m) => {
      m.callMain(["-l", cauHinh.espeak.voice, "--input", JSON.stringify([{ text: chu }]), "--espeak_data", "/espeak-ng-data"]);
    }, hong);
  });
}

self.onmessage = async ({ data: { id, chu } }) => {
  try {
    await khoiDong();
    const ma = await phienAm(chu);
    const i = cauHinh.inference;
    const kq = await phien.run({
      input: new ort.Tensor("int64", BigInt64Array.from(ma, BigInt), [1, ma.length]),
      input_lengths: new ort.Tensor("int64", BigInt64Array.from([ma.length], BigInt), [1]),
      scales: new ort.Tensor("float32", Float32Array.from([i.noise_scale, i.length_scale, i.noise_w]), [3]),
    });
    const f = kq.output.data;
    const pcm = new Int16Array(f.length);
    for (let k = 0; k < f.length; k++) pcm[k] = Math.max(-1, Math.min(1, f[k])) * 32767;
    self.postMessage({ id, pcm, tanSo: cauHinh.audio.sample_rate }, [pcm.buffer]);
  } catch (l) {
    self.postMessage({ id, loi: String(l?.message || l) });
  }
};
