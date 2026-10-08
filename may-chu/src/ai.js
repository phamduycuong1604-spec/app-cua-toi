// =====================================================
// AI DỊCH VIDEO (cho trang dich-video/ của PhaHa)
// Chỉ người đã đăng nhập app PHAHA mới dùng được (vé gửi trong header X-Ve).
//  /ai/nghe   : nghe tiếng Trung bằng Whisper của Cloudflare (miễn phí 10.000 "neuron"/ngày)
//  /ai/dich   : dịch chữ bằng mô hình ngôn ngữ của Cloudflare
//  /ai/edge   : đọc tiếng Việt bằng giọng "Đọc to" của Edge (miễn phí, trả về MP3)
//  /ai/chuyen : chuyển tiếp yêu cầu tới Groq / OpenRouter / Azure khi trình duyệt
//               không gọi thẳng được (bị chặn CORS)
// =====================================================
import { xacThuc } from "./tai-khoan.js";
import { docEdge } from "./edge-tts.js";

const MO_HINH_NGHE = "@cf/openai/whisper-large-v3-turbo";
const MO_HINH_DICH = ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/qwen/qwen3-30b-a3b-fp8"];
const DUOC_CHUYEN = [
  /^api\.groq\.com$/,
  /^openrouter\.ai$/,
  /^api\.cognitive\.microsofttranslator\.com$/,
  /^[a-z0-9]+\.api\.cognitive\.microsoft\.com$/,
  /^api\.fish\.audio$/,
  /^api\.deepseek\.com$/,
  /^api\.fpt\.ai$/,
  /^viettelai\.vn$/,
  /^file\d*\.fpt\.ai$/,
];

export async function xuLyAi(yeuCau, env, duongDan, traLoi) {
  if (!duongDan.startsWith("/ai/")) return null;
  try {
    const ve = yeuCau.headers.get("X-Ve") || "";
    await xacThuc(new Request(yeuCau.url, { headers: { Authorization: "Bearer " + ve } }), env);
  } catch {
    return traLoi({ loi: "Cần đăng nhập app PHAHA để dùng máy chủ" }, 401);
  }

  if (duongDan === "/ai/nghe" && yeuCau.method === "POST") {
    if (!env.AI) return traLoi({ loi: "Máy chủ chưa bật Workers AI" }, 501);
    // thân yêu cầu là chữ base64 của file WAV (gửi sẵn base64 để máy chủ đỡ tốn sức)
    const kq = await env.AI.run(MO_HINH_NGHE, { audio: await yeuCau.text(), language: "zh", vad_filter: true });
    return traLoi({ segments: kq.segments || [], text: kq.text || "" });
  }

  if (duongDan === "/ai/dich" && yeuCau.method === "POST") {
    if (!env.AI) return traLoi({ loi: "Máy chủ chưa bật Workers AI" }, 501);
    const { messages } = await yeuCau.json();
    let loiCuoi;
    for (const mh of MO_HINH_DICH) {
      try {
        const kq = await env.AI.run(mh, { messages, max_tokens: 4096, temperature: 0.3 });
        const chu = typeof kq.response === "string" ? kq.response : JSON.stringify(kq.response ?? kq);
        return traLoi({ text: chu, model: mh });
      } catch (loi) {
        loiCuoi = loi;
      }
    }
    return traLoi({ loi: String(loiCuoi?.message || loiCuoi) }, 502);
  }

  if (duongDan === "/ai/edge" && yeuCau.method === "POST") {
    const { text, voice } = await yeuCau.json();
    if (!text || String(text).length > 3000) return traLoi({ loi: "Chữ trống hoặc quá dài" }, 400);
    if (voice && !/^[a-z]{2}-[A-Z]{2}-\w+Neural$/.test(voice)) return traLoi({ loi: "Tên giọng không hợp lệ" }, 400);
    const traMp3 = (mp3) => new Response(mp3, { headers: { "Content-Type": "audio/mpeg", "Access-Control-Allow-Origin": "*" } });
    const thu = async (chu, soLan) => {
      let loiCuoi;
      for (let lan = 0; lan < soLan; lan++) {
        try { return await docEdge(chu, voice || undefined); } catch (loi) { loiCuoi = loi; }
        await new Promise((x) => setTimeout(x, 400 * (lan + 1)));
      }
      throw loiCuoi;
    };
    let loiCuoi;
    try { return traMp3(await thu(String(text), 3)); } catch (loi) { loiCuoi = loi; }
    // Edge hay ngắt giữa chừng với câu dài → chia đôi ở chỗ ngắt câu/khoảng trắng gần giữa, đọc từng nửa rồi nối MP3
    const chu = String(text).trim();
    if (chu.length >= 16) {
      const giua = chu.length / 2;
      const cho = [...chu.matchAll(/[,.;:!?…]\s|\s/g)].map((m) => m.index + m[0].length).filter((k) => k > 3 && k < chu.length - 3);
      if (cho.length) {
        const cat = cho.reduce((a, k) => (Math.abs(k - giua) < Math.abs(a - giua) ? k : a));
        try {
          const [a, b2] = [await thu(chu.slice(0, cat).trim(), 2), await thu(chu.slice(cat).trim(), 2)];
          const ra = new Uint8Array(a.length + b2.length);
          ra.set(a); ra.set(b2, a.length);
          return traMp3(ra);
        } catch (loi) { loiCuoi = loi; }
      }
    }
    return traLoi({ loi: String(loiCuoi?.message || loiCuoi) }, 502);
  }

  if (duongDan === "/ai/chuyen") {
    const dich = yeuCau.headers.get("X-Dich-Den") || "";
    let url;
    try { url = new URL(dich); } catch { return traLoi({ loi: "Địa chỉ không hợp lệ" }, 400); }
    if (url.protocol !== "https:" || !DUOC_CHUYEN.some((m) => m.test(url.hostname))) {
      return traLoi({ loi: "Không được chuyển tới " + url.hostname }, 403);
    }
    const dau = new Headers(yeuCau.headers);
    for (const k of ["X-Ve", "X-Dich-Den", "Host", "Origin", "Referer", "Cookie"]) dau.delete(k);
    const tl = await fetch(url, {
      method: yeuCau.method,
      headers: dau,
      body: ["GET", "HEAD"].includes(yeuCau.method) ? undefined : yeuCau.body,
    });
    const dauRa = new Headers(tl.headers);
    dauRa.set("Access-Control-Allow-Origin", "*");
    dauRa.set("Access-Control-Expose-Headers", "*");
    return new Response(tl.body, { status: tl.status, headers: dauRa });
  }
  return traLoi({ loi: "Không tìm thấy" }, 404);
}
