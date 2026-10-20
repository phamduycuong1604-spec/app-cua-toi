// =====================================================
// ĐỌC TIẾNG VIỆT & LỒNG TIẾNG CẢ VIDEO
// Thứ tự giọng (người dùng chọn): Gemini → ElevenLabs → Viettel → Google Cloud → FPT → Fish → Azure → Edge → Giọng máy
// Giọng trên hết lượt/lỗi thì đọc lại TOÀN BỘ video bằng giọng kế tiếp (không trộn 2 giọng trong 1 video)
// =====================================================
import {
  $, caiDat, S, nhat, ghiChu, cho, docLuu, ghiLuu, luuCaiDat, kyTuThang, congKyTu, thangNay, dongHo,
  coMayChu, daDangNhap, mayChu, veDangNhap, quaMayChu, TAN_SO_DOC, NHANH_TOI_DA,
} from "./nen.js";
import { goiGemini, moHinhDocDaChot, chotMoHinhDoc, conLuotGeminiDoc } from "./gemini.js";
import { taoWav, docWav, giaiMp3, tuBase64, lamGon, doiTanSo, coGian, chuanHoaDoc } from "./am-thanh.js";
import { duPhong } from "./nghe-dich.js";
import { tatFfmpeg, ffDangBat } from "./video.js";
import { loiDeHieu } from "./loi.js";

// Thứ tự dùng giọng (theo yêu cầu người dùng: Gemini có xoay vòng nhiều mã đọc trước tiên)
export const THU_TU = ["gemini", "el", "vt", "gc", "fpt", "fish", "az", "edge", "may"];
export const CAC_DV = ["gc", "az", "el", "fish"]; // các dịch vụ có mã + danh sách giọng tải về
export const CAU_MAU = "Xin chào, đây là giọng lồng tiếng của PhaHa. Chúc bạn một ngày thật vui!";

// ----- Gọi dịch vụ đọc: tự thử lại khi mạng chập chờn hoặc bị giới hạn lượt/phút -----
// Edge hỏng liên tục (Microsoft chặn/ngắt) → bỏ Edge sớm, chuyển giọng kế tiếp thay vì cố hàng chục phút
let edgeLoi = 0, edgeXong = 0;
const edgeYeu = () => edgeLoi >= 10 && edgeLoi > edgeXong * 0.2;
async function goiDocGiong(dv, diaChi, tuyChon, kieu = "json") {
  let lanDongThoi = 0;
  for (let lan = 0; ; lan++) {
    let r;
    const bd = Date.now();
    try {
      r = await fetch(diaChi, tuyChon);
    } catch (loiMang) {
      nhat(`⚠️ ${DICH_VU[dv].ten}: lỗi mạng (${loiMang?.message || loiMang})`);
      if (lan < 3) { await cho(3); continue; }
      throw Object.assign(new Error(`Không gọi được ${DICH_VU[dv].ten}. Kiểm tra mạng` + (dv === "az" ? " và tên Vùng." : ".")), { dv });
    }
    if (r.ok) {
      if (dv === "edge") edgeXong++;
      if (Date.now() - bd > 8000) nhat(`🐢 ${DICH_VU[dv].ten} trả lời chậm: ${((Date.now() - bd) / 1000).toFixed(1)} giây`);
      return kieu === "json" ? r.json() : new Uint8Array(await r.arrayBuffer());
    }
    const chu = await r.text().catch(() => "");
    nhat(`⚠️ ${DICH_VU[dv].ten}: mã ${r.status} · ${chu.slice(0, 150)}`);
    if (dv === "edge" && r.status >= 500 && ++edgeLoi && edgeYeu())
      throw Object.assign(new Error(`Edge lỗi liên tục (${edgeLoi} lần lỗi, mới đọc được ${edgeXong} câu)`), { status: r.status, dv, edgeYeu: true });
    let j = {};
    try { j = JSON.parse(chu); } catch {}
    const thongBao = j.error?.message || j.detail?.message || (typeof j.detail === "string" ? j.detail : "") || chu.slice(0, 200) || r.statusText;
    // ElevenLabs miễn phí không được dùng giọng trong thư viện cộng đồng qua app → không phải hết lượt, chỉ cần đổi giọng
    const canGoiTraPhi = dv === "el" && (j.detail?.code === "paid_plan_required" || /library voices/i.test(thongBao));
    const hetLuot = !canGoiTraPhi && (j.detail?.status === "quota_exceeded" || j.detail?.code === "quota_exceeded" || (/quota/i.test(thongBao) && dv === "el")
      || r.status === 402 || (dv === "fish" && /credit|balance|quota|limit exceeded/i.test(thongBao)));
    // Gửi quá nhiều câu cùng lúc → chờ chút rồi gửi lại (không tính là lỗi)
    if (r.status === 429 && /concurrent/i.test(chu) && lanDongThoi++ < 40) {
      await new Promise((x) => setTimeout(x, 1000 + Math.random() * 2000));
      lan--;
      continue;
    }
    if (!hetLuot && (r.status === 429 || r.status >= 500) && lan < (dv === "edge" && r.status !== 429 ? 1 : 5)) { await cho(5 * (lan + 1), "long"); continue; }
    throw Object.assign(new Error(thongBao), { status: r.status, dv, hetLuot, canGoiTraPhi });
  }
}

