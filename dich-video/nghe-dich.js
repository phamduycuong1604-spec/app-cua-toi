// =====================================================
// NGHE TIẾNG TRUNG & DỊCH SANG TIẾNG VIỆT
// - Chia âm thanh thành đoạn ~1,5 phút (cắt ở chỗ yên lặng), gửi 3 đoạn cùng lúc
// - Dịch bằng DeepSeek (Groq/Cloudflare nghe) hoặc Gemini (nghe + dịch 1 lần);
//   hỏng thì tự chuyển sang dịch vụ còn lại / dự phòng (du-phong.js)
// =====================================================
import { caiDat, nhat, cho, ghiChu, dongHo, demDung, vanTayMa, TAN_SO_NGHE, DOAN_NGHE } from "./nen.js";
import { taoDuPhong, chuaDich, loiDanThem } from "./du-phong.js";
import { goiGemini, layChu, maNghe } from "./gemini.js";
import { taoWav, sangBase64 } from "./am-thanh.js";
import { loiDeHieu } from "./loi.js";

export const duPhong = taoDuPhong({
  caiDat, nhat, cho,
  dem: (ten, n) => demDung(`${ten}:${vanTayMa(ten === "groq" ? caiDat.dp.groq : caiDat.dp.or)}`, n),
});

export const dungDeepSeek = () => caiDat.dichBang === "deepseek" && !!caiDat.dp.ds && duPhong.coDuPhong();
let geminiNghi = false; // Gemini đã hỏng trong lần chạy này → các đoạn sau đi thẳng dự phòng
let deepSeekNghi = false; // DeepSeek (hoặc bước nghe của nó) hỏng trong lần chạy này → các đoạn sau dùng Gemini
export function batDauLanMoiNghe() {
  geminiNghi = deepSeekNghi = false;
  duPhong.batDauLanMoi();
}

// pcm: Int16 16.000 mẫu/giây → [{start, end, zh, vi}] (giây tính từ đầu video), xếp theo thời gian
export async function ngheVaDich(pcm) {
  const moc = chiaDoan(pcm);
  const soDoan = moc.length - 1;
  const ketQua = [];
  let xong = 0;
  const batDau = Date.now();
  const baoTienDo = () => ghiChu("dich", `${soDoan > 1 ? `Xong ${xong}/${soDoan} đoạn · ` : "Đang nghe… "}${Math.round((Date.now() - batDau) / 1000)} giây`);
  baoTienDo();
  const dongHoCho = setInterval(baoTienDo, 1000);
  try {
    const hang = Array.from({ length: soDoan }, (_, d) => d);
    await Promise.all([0, 1, 2].map(async () => {
      while (hang.length) {
        const d = hang.shift();
        ketQua.push(...(await ngheMotDoan(pcm.subarray(moc[d], moc[d + 1]), moc[d] / TAN_SO_NGHE)));
        xong++;
      }
    }));
  } finally {
    clearInterval(dongHoCho);
  }
  return ketQua.sort((a, b) => a.start - b.start);
}

// Chia đoạn ~DOAN_NGHE giây, cắt ở chỗ yên lặng nhất trong 20 giây trước ranh giới để không cắt ngang câu nói
function chiaDoan(pcm) {
  const moc = [0];
  const moiDoan = DOAN_NGHE * TAN_SO_NGHE, khung = TAN_SO_NGHE / 10;
  while (pcm.length - moc[moc.length - 1] > moiDoan * 1.3) {
    const ranh = moc[moc.length - 1] + moiDoan;
    let tot = ranh, nhoNhat = Infinity;
    for (let a = ranh - 20 * TAN_SO_NGHE; a < ranh; a += khung) {
      let e = 0;
      for (let k = a; k < a + khung; k += 4) e += pcm[k] * pcm[k];
      if (e < nhoNhat) { nhoNhat = e; tot = a + khung / 2; }
    }
    moc.push(tot);
  }
  moc.push(pcm.length);
  return moc;
}

async function ngheMotDoan(mau, batDau) {
  const dai = mau.length / TAN_SO_NGHE;
  const wav = taoWav(mau, TAN_SO_NGHE);
  const duLieu = await sangBase64(wav);
  // Chọn dịch bằng DeepSeek: Groq/Cloudflare nghe → DeepSeek dịch; hỏng hết thì quay về Gemini
  if (dungDeepSeek() && !deepSeekNghi) {
    try {
      return await ngheDuPhong(wav, duLieu, dai, batDau, mau);
    } catch (loi) {
      if (!maNghe()) throw loi;
      deepSeekNghi = true;
      nhat(`↪️ Nghe/dịch bằng DeepSeek không được (${loi.message.split("\n")[0]}) → quay về Gemini`);
    }
  }
  // Gemini nghe trước; hết lượt/lỗi thì chuyển lần lượt sang Groq → Cloudflare → Azure → OpenRouter
  if (maNghe() && !geminiNghi) {
    try {
      return await ngheGemini(duLieu, dai, batDau);
    } catch (loi) {
      if (!duPhong.coDuPhong()) throw loi;
      geminiNghi = true;
      nhat(`↪️ Gemini không dùng được (${loiDeHieu(loi).split("\n")[0]}) → chuyển sang dịch vụ dự phòng`);
    }
  }
  return ngheDuPhong(wav, duLieu, dai, batDau, mau);
}

