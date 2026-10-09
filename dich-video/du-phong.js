// =====================================================
// DỰ PHÒNG KHI GEMINI HẾT LƯỢT: nghe tiếng Trung + dịch sang tiếng Việt
// bằng các dịch vụ miễn phí khác.
//   Nghe : Groq (Whisper) → Cloudflare (Whisper, qua máy chủ PHAHA) → Azure (Speech)
//   Dịch : Groq (Qwen/Llama) → Cloudflare → OpenRouter (mô hình miễn phí) → Azure Translator
// =====================================================

const GROQ = "https://api.groq.com/openai/v1";
const OPENROUTER = "https://openrouter.ai/api/v1";
const DEEPSEEK = "https://api.deepseek.com";
// Câu "ảo" Whisper hay tự bịa ra ở đoạn chỉ có nhạc
const CAU_AO = /请不吝|点赞|點贊|订阅|訂閱|打赏|打賞|字幕由|字幕提供|字幕志愿者|明镜与点点|Amara|中文字幕|感谢观看|感謝觀看/;

// Câu "dịch" mà vẫn còn chữ Trung (AI chép lại nguyên văn) = chưa dịch
export const chuaDich = (x) => !x || (String(x).match(/[\u3400-\u9fff]/g) || []).length >= 2;

// AI dịch xong nhưng chèn kèm chữ Trung (vd "màu nghệ (姜黄色)") → bỏ phần chữ Trung, giữ lời Việt.
// Chỉ bỏ khi lời Việt đã đủ dài; còn lại (chép nguyên câu gốc) giữ nguyên để bị coi là chưa dịch.
export function boChuTrung(x) {
  let s = String(x ?? "").replace(/\s*[（(][^()（）]*[\u3400-\u9fff][^()（）]*[)）]/g, "").trim();
  const han = (s.match(/[\u3400-\u9fff]/g) || []).length, viet = (s.match(/[a-zà-ỹđ]/gi) || []).length;
  if (han >= 2 && viet >= 8 && viet >= han * 3) s = s.replace(/[\u3400-\u9fff\u3000-\u303f\uff01-\uff0f\uff1a-\uff20]+/g, " ").replace(/\s+([,.!?])/g, "$1").replace(/\s{2,}/g, " ").trim();
  return s;
}