// ----- Gemini -----
async function docGemini(chu, lan = 0) {
  const tl = await goiGemini("doc", {
    // Chỉ gửi đúng câu cần đọc. Không kèm lời dặn kiểu "Đọc bằng tiếng Việt…" vì các mẫu Gemini đọc giọng
    // mới (3.x) đọc to luôn cả lời dặn vào video. Tốc độ đã có app tự chỉnh khi xếp giọng vào video.
    contents: [{ parts: [{ text: chu }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: caiDat.giong } } },
    },
  });
  if (tl.moHinh) (globalThis.__phahaMhDoc ||= []).push(tl.moHinh); // để bộ kiểm tra xem cả video có cùng 1 loại không
  const phan = tl.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!phan) {
    // Gemini thỉnh thoảng trả lời mà không kèm tiếng (lỗi ngẫu nhiên) → gửi lại câu đó
    if (lan < 2) { nhat(`Gemini đọc thiếu tiếng (${tl.candidates?.[0]?.finishReason || "?"}) → gửi lại câu này`); return docGemini(chu, lan + 1); }
    throw new Error("Gemini không trả về giọng đọc. Thử lại sau ít phút.");
  }
  const byte = tuBase64(phan.inlineData.data);
  return {
    pcm: new Int16Array(byte.buffer, 0, byte.length >> 1),
    tanSo: Number(/rate=(\d+)/.exec(phan.inlineData.mimeType || "")?.[1]) || TAN_SO_DOC,
  };
}

// ----- Google Cloud Text-to-Speech -----
const GC_API = "https://texttospeech.googleapis.com/v1";
const goiGc = (duong, noiDung) =>
  goiDocGiong("gc", GC_API + duong, {
    method: noiDung ? "POST" : "GET",
    headers: { "Content-Type": "application/json", "x-goog-api-key": caiDat.dv.gc.khoa || caiDat.khoa },
    body: noiDung ? JSON.stringify(noiDung) : undefined,
  });
// Danh sách giọng tiếng Việt, giọng tự nhiên (Chirp3-HD, Neural2, Wavenet) lên đầu
async function layGiongGc() {
  const j = await goiGc("/voices?languageCode=vi-VN");
  const hang = (t) => (/Chirp3-HD/.test(t) ? 0 : /Neural2/.test(t) ? 1 : /Wavenet/.test(t) ? 2 : /Standard/.test(t) ? 4 : 3);
  const loai = (t) => (/Chirp3-HD/.test(t) ? "Tự nhiên nhất" : /Neural2/.test(t) ? "Tự nhiên" : /Wavenet/.test(t) ? "Tốt, rẻ" : /Standard/.test(t) ? "Cơ bản" : "Khác");
  return (j.voices || [])
    .filter((g) => g.languageCodes?.includes("vi-VN"))
    .sort((a, b) => hang(a.name) - hang(b.name) || a.name.localeCompare(b.name))
    .map((g) => ({ ten: g.name, nhan: `${loai(g.name)} · ${g.ssmlGender === "MALE" ? "Nam" : g.ssmlGender === "FEMALE" ? "Nữ" : ""} · ${g.name.replace("vi-VN-", "")}` }));
}
// Google miễn phí theo từng loại giọng mỗi tháng: Chirp3-HD 1 triệu, Neural2 1 triệu, WaveNet 4 triệu, Standard 4 triệu ký tự
export const LOAI_GC = { hd: { ten: "Chirp 3 HD", mienPhi: 1000000 }, n2: { ten: "Neural2", mienPhi: 1000000 }, wn: { ten: "WaveNet", mienPhi: 4000000 }, st: { ten: "Standard", mienPhi: 4000000 } };
const loaiGc = (ten) => (/Chirp/.test(ten) ? "hd" : /Neural2/.test(ten) ? "n2" : /Wavenet/i.test(ten) ? "wn" : "st");
let giongGcLanNay = null; // giọng Google dùng cho cả video đang làm
// Chọn giọng Google cho cả video: loại đang chọn sắp hết mức miễn phí tháng này
// thì đổi sang loại khác còn lượt (ưu tiên cùng giới tính), để vẫn miễn phí
function chonGiongGc(soKyTu) {
  const chon = caiDat.dv.gc.giong;
  const conLuot = (ten) => kyTuThang("gc-" + loaiGc(ten)) + soKyTu <= LOAI_GC[loaiGc(ten)].mienPhi * 0.97;
  if (conLuot(chon)) return chon;
  const ds = caiDat.dv.gc.ds || [];
  const gioi = (ten) => (/· Nam ·/.test(ds.find((g) => g.ten === ten)?.nhan || "") ? "nam" : "nu");
  const thuTu = ["hd", "n2", "wn", "st"];
  const thay = ds
    .filter((g) => g.ten !== chon && conLuot(g.ten))
    .sort((a, b) => (gioi(b.ten) === gioi(chon)) - (gioi(a.ten) === gioi(chon)) || thuTu.indexOf(loaiGc(a.ten)) - thuTu.indexOf(loaiGc(b.ten)))[0];
  if (thay) {
    nhat(`Giọng ${LOAI_GC[loaiGc(chon)].ten} sắp hết mức miễn phí tháng này → video này đọc bằng ${thay.ten.replace("vi-VN-", "")} (${LOAI_GC[loaiGc(thay.ten)].ten}, vẫn miễn phí)`);
    return thay.ten;
  }
  nhat("⚠️ Mọi giọng Google đã quá mức miễn phí tháng này (đếm trên máy này) – Google sẽ tính tiền rất ít (~100.000đ/1 triệu ký tự với WaveNet)");
  return chon;
}
async function docGoogleCloud(chu) {
  const giong = giongGcLanNay || caiDat.dv.gc.giong;
  const j = await goiGc("/text:synthesize", {
    input: { text: chu },
    voice: { languageCode: "vi-VN", name: giong },
    audioConfig: { audioEncoding: "LINEAR16", sampleRateHertz: TAN_SO_DOC },
  });
  congKyTu("gc", chu.length);
  congKyTu("gc-" + loaiGc(giong), chu.length);
  return docWav(tuBase64(j.audioContent));
}