// Nghe bằng Groq/Cloudflare/Azure, dịch bằng DeepSeek/Groq/… (du-phong.js)
async function ngheDuPhong(wav, duLieu, dai, batDau, mau) {
  nhat(`Gửi đoạn ${dongHo(batDau)}–${dongHo(batDau + dai)} cho dịch vụ ${dungDeepSeek() && !deepSeekNghi ? "nghe + DeepSeek dịch" : "dự phòng"}`);
  const cau = await duPhong.ngheVaDich(wav, duLieu);
  if (mau) await ngheBu(mau, cau, batDau);
  const thieu = cau.filter((c) => !c.vi).length;
  if (thieu) nhat(`⚠️ ${thieu} câu chưa dịch được – vẫn giữ trong bảng lời thoại để bạn tự điền`);
  const ra = cau
    .filter((c) => c.vi || c.zh)
    .map((c) => {
      const s = Math.max(0, Math.min(c.start, dai)), e = Math.min(Math.max(c.end, s + 0.5), dai);
      return { start: +(batDau + s).toFixed(2), end: +(batDau + e).toFixed(2), zh: c.zh, vi: c.vi };
    });
  nhat(`Đoạn ${dongHo(batDau)}: được ${ra.length} câu (dịch bằng ${duPhong.dichBoi() || "dự phòng"})`);
  return ra;
}

// NGHE BÙ: bộ nghe (Whisper) hay "nhảy cóc" khi người nói nhanh, liền mạch trên nền nhạc.
// Tìm chỗ có tiếng to cỡ lời nói mà chưa có câu nào → gửi riêng chỗ đó nghe + dịch lại, rồi ghép vào.
async function ngheBu(mau, cau, batDau) {
  const o4 = Math.round(TAN_SO_NGHE / 4); // ô 0,25 giây
  const soO = Math.floor(mau.length / o4);
  if (soO < 8) return;
  const nl = new Float32Array(soO);
  for (let o = 0; o < soO; o++) {
    let e = 0;
    for (let k = o * o4; k < (o + 1) * o4; k += 2) e += mau[k] * mau[k];
    nl[o] = Math.sqrt(e / (o4 / 2));
  }
  const coCau = new Uint8Array(soO);
  for (const c of cau) for (let o = Math.max(0, Math.floor(c.start * 4) - 1); o <= Math.min(soO - 1, Math.ceil(c.end * 4)); o++) coCau[o] = 1;
  // mức to của lời nói = trung vị các ô đã có câu
  const noi = [...nl].filter((_, o) => coCau[o]).sort((a, b) => a - b);
  const mucNoi = noi.length ? noi[Math.floor(noi.length / 2)] : 0;
  if (!mucNoi) return;
  const khoang = [];
  for (let o = 0; o < soO; ) {
    if (coCau[o] || nl[o] < mucNoi * 0.5) { o++; continue; }
    let h = o;
    while (h < soO && !coCau[h] && nl[h] >= mucNoi * 0.35) h++;
    if (h - o >= 6) khoang.push([o / 4, h / 4]); // ít nhất 1,5 giây có tiếng mà chưa có câu
    o = h;
  }
  if (!khoang.length) return;
  const chon = khoang.sort((a, b) => b[1] - b[0] - (a[1] - a[0])).slice(0, 6);
  nhat(`🔎 Đoạn ${dongHo(batDau)}: thấy ${chon.length} chỗ có tiếng nói chưa được nghe (${chon.map(([a, b]) => `${dongHo(batDau + a)}–${dongHo(batDau + b)}`).join(", ")}) → nghe bù`);
  let them = 0;
  for (const [a, b] of chon) {
    const tu = Math.max(0, a - 0.4), den = Math.min(mau.length / TAN_SO_NGHE, b + 0.4);
    const doan = mau.subarray(Math.round(tu * TAN_SO_NGHE), Math.round(den * TAN_SO_NGHE));
    try {
      const w = taoWav(doan, TAN_SO_NGHE);
      for (const c of await duPhong.ngheVaDich(w, await sangBase64(w))) {
        const s = tu + c.start, e = tu + c.end;
        if (cau.some((x) => s < x.end - 0.2 && e > x.start + 0.2)) continue; // trùng câu đã có
        cau.push({ ...c, start: s, end: e });
        them++;
      }
    } catch (loi) {
      nhat("Nghe bù không được: " + loi.message.split("\n")[0]);
    }
  }
  cau.sort((x, y) => x.start - y.start);
  if (them) nhat(`🔎 Nghe bù thêm được ${them} câu`);
}