export function taoDuPhong({ caiDat, nhat, cho, dem = () => {} }) {
  const mayChu = typeof DIA_CHI_MAY_CHU === "string" ? DIA_CHI_MAY_CHU : "";
  const ve = () => { try { return localStorage.getItem("ve-dang-nhap") || ""; } catch { return ""; } };
  const coMayChu = () => !!(mayChu && ve() && caiDat.dp.cf);
  const quaMayChu = new Set(); // các tên miền phải đi vòng qua máy chủ PHAHA (trình duyệt bị chặn)

  // Gọi một dịch vụ bên ngoài; trình duyệt bị chặn thì đi vòng qua máy chủ PHAHA
  async function goi(url, tuyChon, ten) {
    const host = new URL(url).hostname;
    const quaMC = async () => {
      if (!mayChu || !ve()) throw new Error(`${ten}: trình duyệt bị chặn gọi thẳng, cần đăng nhập app PHAHA để đi vòng qua máy chủ`);
      return fetch(mayChu + "/ai/chuyen", { ...tuyChon, headers: { ...tuyChon.headers, "X-Dich-Den": url, "X-Ve": ve() } });
    };
    let r;
    if (quaMayChu.has(host)) r = await quaMC();
    else {
      try {
        r = await fetch(url, tuyChon);
      } catch (loi) {
        nhat(`${ten}: không gọi thẳng được (${loi.message}), thử đi vòng qua máy chủ PHAHA`);
        quaMayChu.add(host);
        r = await quaMC();
      }
    }
    return r;
  }

  async function docLoi(r, ten) {
    const chu = await r.text().catch(() => "");
    let j = {};
    try { j = JSON.parse(chu); } catch {}
    const tb = j.error?.message || j.error?.code || j.loi || j.message || (typeof j.error === "string" ? j.error : "") || chu.slice(0, 200) || r.statusText;
    return Object.assign(new Error(`${ten}: mã ${r.status} · ${String(tb).slice(0, 200)}`), {
      status: r.status,
      hetLuot: r.status === 429 || r.status === 402 || /quota|limit|rate/i.test(tb),
      choGiay: Number(r.headers.get("retry-after")) || 0,
    });
  }

  // Thử lại khi bị giới hạn theo phút (chờ ngắn), còn lại báo lỗi để chuyển dịch vụ
  async function goiCoThuLai(url, tuyChonFn, ten) {
    for (let lan = 0; ; lan++) {
      const r = await goi(url, tuyChonFn(), ten);
      if (r.ok) return r;
      const loi = await docLoi(r, ten);
      nhat("⚠️ " + loi.message);
      if (r.status === 429 && loi.choGiay > 0 && loi.choGiay <= 30 && lan < 2) { await cho(loi.choGiay + 1, "dich"); continue; }
      if (r.status >= 500 && r.status !== 501 && lan < 1) { await cho(3); continue; }
      throw loi;
    }
  }

  // ---------- NGHE ----------
  const NGHE = {
    groq: {
      ten: "Groq",
      co: () => !!caiDat.dp.groq,
      async chay(wav) {
        let loiCuoi;
        for (const mh of ["whisper-large-v3", "whisper-large-v3-turbo"]) {
          try {
            const r = await goiCoThuLai(`${GROQ}/audio/transcriptions`, () => {
              const f = new FormData();
              f.append("file", new Blob([wav], { type: "audio/wav" }), "doan.wav");
              f.append("model", mh);
              f.append("language", "zh");
              f.append("response_format", "verbose_json");
              f.append("temperature", "0");
              return { method: "POST", headers: { Authorization: "Bearer " + caiDat.dp.groq }, body: f };
            }, "Groq Whisper");
            const j = await r.json();
            dem("groq", Math.round((wav.length - 44) / 32000)); // giây âm thanh đã gửi (16kHz, 1 kênh)
            return (j.segments || [])
              .filter((s) => !(s.no_speech_prob > 0.85 && s.avg_logprob < -1)) // chỉ bỏ đoạn gần như chắc chắn là tiếng ồn
              .map((s) => ({ start: s.start, end: s.end, zh: String(s.text || "").trim() }));
          } catch (loi) {
            loiCuoi = loi;
            if (loi.status !== 404 && !/model/i.test(loi.message)) throw loi;
          }
        }
        throw loiCuoi;
      },
    },
    cloudflare: {
      ten: "Cloudflare",
      co: coMayChu,
      async chay(wav, b64) {
        const r = await fetch(mayChu + "/ai/nghe", { method: "POST", headers: { "Content-Type": "text/plain", "X-Ve": ve() }, body: b64 });
        if (!r.ok) throw await docLoi(r, "Cloudflare Whisper");
        const j = await r.json();
        return (j.segments || []).map((s) => ({ start: s.start, end: s.end, zh: String(s.text || "").trim() }));
      },
    },
    azure: {
      ten: "Azure",
      co: () => !!(caiDat.dv.az.khoa && caiDat.dp.azNghe),
      async chay(wav) {
        const vung = caiDat.dv.az.vung || "southeastasia";
        const r = await goiCoThuLai(`https://${vung}.api.cognitive.microsoft.com/speechtotext/transcriptions:transcribe?api-version=2024-11-15`, () => {
          const f = new FormData();
          f.append("audio", new Blob([wav], { type: "audio/wav" }), "doan.wav");
          f.append("definition", JSON.stringify({ locales: ["zh-CN"] }));
          return { method: "POST", headers: { "Ocp-Apim-Subscription-Key": caiDat.dv.az.khoa }, body: f };
        }, "Azure nghe");
        const j = await r.json();
        return (j.phrases || []).map((p) => ({
          start: p.offsetMilliseconds / 1000,
          end: (p.offsetMilliseconds + p.durationMilliseconds) / 1000,
          zh: String(p.text || "").trim(),
        }));
      },
    },
  };

  // ---------- DỊCH ----------
  let lanTraLoiCuoi = ""; // câu trả lời thô gần nhất của AI dịch – ghi vào nhật ký khi dịch hỏng để biết vì sao
  function loiNhac(cau) {
    const ds = cau.map((c, i) => `${i + 1}. (${(c.end - c.start).toFixed(1)}s) ${c.zh}`).join("\n");
    return [
      {
        role: "system",
        content: "Bạn là biên dịch viên lồng tiếng phim/video từ tiếng Trung sang tiếng Việt. Dịch tự nhiên như người Việt nói, xưng hô hợp ngữ cảnh. Dịch ĐẦY ĐỦ Ý từng câu: không bỏ chi tiết, số liệu, tên gọi, nguyên liệu, bước làm, mẹo, cảm xúc. Diễn đạt gọn để đọc vừa thời lượng ghi trong ngoặc (khoảng 4–5 âm tiết mỗi giây) – chỉ rút gọn CÁCH NÓI, không bỏ Ý. Mỗi câu gốc phải có đúng 1 câu dịch, không gộp, không bỏ câu nào. Không thêm chú thích, không giải thích. Viết sao cho máy đọc tiếng Việt đọc đúng: số viết bằng chữ, không dùng ký hiệu (%, +, &, /, ~, #), không để chữ Trung hay chữ viết tắt tiếng Anh; tên riêng/thương hiệu nước ngoài thì dịch nghĩa hoặc viết theo cách đọc tiếng Việt (vd DIY → tự làm).",
      },
      {
        role: "user",
        content: `Dịch từng câu sau. Trả về DUY NHẤT một JSON dạng {"1": "bản dịch câu 1", "2": "..."} đủ ${cau.length} câu, đúng số thứ tự.\n\n${ds}`,
      },
    ];
  }
  // Một câu trả về có thể là chuỗi, hoặc object/mảng chứa cả câu gốc lẫn bản dịch
  // (vd {"zh": "...", "vi": "..."}, ["原文", "bản dịch"]) → lấy chuỗi giống tiếng Việt nhất, không lấy nhầm câu gốc
  function layLoiViet(x) {
    if (x == null) return "";
    if (typeof x !== "object") return String(x);
    const uuTien = x.vi ?? x.vietnamese ?? x.translation ?? x.dich ?? x.ban_dich;
    if (typeof uuTien === "string" && !chuaDich(uuTien)) return uuTien;
    const cacChuoi = [];
    const gom = (v) => (typeof v === "string" ? cacChuoi.push(v) : v && typeof v === "object" && Object.values(v).forEach(gom));
    gom(x);
    const diem = (t) => (t.match(/[a-zà-ỹđ]/gi) || []).length - 5 * (t.match(/[\u3400-\u9fff]/g) || []).length;
    return cacChuoi.sort((m, n) => diem(n) - diem(m))[0] || "";
  }
  function docKetQuaDich(chu, so) {
    lanTraLoiCuoi = String(chu || "");
    chu = String(chu || "").replace(/<think>[\s\S]*?<\/think>/g, "");
    // Chấp nhận cả {"1": "...", "2": "..."}, ["...", "..."] và {"vi": ["...", ...]}
    const viTriObj = chu.indexOf("{"), viTriMang = chu.indexOf("[");
    const laMang = viTriMang >= 0 && (viTriObj < 0 || viTriMang < viTriObj);
    const a = laMang ? viTriMang : viTriObj, b = chu.lastIndexOf(laMang ? "]" : "}");
    if (a < 0 || b < a) throw new Error("trả lời không đúng dạng");
    let j = JSON.parse(chu.slice(a, b + 1));
    // Bọc thêm 1 lớp, vd {"translations": {...}} hoặc {"translations": [...]}
    for (let lop = 0; lop < 3 && j && typeof j === "object" && !Array.isArray(j) && !("1" in j); lop++) {
      const trong = Object.values(j).find((v) => v && typeof v === "object");
      if (!trong) break;
      j = trong;
    }
    // Mảng các object có số thứ tự riêng, vd [{"id": 3, "vi": "..."}] → xếp theo số thứ tự
    if (Array.isArray(j) && j.every((x) => x && typeof x === "object" && !Array.isArray(x) && Number.isInteger(+(x.id ?? x.so ?? x.index ?? x.stt ?? x.n)))) {
      const theoSo = {};
      for (const x of j) theoSo[+(x.id ?? x.so ?? x.index ?? x.stt ?? x.n)] = x;
      if (Object.keys(theoSo).length === j.length && theoSo[1]) j = theoSo;
    }
    const ra = [];
    for (let i = 1; i <= so; i++) {
      const x = Array.isArray(j) ? j[i - 1] : j[i] ?? j[String(i)];
      ra.push(boChuTrung(layLoiViet(x)));
    }
    const thieu = ra.filter((x) => !x).length;
    if (thieu > Math.max(1, so * 0.2)) throw new Error(`dịch thiếu ${thieu}/${so} câu`);
    return ra;
  }
  async function chatOpenAI(url, khoa, cacMoHinh, cau, ten, them = {}) {
    let loiCuoi;
    for (const mh of cacMoHinh) {
      try {
        const r = await goiCoThuLai(url, () => ({
          method: "POST",
          headers: { Authorization: "Bearer " + khoa, "Content-Type": "application/json", ...them.headers },
          body: JSON.stringify({ model: mh, messages: loiNhac(cau), temperature: 0.3, ...(them.body?.(mh) || {}) }),
        }), `${ten} (${mh})`);
        const j = await r.json();
        if (url.startsWith(OPENROUTER)) dem("or", 1);
        return docKetQuaDich(j.choices?.[0]?.message?.content, cau.length);
      } catch (loi) {
        loiCuoi = loi;
        if (loi.hetLuot && !/model/i.test(loi.message)) throw loi;
        nhat(`${ten}: ${mh} không dùng được (${loi.message}), thử mô hình khác`);
      }
    }
    throw loiCuoi;
  }
  let dsOpenRouter = null;
  async function moHinhOpenRouter() {
    if (dsOpenRouter) return dsOpenRouter;
    try {
      const r = await goi(`${OPENROUTER}/models`, { headers: { Authorization: "Bearer " + caiDat.dp.or } }, "OpenRouter");
      const j = await r.json();
      const ten = (j.data || []).map((m) => m.id).filter((id) => id.endsWith(":free"));
      const diem = (id) => (/deepseek/.test(id) ? 0 : /qwen/.test(id) ? 1 : /llama-3\.3|gemma|mistral/.test(id) ? 2 : 3);
      dsOpenRouter = ten.sort((a, b) => diem(a) - diem(b)).slice(0, 4);
    } catch {
      dsOpenRouter = [];
    }
    if (!dsOpenRouter.length) dsOpenRouter = ["deepseek/deepseek-chat-v3-0324:free", "qwen/qwen3-235b-a22b:free"];
    return dsOpenRouter;
  }

  const DICH = {
    deepseek: {
      ten: "DeepSeek",
      co: () => !!caiDat.dp.ds && caiDat.dichBang === "deepseek", // tắt công tắc = không dùng DeepSeek
      chay: (cau) => chatOpenAI(`${DEEPSEEK}/chat/completions`, caiDat.dp.ds, ["deepseek-chat"], cau, "DeepSeek dịch", {
        body: () => ({ response_format: { type: "json_object" } }),
      }),
    },
    groq: {
      ten: "Groq",
      co: () => !!caiDat.dp.groq,
      chay: (cau) => chatOpenAI(`${GROQ}/chat/completions`, caiDat.dp.groq, ["qwen/qwen3-32b", "llama-3.3-70b-versatile"], cau, "Groq dịch", {
        body: (mh) => (/qwen3/.test(mh) ? { reasoning_effort: "none" } : {}),
      }),
    },
    cloudflare: {
      ten: "Cloudflare",
      co: coMayChu,
      async chay(cau) {
        const r = await fetch(mayChu + "/ai/dich", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Ve": ve() },
          body: JSON.stringify({ messages: loiNhac(cau) }),
        });
        if (!r.ok) throw await docLoi(r, "Cloudflare dịch");
        return docKetQuaDich((await r.json()).text, cau.length);
      },
    },
    openrouter: {
      ten: "OpenRouter",
      co: () => !!caiDat.dp.or,
      chay: async (cau) => chatOpenAI(`${OPENROUTER}/chat/completions`, caiDat.dp.or, await moHinhOpenRouter(), cau, "OpenRouter", {
        headers: { "HTTP-Referer": "https://phamduycuong1604-spec.github.io/app-cua-toi/", "X-Title": "PhaHa" },
      }),
    },
    azure: {
      ten: "Azure Translator",
      co: () => !!caiDat.dp.azDich,
      async chay(cau) {
        const r = await goiCoThuLai("https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=zh-Hans&to=vi", () => ({
          method: "POST",
          headers: {
            "Ocp-Apim-Subscription-Key": caiDat.dp.azDich,
            "Ocp-Apim-Subscription-Region": caiDat.dp.azDichVung || caiDat.dv.az.vung || "southeastasia",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(cau.map((c) => ({ Text: c.zh }))),
        }), "Azure Translator");
        const j = await r.json();
        return j.map((x) => String(x.translations?.[0]?.text || "").trim());
      },
    },
  };

  const hong = new Set(); // dịch vụ đã hỏng/hết lượt trong lần chạy này
  async function thuLanLuot(bang, thuTu, viec, lam) {
    let loiCuoi = null;
    for (const k of thuTu) {
      const n = bang[k];
      if (!n.co() || hong.has(viec + k)) continue;
      const bd = Date.now();
      try {
        const kq = await lam(n);
        nhat(`${n.ten} (${viec}): xong sau ${((Date.now() - bd) / 1000).toFixed(1)} giây`);
        return kq;
      } catch (loi) {
        loiCuoi = loi;
        hong.add(viec + k);
        nhat(`↪️ ${n.ten} (${viec}) không dùng được: ${loi.message}`);
      }
    }
    if (!loiCuoi) throw new Error(`Chưa cài dịch vụ dự phòng nào để ${viec}. Mở ⚙️ Cài đặt → 🔁 Dự phòng khi Gemini hết lượt, thêm mã Groq (miễn phí).`);
    throw new Error(`Gemini và mọi dịch vụ dự phòng đều không ${viec} được (hết lượt hoặc lỗi).\nCách xử lý: chờ đến mai, hoặc thêm dịch vụ khác trong ⚙️ Cài đặt → 🔁 Dự phòng.\nLỗi cuối: ${loiCuoi.message}`);
  }

  // Dịch bù thật kỹ: dịch vụ đầu chưa dịch được câu nào thì thử dịch vụ kế tiếp,
  // cuối cùng chia nhóm nhỏ 5 câu (AI ít bị "chép lại nguyên văn" hơn khi danh sách ngắn)
  const THU_TU_DICH = ["deepseek", "groq", "cloudflare", "openrouter", "azure"];
  async function dichBuKy(cau) {
    const vi = new Array(cau.length).fill("");
    const conLai = () => cau.map((c, k) => k).filter((k) => chuaDich(vi[k]));
    let viDu = null, loiCuoi = null, daThu = 0;
    const thu = async (n, cacSo) => {
      const bd = Date.now();
      const bu = await n.chay(cacSo.map((k) => cau[k]));
      daThu++;
      cacSo.forEach((k, j) => {
        if (!chuaDich(bu[j])) vi[k] = bu[j];
        else if (!viDu) viDu = { zh: cau[k].zh, ra: String(bu[j] || "(trống)"), tho: lanTraLoiCuoi };
      });
      nhat(`${n.ten} (dịch bù): ${cacSo.length - cacSo.filter((k) => chuaDich(vi[k])).length}/${cacSo.length} câu được dịch · ${((Date.now() - bd) / 1000).toFixed(1)} giây`);
    };
    for (const k of THU_TU_DICH) {
      const n = DICH[k];
      if (!conLai().length) break;
      if (!n.co() || hong.has("dịch bù" + k)) continue;
      try {
        await thu(n, conLai());
        // còn sót → chia nhóm 5 câu, dịch lại bằng chính dịch vụ này
        for (let lan = 0; lan < 2 && conLai().length; lan++) {
          const sot = conLai();
          for (let i = 0; i < sot.length; i += 5) await thu(n, sot.slice(i, i + 5));
        }
      } catch (loi) {
        loiCuoi = loi;
        if (loi.hetLuot || /401|403|402/.test(String(loi.status))) hong.add("dịch bù" + k);
        nhat(`↪️ ${n.ten} (dịch bù) không dùng được: ${loi.message.split("\n")[0]}`);
      }
    }
    if (!daThu && loiCuoi) throw loiCuoi;
    if (viDu && conLai().length) nhat(`Ví dụ câu AI trả về vẫn chưa phải tiếng Việt: «${viDu.zh}» → «${viDu.ra.slice(0, 80)}» · AI trả lời: ${viDu.tho.replace(/\s+/g, " ").slice(0, 200)}`);
    return vi;
  }

  return {
    goi, // gọi dịch vụ ngoài (tự đi vòng qua máy chủ PHAHA khi bị chặn) – dùng cho nút Kiểm tra mã
    // Có dịch vụ dự phòng nào dùng được không
    coDuPhong: () => Object.values(NGHE).some((n) => n.co()) && Object.values(DICH).some((n) => n.co()),
    batDauLanMoi: () => hong.clear(),
    // Dịch lại những câu chưa dịch được (vd Gemini trả về còn chữ Trung) → mảng lời Việt
    dichBu: dichBuKy,
    // Nghe 1 đoạn âm thanh + dịch → [{start, end, zh, vi}] (giây, tính từ đầu đoạn)
    async ngheVaDich(wav, b64) {
      let cau = await thuLanLuot(NGHE, ["groq", "cloudflare", "azure"], "nghe", (n) => n.chay(wav, b64));
      cau = cau.filter((c) => c.zh && !CAU_AO.test(c.zh) && c.end > c.start);
      if (!cau.length) return [];
      // Dịch từng nhóm tối đa 40 câu
      const ra = [];
      for (let i = 0; i < cau.length; i += 40) {
        const nhom = cau.slice(i, i + 40);
        const vi = await thuLanLuot(DICH, THU_TU_DICH, "dịch", (n) => n.chay(nhom));
        // Câu nào AI bỏ sót → dịch bù riêng những câu đó (không lặng lẽ bỏ qua)
        const sot = nhom.map((c, k) => k).filter((k) => chuaDich(vi[k]));
        if (sot.length) {
          nhat(`Dịch bù ${sot.length} câu bị sót hoặc còn chữ Trung`);
          try {
            const bu = await dichBuKy(sot.map((k) => nhom[k]));
            sot.forEach((k, j) => (vi[k] = chuaDich(bu[j]) ? "" : bu[j]));
          } catch (loi) {
            nhat("Dịch bù không được: " + loi.message.split("\n")[0]);
          }
        }
        nhom.forEach((c, k) => ra.push({ ...c, vi: vi[k] || "" }));
      }
      return ra;
    },
  };
}