// ----- Microsoft Azure Speech -----
export const azApi = (duong) => `https://${caiDat.dv.az.vung}.tts.speech.microsoft.com/cognitiveservices${duong}`;
async function layGiongAz() {
  const ds = await goiDocGiong("az", azApi("/voices/list"), { headers: { "Ocp-Apim-Subscription-Key": caiDat.dv.az.khoa } });
  // Giọng Việt + giọng "đa ngôn ngữ" đọc được tiếng Việt (nghe tự nhiên, có cảm xúc hơn)
  const viet = (g) => g.Locale === "vi-VN";
  const daNgu = (g) => !viet(g) && (g.SecondaryLocaleList || []).includes("vi-VN");
  const hang = (g) => (viet(g) ? 0 : /HD|Dragon/.test(g.ShortName) ? 2 : 1);
  return (ds || [])
    .filter((g) => viet(g) || daNgu(g))
    .sort((a, b) => hang(a) - hang(b) || a.ShortName.localeCompare(b.ShortName))
    .map((g) => ({
      ten: g.ShortName,
      nhan: `${viet(g) ? "🇻🇳 " : "🌐 "}${g.Gender === "Male" ? "Nam" : "Nữ"} · ${viet(g) ? g.LocalName || g.DisplayName : g.DisplayName + " (đa ngôn ngữ)"}`,
    }));
}
const ssmlViet = (giong, chu) => {
  const anToan = chu.replace(/[<>&'"]/g, (k) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[k]);
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="vi-VN"><voice name="${giong}">${
    giong.startsWith("vi-VN-") ? anToan : `<lang xml:lang="vi-VN">${anToan}</lang>`}</voice></speak>`;
};
async function docAzure(chu) {
  const byte = await goiDocGiong("az", azApi("/v1"), {
    method: "POST",
    headers: { "Ocp-Apim-Subscription-Key": caiDat.dv.az.khoa, "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": "riff-24khz-16bit-mono-pcm" },
    body: ssmlViet(caiDat.dv.az.giong, chu),
  }, "byte");
  congKyTu("az", chu.length);
  return docWav(byte);
}

// ----- ElevenLabs -----
export const EL_API = "https://api.elevenlabs.io/v1";
const gioiTinh = (g) => (/^m/i.test(g || "") ? " · Nam" : /^f/i.test(g || "") ? " · Nữ" : "");
async function layGiongEl() {
  const dau = { headers: { "xi-api-key": caiDat.dv.el.khoa } };
  // Giọng trong tài khoản + giọng Việt được dùng nhiều nhất trong thư viện ElevenLabs
  const [j, tv] = await Promise.all([
    goiDocGiong("el", EL_API + "/voices", dau),
    goiDocGiong("el", EL_API + "/shared-voices?page_size=30&language=vi&sort=usage_character_count_1y", dau).catch((loi) => {
      nhat("Không tải được thư viện giọng ElevenLabs: " + loi.message);
      return {};
    }),
  ]);
  const laViet = (g) => /^vi|vietnam/i.test(g.labels?.language || "") || /vietnam/i.test(g.labels?.accent || "");
  const cuaToi = (j.voices || [])
    .sort((a, b) => laViet(b) - laViet(a) || a.name.localeCompare(b.name))
    .map((g) => ({ ten: g.voice_id, nhan: `${laViet(g) ? "🇻🇳 " : ""}${g.name}${gioiTinh(g.labels?.gender)}` }));
  const daCo = new Set(cuaToi.map((g) => g.ten));
  const thuVien = (tv.voices || [])
    .filter((g) => !daCo.has(g.voice_id))
    .map((g) => ({ ten: `tv:${g.public_owner_id}:${g.voice_id}`, nhan: `🇻🇳 Thư viện · ${g.name}${gioiTinh(g.gender)}` }));
  // Giọng Việt trong tài khoản lên đầu, rồi đến giọng thư viện hay nhất, cuối cùng giọng khác
  return [...cuaToi.filter((g) => g.nhan.startsWith("🇻🇳")), ...thuVien, ...cuaToi.filter((g) => !g.nhan.startsWith("🇻🇳"))];
}
// Giọng thư viện phải được thêm vào tài khoản trước khi đọc (làm 1 lần)
let dangThemGiongEl = null;
async function giongElDung() {
  const c = caiDat.dv.el;
  if (!c.giong.startsWith("tv:")) return c.giong;
  dangThemGiongEl ||= (async () => {
    const [, chu, id] = c.giong.split(":");
    const ten = (c.ds.find((g) => g.ten === c.giong)?.nhan || "PhaHa").replace(/^🇻🇳 Thư viện · /, "").replace(/ · (Nam|Nữ)$/, "");
    try {
      const j = await goiDocGiong("el", `${EL_API}/voices/add/${chu}/${id}`, {
        method: "POST",
        headers: { "xi-api-key": c.khoa, "Content-Type": "application/json" },
        body: JSON.stringify({ new_name: ten }),
      });
      const moi = j.voice_id || id;
      nhat(`Đã thêm giọng "${ten}" từ thư viện vào tài khoản ElevenLabs`);
      c.ds = c.ds.map((g) => (g.ten === c.giong ? { ten: moi, nhan: g.nhan.replace("Thư viện · ", "") } : g));
      c.giong = moi;
      luuCaiDat();
      return moi;
    } catch (loi) {
      // Không thêm được (hết chỗ lưu giọng…) → thử đọc thẳng bằng mã giọng thư viện
      nhat("Không thêm được giọng thư viện ElevenLabs (" + loi.message + ") → thử đọc thẳng");
      return id;
    } finally {
      dangThemGiongEl = null;
    }
  })();
  return dangThemGiongEl;
}
async function docEleven(chu) {
  const c = caiDat.dv.el;
  const giong = await giongElDung();
  const noiDung = { text: chu, model_id: c.mh };
  if (c.mh !== "eleven_v3") noiDung.language_code = "vi";
  const byte = await goiDocGiong("el", `${EL_API}/text-to-speech/${giong}?output_format=pcm_24000`, {
    method: "POST",
    headers: { "xi-api-key": c.khoa, "Content-Type": "application/json" },
    body: JSON.stringify(noiDung),
  }, "byte");
  congKyTu("el", Math.ceil(chu.length * (c.mh === "eleven_v3" ? 1 : 0.5)));
  const ban = byte.slice(0, byte.length & ~1);
  return { pcm: new Int16Array(ban.buffer), tanSo: 24000 };
}

// ----- Fish Audio (S2.1 Pro Free, miễn phí) – đi qua máy chủ PHAHA vì Fish chặn gọi thẳng từ trình duyệt -----
export const FISH_API = "https://api.fish.audio";
async function layGiongFish() {
  const lay = (sapXep) => goiDocGiong("fish", ...quaMayChu(`${FISH_API}/model?page_size=40&language=vi&sort_by=${sapXep}`, {
    headers: { Authorization: "Bearer " + caiDat.dv.fish.khoa },
  }));
  // Giọng Việt được dùng nhiều nhất + được thích nhiều nhất
  const [a, b] = await Promise.all([lay("task_count"), lay("score").catch(() => ({}))]);
  const daCo = new Set(), ds = [];
  for (const g of [...(a.items || []), ...(b.items || [])]) {
    if (daCo.has(g._id) || (g.languages?.length && !g.languages.includes("vi"))) continue;
    daCo.add(g._id);
    ds.push({ ten: g._id, nhan: `${g.title}${g.task_count ? ` · ${g.task_count.toLocaleString("vi-VN")} lượt dùng` : ""}`, dung: g.task_count || 0 });
  }
  return ds.sort((x, y) => y.dung - x.dung).map(({ ten, nhan }) => ({ ten, nhan }));
}
async function docFish(chu) {
  const byte = await goiDocGiong("fish", ...quaMayChu(`${FISH_API}/v1/tts`, {
    method: "POST",
    headers: { Authorization: "Bearer " + caiDat.dv.fish.khoa, "Content-Type": "application/json", model: "s2.1-pro-free" },
    body: JSON.stringify({ text: chu, reference_id: caiDat.dv.fish.giong, format: "wav", sample_rate: TAN_SO_DOC, normalize: true, latency: "normal" }),
  }), "byte");
  return docWav(byte);
}

// ----- Viettel AI (trả về MP3 ngay). Trình duyệt bị chặn gọi thẳng thì tự đi vòng qua máy chủ PHAHA -----
export const VT_API = "https://viettelai.vn/tts/speech_synthesis";
async function docViettel(chu) {
  const c = caiDat.dv.vt;
  for (let lan = 0; ; lan++) {
    const r = await duPhong.goi(VT_API, {
      method: "POST",
      headers: { "Content-Type": "application/json", accept: "*/*" },
      body: JSON.stringify({ text: chu, voice: c.giong, speed: 1, tts_return_option: 3, token: c.khoa, without_filter: false }),
    }, "Viettel AI");
    if (r.ok && !/json|text\/html/i.test(r.headers.get("content-type") || "")) {
      const b = new Uint8Array(await r.arrayBuffer());
      if (b.length > 500) { congKyTu("vt", chu.length); return { mau: await giaiMp3(b), tanSo: TAN_SO_DOC }; }
    }
    const t = await r.text().catch(() => "");
    let j = {};
    try { j = JSON.parse(t); } catch {}
    const tb = String(j.vi_message || j.en_message || j.message || j.msg || j.error || j.detail || t || r.statusText).slice(0, 200);
    nhat(`⚠️ Viettel AI: mã ${r.status} · ${tb || "(Viettel không ghi lý do)"}`);
    if ((r.status === 429 || r.status >= 500) && lan < 3) { await cho(3 * (lan + 1), "long"); continue; }
    throw Object.assign(new Error(tb || "Viettel AI không trả về giọng đọc"), {
      status: r.status, dv: "vt",
      hetLuot: r.status === 402 || /quota|limit|exceed|balance|credit|remaining|upgrade|hết|vượt|không đủ|hạn mức/i.test(tb),
    });
  }
}

// ----- FPT.AI: gửi chữ → FPT trả về địa chỉ file MP3, vài giây sau file mới có → chờ rồi tải về -----
export const FPT_API = "https://api.fpt.ai/hmi/tts/v5";
export const GIONG_FPT = { banmai: "Ban Mai", thuminh: "Thu Minh", leminh: "Lê Minh", myan: "Mỹ An", ngoclam: "Ngọc Lam", giahuy: "Gia Huy", lannhi: "Lan Nhi", linhsan: "Linh San", minhquang: "Minh Quang" };
async function docFpt(chu) {
  const c = caiDat.dv.fpt;
  if (chu.length < 3) chu = chu.padEnd(3, "."); // FPT cần ít nhất 3 ký tự
  let j = {};
  for (let lan = 0; ; lan++) {
    const r = await duPhong.goi(FPT_API, {
      method: "POST",
      headers: { "api-key": c.khoa, voice: c.giong, speed: "0", "Content-Type": "text/plain; charset=utf-8" },
      body: chu,
    }, "FPT.AI");
    const t = await r.text().catch(() => "");
    try { j = JSON.parse(t); } catch { j = { message: t }; }
    if (r.ok && j.async && !j.error) break;
    const tb = String(j.message || j.msg || j.error || t || r.statusText).slice(0, 200);
    nhat(`⚠️ FPT.AI: mã ${r.status} · ${tb}`);
    if ((r.status === 429 || r.status >= 500) && lan < 4) { await cho(3 * (lan + 1), "long"); continue; }
    throw Object.assign(new Error(tb), { status: r.status, dv: "fpt", hetLuot: r.status === 402 || /quota|limit|exceed|balance|credit|hết/i.test(tb) });
  }
  const bd = Date.now();
  for (let lan = 0; Date.now() - bd < 120000; lan++) {
    await new Promise((x) => setTimeout(x, lan ? 1500 : 1200));
    try {
      const r = await duPhong.goi(j.async, {}, "FPT.AI");
      if (r.ok) {
        const b = new Uint8Array(await r.arrayBuffer());
        if (b.length > 500) return { mau: await giaiMp3(b), tanSo: TAN_SO_DOC };
      }
    } catch {}
  }
  throw Object.assign(new Error("FPT.AI tạo giọng quá lâu (hơn 2 phút)"), { dv: "fpt" });
}

// ----- Microsoft Edge "Đọc to" (miễn phí, không cần mã) – máy chủ PHAHA đọc hộ, trả về MP3 -----
async function docEdge(chu) {
  const byte = await goiDocGiong("edge", mayChu() + "/ai/edge", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Ve": veDangNhap() },
    body: JSON.stringify({ text: chu, voice: caiDat.dv.edge.giong }),
  }, "byte");
  return { mau: await giaiMp3(byte), tanSo: TAN_SO_DOC };
}

// ----- Giọng máy: đọc ngay trên điện thoại (doc-may.js), miễn phí, không giới hạn -----
let thoDocMay = null, soYeuCauMay = 0;
const choDocMay = new Map();
// iPhone hay báo "Out of memory" khi vừa chạy xong các bước nặng (bộ nhớ của bước trước chưa kịp trả lại)
// → tắt bộ đọc, chờ vài giây cho máy dọn bộ nhớ rồi thử lại (tối đa 3 lần)
async function docMay(chu) {
  for (let lan = 0; ; lan++) {
    try {
      return await docMayMotLan(chu);
    } catch (loi) {
      if (lan >= 2 || !/out of memory|no available backend/i.test(loi.message)) throw loi;
      nhat(`Giọng máy thiếu bộ nhớ → chờ ${5 * (lan + 1)} giây cho điện thoại dọn bộ nhớ rồi thử lại (lần ${lan + 2})`);
      tatGiongMay();
      await new Promise((x) => setTimeout(x, 5000 * (lan + 1)));
    }
  }
}
function tatGiongMay() { thoDocMay?.terminate(); thoDocMay = null; }
function docMayMotLan(chu) {
  if (!thoDocMay) {
    thoDocMay = new Worker(new URL("./doc-may.js", import.meta.url));
    thoDocMay.onmessage = ({ data: d }) => {
      if (d.loai === "nhat") { nhat("Giọng máy: " + d.chu); ghiChu("long", "Giọng máy: " + d.chu); return; }
      const c = choDocMay.get(d.id);
      if (!c) return;
      choDocMay.delete(d.id);
      if (d.loi) c.hong(new Error("Giọng máy bị lỗi: " + d.loi));
      else c.xong({ pcm: d.pcm, tanSo: d.tanSo });
    };
    thoDocMay.onerror = (e) => {
      for (const c of choDocMay.values()) c.hong(new Error("Giọng máy bị lỗi: " + (e.message || "không tải được")));
      choDocMay.clear();
      thoDocMay = null;
    };
  }
  return new Promise((xong, hong) => {
    const id = ++soYeuCauMay;
    choDocMay.set(id, { xong, hong });
    thoDocMay.postMessage({ id, chu });
  });
}

// =====================================================
// DANH SÁCH DỊCH VỤ ĐỌC
// cungLuc = số câu gửi cùng lúc; mienPhi = mức miễn phí mỗi tháng (ký tự)
// =====================================================
export const DICH_VU = {
  el: { ten: "ElevenLabs", mienPhi: 10000, taiGiong: layGiongEl, doc: docEleven, cungLuc: 2 },
  gemini: { ten: "Gemini", doc: docGemini, cungLuc: 3 },
  fish: { ten: "Fish Audio", taiGiong: layGiongFish, doc: docFish, cungLuc: 2 },
  az: { ten: "Azure", mienPhi: 500000, taiGiong: layGiongAz, doc: docAzure, cungLuc: 3 },
  gc: { ten: "Google Cloud", mienPhi: 1000000, taiGiong: layGiongGc, doc: docGoogleCloud, cungLuc: 4 },
  edge: { ten: "Edge", doc: docEdge, cungLuc: 2 }, // gửi nhiều hơn Microsoft dễ chặn (lỗi 403)
  fpt: { ten: "FPT.AI", doc: docFpt, cungLuc: 4 },
  vt: { ten: "Viettel AI", doc: docViettel, cungLuc: 3 },
  may: { ten: "Giọng máy", doc: docMay, cungLuc: 1 },
};

// Tên giọng đang chọn của 1 dịch vụ (để ghi nhật ký / hiện trên màn hình)
export function tenGiong(dv) {
  if (dv === "gemini") return caiDat.giong;
  if (dv === "may") return "";
  if (dv === "fpt") return GIONG_FPT[caiDat.dv.fpt.giong] || caiDat.dv.fpt.giong;
  if (dv === "vt") return $("o-giong-vt")?.querySelector(`option[value="${caiDat.dv.vt.giong}"]`)?.textContent || caiDat.dv.vt.giong;
  const c = caiDat.dv[dv];
  return (c.ds?.find((g) => g.ten === c.giong)?.nhan || c.giong || "").replace(/^🇻🇳 |^🌐 /, "");
}

// Tải danh sách giọng; chưa chọn giọng thì lấy giọng hay nhất (đầu danh sách) làm mặc định
export async function taiDsGiong(dv) {
  const c = caiDat.dv[dv];
  if (dv !== "gc" && !c.khoa) throw new Error("Dán mã " + DICH_VU[dv].ten + " trước đã.");
  c.ds = await DICH_VU[dv].taiGiong();
  if (!c.ds.length) throw new Error(DICH_VU[dv].ten + " chưa có giọng nào dùng được.");
  if (!c.ds.some((g) => g.ten === c.giong)) c.giong = c.ds[0].ten;
  luuCaiDat();
}

// Dịch vụ đọc hết lượt tháng này (ElevenLabs…) → nhớ lại, lần sau bỏ qua luôn
export const dvHetThang = (dv) => docLuu("phaha-dv-het-thang")[dv] === thangNay();
function ghiDvHetThang(dv) {
  const d = docLuu("phaha-dv-het-thang");
  d[dv] = thangNay();
  ghiLuu("phaha-dv-het-thang", d);
}

// Dịch vụ đọc dùng được, theo đúng thứ tự ưu tiên; giọng máy luôn có, đứng cuối làm lớp dự phòng
export function dvDocDung(imLang) {
  const vao = coMayChu() && daDangNhap();
  const co = {
    el: () => !!caiDat.dv.el.khoa,
    gemini: () => !!(caiDat.khoa || caiDat.khoaDoc),
    fish: () => !!caiDat.dv.fish.khoa && vao,
    az: () => !!caiDat.dv.az.khoa,
    gc: () => !!(caiDat.dv.gc.giong || caiDat.dv.gc.khoa),
    edge: () => vao,
    fpt: () => !!caiDat.dv.fpt.khoa,
    vt: () => !!caiDat.dv.vt.khoa,
    may: () => true,
  };
  const ds = THU_TU.filter((dv) => (dv === "may" || caiDat.bat[dv]) && co[dv]());
  const conLai = ds.filter((dv) => !dvHetThang(dv));
  if (!imLang && conLai.length < ds.length) nhat(`Bỏ qua ${ds.filter(dvHetThang).map((dv) => DICH_VU[dv].ten).join(", ")} (đã hết lượt tháng này)`);
  return conLai.length ? conLai : ds;
}

// Đọc 1 câu → âm thanh 24.000 mẫu/giây đã cắt lặng. Giữ trong bộ nhớ để "Làm lại" khỏi đọc lại
const khoGiong = new Map(); // "dịch vụ|giọng|câu" → { mau, mh }
export async function docCau(chu, dv) {
  chu = chuanHoaDoc(chu);
  if (!chu) return new Float32Array(0);
  const c = caiDat.dv[dv] || {};
  const khoa = [dv, dv === "gemini" ? caiDat.giong : dv === "gc" ? giongGcLanNay || c.giong : c.giong || "", dv === "el" ? c.mh : "", chu].join("|");
  // Giọng Gemini đã đọc ở lần trước: chỉ dùng lại nếu cùng loại Gemini với cả video (giọng khỏi lệch)
  const daCo = khoGiong.get(khoa);
  if (daCo && (dv !== "gemini" || !moHinhDocDaChot() || daCo.mh === moHinhDocDaChot())) {
    if (dv === "gemini" && !moHinhDocDaChot()) chotMoHinhDoc(daCo.mh);
    return daCo.mau;
  }
  const kq = await DICH_VU[dv].doc(chu);
  let mau = kq.mau || Float32Array.from(kq.pcm, (v) => v / 32768);
  if (kq.tanSo !== TAN_SO_DOC) mau = doiTanSo(mau, kq.tanSo, TAN_SO_DOC);
  mau = lamGon(mau);
  khoGiong.set(khoa, { mau, mh: dv === "gemini" ? moHinhDocDaChot() : "" });
  return mau;
}

// Gemini: gộp các câu sát nhau (tối đa ~40 giây) vào 1 lần đọc: ít lượt hơn → đỡ phải chờ giới hạn mỗi phút và đỡ tốn lượt ngày.
// Các dịch vụ khác tính theo số chữ nên đọc từng câu cho khớp miệng.
function chiaNhom(cau, dv) {
  if (dv !== "gemini") return cau.map((c) => ({ start: c.start, end: c.end, vi: c.vi.trim() }));
  const nhom = [];
  for (const c of cau) {
    const cuoi = nhom[nhom.length - 1];
    if (cuoi && c.start - cuoi.end < 0.8 && c.end - cuoi.start <= 40) {
      cuoi.end = Math.max(cuoi.end, c.end);
      cuoi.vi += " " + c.vi.trim();
    } else {
      nhom.push({ start: c.start, end: c.end, vi: c.vi.trim() });
    }
  }
  return nhom;
}
// Câu có lời Việt đọc được (bỏ câu rỗng / chỉ có chữ Trung, ký hiệu – dịch vụ đọc sẽ báo lỗi nếu gửi chữ trống)
const cauDocDuoc = () => S.cacCau.filter((c) => chuanHoaDoc(c.vi));

// =====================================================
// LỒNG TIẾNG CẢ VIDEO → file WAV dài bằng video
// =====================================================
export async function longTieng() {
  try {
    return await longTiengThu();
  } finally {
    giongGcLanNay = null;
  }
}
async function longTiengThu() {
  let loiCuoi;
  const ds = dvDocDung();
  for (let i = 0; i < ds.length; i++) {
    const dv = ds[i], ke = DICH_VU[ds[i + 1]]?.ten;
    try {
      if (i > 0) ghiChu("long", `Chuyển sang đọc bằng ${DICH_VU[dv].ten}…`);
      // Có mã nhưng chưa chọn giọng → tự lấy giọng hay nhất làm mặc định
      if (CAC_DV.includes(dv) && !caiDat.dv[dv].giong) {
        await taiDsGiong(dv);
        nhat(`${DICH_VU[dv].ten}: chưa chọn giọng → tự chọn ${tenGiong(dv)}`);
      }
      // Gemini đọc bằng mã miễn phí: ~15 lượt/ngày → video dài sẽ hết lượt giữa chừng sau vài phút chờ.
      // Tính trước số lượt cần; không đủ lượt hôm nay thì bỏ qua luôn. Đủ lượt thì vẫn dùng (chậm hơn nhưng giọng tốt).
      if (dv === "gemini" && ke) {
        const can = chiaNhom(cauDocDuoc(), "gemini").length, con = conLuotGeminiDoc();
        if (con !== null && can > con) {
          nhat(`⏩ Bỏ qua Gemini: cần ~${can} lượt đọc, mã miễn phí chỉ còn ~${con} lượt hôm nay → đọc thẳng bằng ${ke}`);
          loiCuoi = new Error("HET_NGAY");
          continue;
        }
      }
      return await longTiengBang(dv);
    } catch (loi) {
      loiCuoi = loi;
      if (loi.hetLuot && dv === "el") ghiDvHetThang("el");
      if (ke) nhat(`↪️ Đọc bằng ${DICH_VU[dv].ten} không được (${loiDeHieu(loi).split("\n")[0]}) → đọc lại toàn bộ bằng ${ke}`);
    }
  }
  throw loiCuoi;
}

async function longTiengBang(dv) {
  if (dv === "gemini") chotMoHinhDoc(null); // mỗi lần lồng tiếng chốt lại 1 loại Gemini cho cả video
  const cau = chiaNhom(cauDocDuoc(), dv);
  const boQua = S.cacCau.length - cauDocDuoc().length;
  if (boQua) nhat(`⚠️ ${boQua}/${S.cacCau.length} câu không có lời Việt để đọc (chưa dịch được) – xem các dòng trống trong bảng lời thoại để điền`);
  const donVi = dv === "gemini" ? "lượt đọc" : "câu";
  giongGcLanNay = dv === "gc" ? chonGiongGc(cau.reduce((n, c) => n + c.vi.length, 0)) : null;
  if (dv === "may") await nhuongBoNhoChoGiongMay();
  const bd = Date.now();
  const cacGiong = await docTatCa(cau, dv, donVi);
  if (dv === "may") tatGiongMay(); // đọc xong → tắt bộ đọc để trả bộ nhớ cho bước xuất video
  nhat(`Đã đọc ${cau.length} ${donVi}, ${cau.reduce((n, c) => n + c.vi.length, 0)} ký tự bằng ${DICH_VU[dv].ten}${tenGiong(dv) ? " / " + tenGiong(dv) : ""} · ${((Date.now() - bd) / 1000).toFixed(1)} giây`);
  return taoWav(xepGiongVaoVideo(cau, cacGiong), TAN_SO_DOC);
}

// Giọng máy cần nhiều bộ nhớ lúc khởi động → chờ tách nhạc / chèn chữ đang chạy xong, tạm tắt bộ xử lý video
async function nhuongBoNhoChoGiongMay() {
  S.baoChonGiong("may");
  if (S.dangTachNhac || S.veDangChay) {
    ghiChu("long", "Chờ tách nhạc / chèn chữ xong rồi đọc bằng giọng máy (đỡ tràn bộ nhớ)…");
    await S.dangTachNhac?.catch(() => {});
    // chỉ chờ chèn chữ khi nó ĐANG chạy (chưa chạy thì nó sẽ đợi giọng máy đọc xong → chờ nhau mãi)
    if (S.veDangChay) await S.dangVeHinh;
  }
  await S.dangBatFf?.catch(() => {});
  if (ffDangBat()) { tatFfmpeg(); nhat("Tạm tắt bộ xử lý video để nhường bộ nhớ cho giọng máy"); }
}

// Đọc mọi câu, nhiều câu cùng lúc cho nhanh (ElevenLabs/Fish miễn phí chỉ cho 2 cùng lúc)
// Edge (miễn phí, không chính thức) thỉnh thoảng ngắt kết nối ở vài câu → bỏ trống vài câu đó
// thay vì đổi giọng cả video; lỗi quá nhiều câu thì mới chuyển dịch vụ khác
async function docTatCa(cau, dv, donVi) {
  const hang = cau.map((_, i) => i), cacGiong = new Array(cau.length);
  const loiEdge = [], toiDaLoiEdge = Math.max(3, Math.ceil(cau.length * 0.1));
  if (dv === "edge") edgeLoi = edgeXong = 0;
  let xong = 0, hong = false, edgeHongLienTiep = 0;
  await Promise.all(Array.from({ length: DICH_VU[dv].cungLuc }, async () => {
    while (hang.length && !hong) {
      const i = hang.shift();
      try {
        cacGiong[i] = await docCau(cau[i].vi, dv);
        if (dv !== "may") S.baoChonGiong("khac");
        edgeHongLienTiep = 0;
      } catch (loi) {
        // Edge hỏng 3 câu liền (hoặc ngay câu đầu tiên chưa đọc được câu nào) → Microsoft đang chặn, bỏ Edge luôn
        if (dv === "edge" && !loi.edgeYeu && (++edgeHongLienTiep >= 3 || (xong === 0 && edgeHongLienTiep >= 2)))
          loi = Object.assign(new Error(`Edge hỏng ${edgeHongLienTiep} câu liền`), { status: loi.status, dv, edgeYeu: true });
        if (dv === "edge" && !loi.edgeYeu && /đóng kết nối|không trả về âm thanh|quá lâu|Lỗi kết nối/.test(loi.message) && loiEdge.length < toiDaLoiEdge) {
          loiEdge.push(i);
          cacGiong[i] = new Float32Array(0);
          nhat(`⚠️ Edge không đọc được câu ${dongHo(cau[i].start)} «${cau[i].vi.slice(0, 60)}» → bỏ trống câu này (${loiEdge.length}/${toiDaLoiEdge} câu được phép bỏ)`);
          continue;
        }
        hong = true; // dừng các luồng khác, khỏi gửi thêm yêu cầu thừa
        throw loi;
      }
      ghiChu("long", `${++xong}/${cau.length} ${donVi} (${DICH_VU[dv].ten})`);
    }
  }));
  if (loiEdge.length) nhat(`⚠️ Edge bỏ trống ${loiEdge.length} câu (Microsoft ngắt kết nối) – xem các dòng ⚠️ ở trên; muốn đủ câu thì bấm “Làm lại lồng tiếng & xuất video”`);
  return cacGiong;
}

// Đặt từng câu vào đúng thời điểm. Câu Việt dài hơn chỗ trống thì đọc nhanh hơn (tối đa 1,6 lần);
// vẫn dài thì câu sau LÙI lại một chút thay vì đè lên nhau (2 giọng chồng nhau nghe như mất chữ).
// Đang bị trễ so với hình thì cho đọc nhanh hơn nữa (tối đa 1,9 lần) để đuổi kịp.
function xepGiongVaoVideo(cau, cacGiong) {
  const tong = new Float32Array(Math.ceil(S.thoiLuong * TAN_SO_DOC) + TAN_SO_DOC);
  let conTro = 0, soTre = 0, treMax = 0;
  cau.forEach((c, i) => {
    let mau = cacGiong[i];
    if (!mau.length) return;
    const batDau = Math.max(c.start, conTro + 0.05);
    const tre = batDau - c.start;
    const sau = cau[i + 1] ? cau[i + 1].start : S.thoiLuong;
    const choPhep = Math.max(c.end - batDau, sau - batDau - 0.08, 0.3);
    const dai = mau.length / TAN_SO_DOC;
    if (dai > choPhep * 1.02) mau = coGian(mau, Math.min(dai / choPhep, tre > 1 ? 1.9 : NHANH_TOI_DA));
    const viTri = Math.round(batDau * TAN_SO_DOC);
    for (let k = 0; k < mau.length && viTri + k < tong.length; k++) tong[viTri + k] += mau[k];
    conTro = batDau + mau.length / TAN_SO_DOC;
    if (tre > 0.3) { soTre++; treMax = Math.max(treMax, tre); }
  });
  if (soTre) nhat(`Lời Việt dài hơn lời gốc: ${soTre} câu phải lùi lại cho khỏi đè nhau (trễ nhiều nhất ${treMax.toFixed(1)} giây)`);
  return tong;
}