// Gemini nghe + dịch trong 1 lần gọi, trả về JSON
async function ngheGemini(duLieu, dai, batDau) {
  nhat(`Gửi đoạn ${dongHo(batDau)}–${dongHo(batDau + dai)} (${(duLieu.length / 1048576).toFixed(1)}MB) cho Gemini nghe`);
  const tl = await goiGemini("nghe", {
    contents: [{ parts: [{ inlineData: { mimeType: "audio/wav", data: duLieu } }, { text: loiNhacDich(dai) }] }],
    generationConfig: {
      temperature: 0.3,
      responseMimeType: "application/json",
      responseSchema: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: { start: { type: "NUMBER" }, end: { type: "NUMBER" }, zh: { type: "STRING" }, vi: { type: "STRING" } },
          required: ["start", "end", "zh", "vi"],
        },
      },
    },
  });
  let ds;
  try { ds = JSON.parse(layChu(tl)); } catch { throw new Error("Gemini trả lời không đúng dạng, bấm Bắt đầu để thử lại."); }
  const ra = [];
  for (const c of Array.isArray(ds) ? ds : []) {
    let s = Number(c.start), e = Number(c.end);
    if (!isFinite(s) || !String(c.vi || "").trim()) continue;
    s = Math.max(0, Math.min(s, dai));
    if (!isFinite(e) || e <= s) e = s + 2;
    e = Math.min(e, dai);
    ra.push({ start: +(batDau + s).toFixed(2), end: +(batDau + e).toFixed(2), zh: String(c.zh || ""), vi: String(c.vi).trim() });
  }
  nhat(`Đoạn ${dongHo(batDau)}: được ${ra.length} câu`);
  // Câu Gemini để nguyên chữ Trung → nhờ dịch vụ dịch (DeepSeek/Groq/…) dịch lại
  const conTrung = ra.filter((c) => c.zh && chuaDich(c.vi));
  if (conTrung.length) {
    nhat(`Dịch bù ${conTrung.length} câu Gemini chưa dịch (còn chữ Trung)`);
    try {
      const vi = await duPhong.dichBu(conTrung);
      conTrung.forEach((c, k) => (c.vi = chuaDich(vi[k]) ? "" : vi[k]));
    } catch (loi) {
      nhat("Dịch bù không được: " + loi.message.split("\n")[0]);
      conTrung.forEach((c) => (c.vi = ""));
    }
  }
  return ra;
}

function loiNhacDich(dai) {
  const them = loiDanThem(caiDat); // chuyên môn kênh, quy tắc riêng, chủ đề, thuật ngữ
  return `Đây là ${dai.toFixed(1)} giây âm thanh lấy từ một video tiếng Trung.
Hãy nghe kỹ TOÀN BỘ phần LỜI NÓI từ đầu đến cuối (bỏ qua nhạc nền, tiếng động) và chia thành từng câu ngắn, mỗi câu tối đa khoảng 8 giây.
KHÔNG được bỏ sót câu nào – kể cả câu nói nhỏ, nói nhanh, nói chen, lời thuyết minh trên nền nhạc, lời ở đầu và cuối đoạn.
Với mỗi câu trả về:
- start, end: thời điểm bắt đầu và kết thúc, tính bằng GIÂY (số thập phân) kể từ đầu đoạn âm thanh này, thật chính xác.
- zh: lời gốc tiếng Trung (chữ Hán).
- vi: bản dịch tiếng Việt tự nhiên như người Việt nói, xưng hô hợp ngữ cảnh. Dịch ĐẦY ĐỦ Ý: không bỏ chi tiết, số liệu, tên gọi, nguyên liệu, bước làm, mẹo, cảm xúc. Diễn đạt gọn để đọc vừa thời lượng câu (khoảng 4–5 âm tiết mỗi giây) – chỉ rút gọn CÁCH NÓI, không bỏ Ý. Không thêm chú thích.
  Viết sao cho máy đọc tiếng Việt đọc đúng: số viết bằng chữ (vd "hai trăm năm mươi gam"), không dùng ký hiệu (%, +, &, /, ~, #), không để chữ Trung hay chữ viết tắt tiếng Anh; tên riêng/thương hiệu nước ngoài thì dịch nghĩa hoặc viết theo cách đọc tiếng Việt (vd "DIY" → "tự làm").
Nếu không có lời nói thì trả về mảng rỗng [].` + (them ? "\n\n" + them : "");
}
