// Bộ kiểm tra đầy đủ app PhaHa lồng tiếng (mọi dịch vụ giả lập)
import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const THU_MUC = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(process.env.PLAYWRIGHT || "/opt/node-tools/node_modules/playwright/index.mjs");
const ROOT = path.resolve(THU_MUC, "../..");
const S = process.env.S || path.join(THU_MUC, "du-lieu"), NM = `${S}/mdx/node_modules`;
const types = {".html":"text/html",".js":"text/javascript",".mjs":"text/javascript",".css":"text/css",".json":"application/json",".png":"image/png",".svg":"image/svg+xml",".wasm":"application/wasm"};
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split("?")[0]).replace(/\/$/, "/index.html"));
  if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, {"Content-Type": types[path.extname(f)]||"application/octet-stream","Content-Length":fs.statSync(f).size}); fs.createReadStream(f).pipe(r); }).listen(8780);
const b = await chromium.launch();
const J = {"Access-Control-Allow-Origin":"*","Content-Type":"application/json"};
const pcm = (giay) => { const n = Math.round(24000*giay); const x = Buffer.alloc(n*2); for (let i=0;i<n;i++) x.writeInt16LE(Math.round(Math.sin(i/24000*2*Math.PI*440)*9000), i*2); return x; };
const wav = (p) => { const h = Buffer.alloc(44); h.write("RIFF",0); h.writeUInt32LE(36+p.length,4); h.write("WAVE",8); h.write("fmt ",12); h.writeUInt32LE(16,16); h.writeUInt16LE(1,20); h.writeUInt16LE(1,22); h.writeUInt32LE(24000,24); h.writeUInt32LE(48000,28); h.writeUInt16LE(2,32); h.writeUInt16LE(16,34); h.write("data",36); h.writeUInt32LE(p.length,40); return Buffer.concat([h,p]); };
const CAU = [{start:1,end:3,zh:"你好朋友",vi:"Xin chào bạn của tôi"},{start:4,end:5.5,zh:"谢谢",vi:"Cảm ơn bạn nhiều lắm"},{start:5.8,end:7,zh:"好",vi:"Được"},{start:7.5,end:8.8,zh:"再见",vi:"Tạm biệt"}];
const SEG = [{start:1,end:3,text:"你好朋友",no_speech_prob:0.01,avg_logprob:-0.2},{start:4,end:5.5,text:"请不吝点赞订阅",no_speech_prob:0.1,avg_logprob:-0.3},{start:5.8,end:7,text:"谢谢",no_speech_prob:0.01,avg_logprob:-0.2}];
const DICH = JSON.stringify({"1":"Chào bạn","2":"Cảm ơn"});

async function chay(ten, o) {
  const p = await b.newPage({ viewport: { width: 400, height: 900 }, acceptDownloads: true });
  const loiTrang = [], goi = {}; const dem = (k) => (goi[k] = (goi[k] || 0) + 1);
  p.on("pageerror", (e) => loiTrang.push(e.message));
  if (o.chanLoa) await p.addInitScript(() => {
    // Giả lập iPhone: chỉ cho phát tiếng trong 300ms sau khi bấm
    let bam = 0; window.__phat = [];
    addEventListener("click", () => (bam = Date.now()), true);
    HTMLMediaElement.prototype.play = function () {
      const ok = Date.now() - bam < 300;
      window.__phat.push((ok ? "ok:" : "chan:") + (this.src.startsWith("blob:") ? "blob" : "khac"));
      return ok ? Promise.resolve() : Promise.reject(new DOMException("not allowed", "NotAllowedError"));
    };
  });
  await p.route("https://cdn.jsdelivr.net/**", (rt) => { const u = rt.request().url(); let f;
    if (u.includes("@ffmpeg/core")) f = `${S}/core/package/dist/esm/${u.split("/").pop()}`;
    else if (u.includes("onnxruntime-web")) { if (o.ort === "404") return rt.fulfill({ status: 404, body: "" }); f = `${NM}/onnxruntime-web/dist/${u.split("/dist/")[1]}`; }
    else if (u.includes("mediabunny")) f = `${NM}/mediabunny/dist/bundles/${u.split("/").pop()}`;
    else if (u.includes("piper-wasm")) f = `${S}/piper/pw/package/build/${u.split("/").pop()}`;
    if (!f) return rt.abort();
    rt.fulfill({ path: f, headers: { "Access-Control-Allow-Origin": "*", "Content-Type": f.endsWith("wasm") ? "application/wasm" : "text/javascript" } }); });
  await p.route("https://fonts.googleapis.com/**", (rt) => rt.fulfill({ status: 200, contentType: "text/css", body: "" }));
  await p.route("https://generativelanguage.googleapis.com/**", async (rt) => { const u = rt.request().url(); const body = JSON.parse(rt.request().postData() || "{}");
    const khoaGui = rt.request().headers()["x-goog-api-key"];
    if (u.includes("tts")) (goi.khoaDoc ||= new Set()).add(khoaGui); else (goi.khoaNghe ||= new Set()).add(khoaGui);
    if (u.includes("tts") && o.gemTTS === "het" && khoaGui !== "KD") { dem("gemTTS"); return rt.fulfill({ status: 429, headers: J, body: JSON.stringify({ error: { message: "You exceeded your current quota", details: [{ violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] }] } }) }); }
    if (u.includes("tts")) { dem("gemTTS"); return rt.fulfill({ headers: J, body: JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/L16;codec=pcm;rate=24000", data: pcm(2).toString("base64") } }] } }] }) }); }
    dem("gemNghe");
    if (o.gemini === "het") return rt.fulfill({ status: 429, headers: J, body: JSON.stringify({ error: { message: "You exceeded your current quota", details: [{ violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] }] } }) });
    if (o.gemCham) await new Promise((r) => setTimeout(r, o.gemCham));
    rt.fulfill({ headers: J, body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(o.cau || CAU) }] } }] }) }); });
  await p.route("https://texttospeech.googleapis.com/**", (rt) => { const u = rt.request().url(); dem("gc");
    if (u.includes("voices")) return rt.fulfill({ headers: J, body: JSON.stringify({ voices: [{ name: "vi-VN-Chirp3-HD-Aoede", languageCodes: ["vi-VN"], ssmlGender: "FEMALE" }, { name: "vi-VN-Wavenet-B", languageCodes: ["vi-VN"], ssmlGender: "MALE" }] }) });
    rt.fulfill({ headers: J, body: JSON.stringify({ audioContent: wav(pcm(1.5)).toString("base64") }) }); });
  await p.route("https://southeastasia.tts.speech.microsoft.com/**", (rt) => { const u = rt.request().url(); dem("azTTS");
    if (u.includes("voices/list")) return rt.fulfill({ headers: J, body: JSON.stringify([{ ShortName: "en-US-AvaMultilingualNeural", Locale: "en-US", Gender: "Female", DisplayName: "Ava", SecondaryLocaleList: ["vi-VN", "fr-FR"] }, { ShortName: "en-US-Guy", Locale: "en-US", Gender: "Male", DisplayName: "Guy" }, { ShortName: "vi-VN-HoaiMyNeural", Locale: "vi-VN", Gender: "Female", LocalName: "Hoài My" }]) });
    goi.azSsml = rt.request().postData();
    if (o.azHet) return rt.fulfill({ status: 403, headers: J, body: "quota exceeded" });
    rt.fulfill({ headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "audio/wav" }, body: wav(pcm(1.5)) }); });
  await p.route("https://southeastasia.api.cognitive.microsoft.com/**", (rt) => { dem("azNghe"); rt.fulfill({ headers: J, body: JSON.stringify({ phrases: [{ offsetMilliseconds: 1000, durationMilliseconds: 2000, text: "你好朋友" }, { offsetMilliseconds: 5800, durationMilliseconds: 1200, text: "谢谢" }] }) }); });
  let elDang = 0, elMax = 0, elXong = 0;
  await p.route("https://api.elevenlabs.io/**", async (rt) => { const u = rt.request().url();
    if (u.endsWith("/voices")) return rt.fulfill({ headers: J, body: JSON.stringify({ voices: o.elKhongViet ? [{ voice_id: "v2", name: "Adam", labels: { gender: "male" } }] : [{ voice_id: "v1", name: "Linh", labels: { language: "vi", gender: "female" } }] }) });
    if (u.endsWith("/user/subscription")) return rt.fulfill({ headers: J, body: JSON.stringify({ character_count: o.elDaDung ?? 2500, character_limit: 10000, next_character_count_reset_unix: 1793000000 }) });
    if (u.includes("/shared-voices")) { dem("elThuVien"); return rt.fulfill({ headers: J, body: JSON.stringify({ voices: [{ public_owner_id: "own1", voice_id: "sv1", name: "Mai", gender: "female" }, { public_owner_id: "own2", voice_id: "sv2", name: "Tuấn", gender: "male" }] }) }); }
    if (u.includes("/voices/add/")) { dem("elThem"); goi.elThemUrl = u; return rt.fulfill({ headers: J, body: JSON.stringify({ voice_id: "v9" }) }); }
    dem("el"); goi.elGiong = u.split("/text-to-speech/")[1]?.split("?")[0];
    if (o.elHet !== undefined && elXong >= o.elHet) return rt.fulfill({ status: 401, headers: J, body: JSON.stringify({ detail: { status: "quota_exceeded", message: "quota" } }) });
    if (++elDang > 2) { elDang--; dem("el429"); return rt.fulfill({ status: 429, headers: J, body: JSON.stringify({ detail: { code: "concurrent_limit_exceeded", message: "Too many concurrent requests" } }) }); }
    elMax = Math.max(elMax, elDang); await new Promise((r) => setTimeout(r, 200)); elDang--; elXong++;
    rt.fulfill({ headers: { ...J, "Content-Type": "application/octet-stream" }, body: pcm(1.5) }); });
  await p.route("https://api.groq.com/**", async (rt) => { const u = rt.request().url();
    if (o.groq === "chan") return rt.abort();
    dem("groq");
    if (o.groq === "het") return rt.fulfill({ status: 429, headers: J, body: JSON.stringify({ error: { message: "Rate limit reached: requests per day" } }) });
    if (u.includes("transcriptions")) return rt.fulfill({ headers: J, body: JSON.stringify({ segments: SEG }) });
    rt.fulfill({ headers: J, body: JSON.stringify({ choices: [{ message: { content: o.groqMang ? '["Chào bạn","Cảm ơn"]' : "<think>x</think>" + DICH } }] }) }); });
  await p.route("https://viec-hom-nay-nhac.phamduycuong1604.workers.dev/**", async (rt) => { const u = rt.request().url(); const h = rt.request().headers();
    if (rt.request().method() === "OPTIONS") return rt.fulfill({ status: 204, headers: { ...J, "Access-Control-Allow-Headers": "*" } });
    if (!u.includes("/ai/")) return rt.fulfill({ headers: J, body: "{}" });
    dem("cf");
    if (h["x-ve"] !== "VE") return rt.fulfill({ status: 401, headers: J, body: JSON.stringify({ loi: "Cần đăng nhập" }) });
    if (u.endsWith("/ai/rednote")) { dem("rnTim"); goi.rnLink = JSON.parse(rt.request().postData()).link;
      if (o.link === "anh") return rt.fulfill({ status: 404, headers: J, body: JSON.stringify({ loi: "Bài RedNote này là ảnh, không có video." }) });
      return rt.fulfill({ headers: J, body: JSON.stringify({ cacLink: ["https://sns-video-bd.xhscdn.com/a.mp4"], tieuDe: "调色/教程" }) }); }
    if (u.endsWith("/ai/rednote-tai")) { dem("rnTai"); goi.rnCacLink = JSON.parse(rt.request().postData()).cacLink;
      return rt.fulfill({ headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Content-Length", "Content-Type": "video/mp4" }, body: fs.readFileSync(`${S}/${o.video || "thu-vp9.mp4"}`) }); }
    if (u.endsWith("/ai/edge")) { dem("edge"); goi.edgeGiong = JSON.parse(rt.request().postData()).voice;
      if (o.edge === "roi" && /Cảm ơn/.test(JSON.parse(rt.request().postData()).text)) { dem("edgeRoi"); return rt.fulfill({ status: 502, headers: J, body: JSON.stringify({ loi: "Edge đóng kết nối (mã 1006 WebSocket disconnected without sending Close frame.; nhận: turn.start,response)" }) }); }
      if (o.edge === "hong") return rt.fulfill({ status: 502, headers: J, body: JSON.stringify({ loi: "Edge từ chối kết nối (mã 403)" }) });
      return rt.fulfill({ headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "audio/mpeg" }, body: fs.readFileSync(`${S}/sine.mp3`) }); }
    if (u.endsWith("/ai/chuyen") && h["x-dich-den"].includes("api.fish.audio")) { const d = h["x-dich-den"];
      if (d.includes("/model?")) { dem("fishDs"); return rt.fulfill({ headers: J, body: JSON.stringify({ items: [{ _id: "f1", title: "Giọng Nữ Miền Bắc", languages: ["vi"], task_count: 5000 }, { _id: "f2", title: "Nam MC", languages: ["vi"], task_count: 9000 }] }) }); }
      if (d.includes("/wallet/")) return rt.fulfill({ headers: J, body: JSON.stringify({ credit: "12.5" }) });
      dem("fish"); goi.fishModel = h["model"]; goi.fishGiong = JSON.parse(rt.request().postData()).reference_id;
      if (o.fishHet) return rt.fulfill({ status: 402, headers: J, body: JSON.stringify({ message: "Insufficient balance" }) });
      return rt.fulfill({ headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "audio/wav" }, body: wav(pcm(1.5)) }); }
    if (u.endsWith("/ai/chuyen")) { const d = h["x-dich-den"]; return rt.fulfill({ headers: J, body: JSON.stringify(d.includes("transcriptions") ? { segments: SEG } : { choices: [{ message: { content: DICH } }] }) }); }
    if (o.cf === "hong") return rt.fulfill({ status: 400, headers: J, body: JSON.stringify({ loi: "neurons exhausted" }) });
    if (u.endsWith("/ai/nghe")) return rt.fulfill({ headers: J, body: JSON.stringify({ segments: SEG }) });
    rt.fulfill({ headers: J, body: JSON.stringify({ text: DICH }) }); });
  await p.route("https://viettelai.vn/**", async (rt) => { dem("vt");
    if (rt.request().method() === "OPTIONS") return rt.fulfill({ status: 204, headers: { ...J, "Access-Control-Allow-Headers": "*" } });
    const b = JSON.parse(rt.request().postData()); goi.vtGiong = b.voice; goi.vtDinhDang = b.tts_return_option;
    if (!b.text) { dem("vtRong"); return rt.fulfill({ status: 400, headers: J, body: JSON.stringify({ code: 400, en_message: "Not empty text" }) }); }
    if (b.token === "vt-het") return rt.fulfill({ status: 403, headers: J, body: JSON.stringify({ code: 403, en_message: "Total unit for this request greater than your remaining unit. Please upgrade your package to keep continue service", vi_message: "Hạn mức sử dụng của Request vượt quá số hạn mức còn lại" }) });
    if (b.token !== "vt-ok") return rt.fulfill({ status: 401, headers: J, body: JSON.stringify({ message: "Invalid token" }) });
    rt.fulfill({ headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "audio/mpeg" }, body: fs.readFileSync(`${S}/sine.mp3`) }); });
  let fptCho = {};
  await p.route("https://api.fpt.ai/**", async (rt) => { const h = rt.request().headers(); dem("fpt");
    if (rt.request().method() === "OPTIONS") return rt.fulfill({ status: 204, headers: { ...J, "Access-Control-Allow-Headers": "*" } });
    goi.fptGiong = h.voice;
    if (h["api-key"] !== "fk-fpt") return rt.fulfill({ status: 401, headers: J, body: JSON.stringify({ message: "Invalid API key" }) });
    const id = Math.random().toString(36).slice(2); fptCho[id] = 0;
    rt.fulfill({ headers: J, body: JSON.stringify({ async: `https://file01.fpt.ai/text2speech-v5/short/${id}.mp3`, error: 0, message: "ok", request_id: id }) }); });
  await p.route("https://file01.fpt.ai/**", (rt) => { const id = rt.request().url().split("/").pop().replace(".mp3", "");
    if ((fptCho[id] = (fptCho[id] || 0) + 1) < 2) return rt.fulfill({ status: 404, headers: { "Access-Control-Allow-Origin": "*" }, body: "" });
    rt.fulfill({ headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "audio/mpeg" }, body: fs.readFileSync(`${S}/sine.mp3`) }); });
  await p.route("https://api.deepseek.com/**", async (rt) => { const u = rt.request().url(); dem("ds");
    if (rt.request().method() === "OPTIONS") return rt.fulfill({ status: 204, headers: { ...J, "Access-Control-Allow-Headers": "*" } });
    if (u.endsWith("/user/balance")) return rt.fulfill({ headers: J, body: JSON.stringify({ is_available: !o.dsHet, balance_infos: [{ currency: "USD", total_balance: o.dsHet ? "0.00" : "1.98" }] }) });
    if (o.dsHet) return rt.fulfill({ status: 402, headers: J, body: JSON.stringify({ error: { message: "Insufficient Balance" } }) });
    const b = JSON.parse(rt.request().postData()); goi.dsModel = b.model; goi.dsJson = b.response_format?.type;
    goi.dsLoiDan = b.messages?.[0]?.content?.slice(0, 400);
    const dongDs = (b.messages?.[1]?.content || "").split("\n").map((l) => /^(\d+)\. \([\d.]+s\) (.*)$/.exec(l)).filter(Boolean);
    if (o.dsChep) { dem("dsChep"); return rt.fulfill({ headers: J, body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(Object.fromEntries(dongDs.map((m) => [m[1], m[2]]))) } }] }) }); }
    if (o.dsDang === "boc") return rt.fulfill({ headers: J, body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ translations: dongDs.map((m) => ({ id: +m[1], zh: m[2], text: "Câu " + m[1] + " đã dịch (bọc)" })) }) } }] }) });
    if (o.dsDang === "mang") return rt.fulfill({ headers: J, body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(Object.fromEntries(dongDs.map((m) => [m[1], [m[2], "Câu " + m[1] + " đã dịch (mảng)"]]))) } }] }) });
    if (o.dsTrung && (goi.ds || 0) <= 1) return rt.fulfill({ headers: J, body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ "1": "你好朋友", "2": "Cảm ơn (DS)" }) } }] }) });
    if (o.dsTrung) return rt.fulfill({ headers: J, body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ "1": "Xin chào bạn (bù)" }) } }] }) });
    if (o.dsThieu && (goi.ds || 0) <= 1) return rt.fulfill({ headers: J, body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ "1": "Chào bạn (DS)" }) } }] }) });
    if (o.dsThieu) goi.dsBu = b.messages?.[1]?.content?.split("\n").filter((l) => /^\d+\./.test(l)).join(" | ");
    rt.fulfill({ headers: J, body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ "1": "Chào bạn (DS)", "2": "Cảm ơn (DS)", "3": "Ok (DS)" }) } }] }) }); });
  await p.route("https://openrouter.ai/**", (rt) => { dem("or"); rt.fulfill({ headers: J, body: JSON.stringify(rt.request().url().endsWith("/models") ? { data: [{ id: "deepseek/x:free" }] } : { choices: [{ message: { content: "Kết quả: " + DICH } }] }) }); });

  await p.goto("http://localhost:8780/dich-video/");
  await p.evaluate(([cd, logo]) => { localStorage.clear(); if (!cd.__khongVe) localStorage.setItem("ve-dang-nhap", "VE"); localStorage.setItem("phaha-dv-cai-dat", JSON.stringify(cd)); if (cd.__kyTu) localStorage.setItem("phaha-dv-ky-tu", JSON.stringify(cd.__kyTu)); if (cd.__dung) localStorage.setItem("phaha-dv-dung", JSON.stringify(cd.__dung)); if (cd.__nghi) localStorage.setItem("phaha-dv-gemini-nghi", JSON.stringify(cd.__nghi)); if (logo) localStorage.setItem("phaha-dv-logo", logo); },
    [{ ...o.caiDat, __khongVe: o.khongVe }, o.logo ? "data:image/png;base64," + fs.readFileSync(`${S}/logo.png`).toString("base64") : null]);
  await p.reload();
  if (o.kiemMa) {
    await p.click("#nut-cai-dat"); await p.click("#nut-kiem-tra-ma");
    await p.waitForSelector("#kq-kiem-tra:not(.an)", { timeout: 30000 });
    const kq = { ten, kq: await p.textContent("#kq-kiem-tra"), loiTrang, goi }; await p.close(); return { ...kq, nhatKy: "" };
  }
  if (o.chiCaiDat) return ngheThu(p, goi, loiTrang, ten);
  if (o.doiMa) { await p.click("#nut-cai-dat"); await p.fill("#o-khoa", o.doiMa); await p.click("#hop-cai-dat button[value=luu]"); }
  if (o.link) {
    // Dán link chia sẻ RedNote → app tự tải video, không chọn file
    await p.focus("#o-link");
    await p.evaluate(() => { const o = document.getElementById("o-link"); o.value = "看看这个 http://xhslink.com/a/AbC123，复制本条信息"; o.dispatchEvent(new Event("paste")); });
    await p.waitForFunction(() => /✅|❌/.test(document.getElementById("tt-tai-link").textContent), null, { timeout: 30000 });
    goi.rnTrangThai = await p.textContent("#tt-tai-link");
    goi.rnTen = await p.textContent("#chu-chon-video");
    if (o.link === "anh") { await p.close(); return { ten, goi, loiTrang, nhatKy: "" }; }
  } else
  await p.setInputFiles("#o-video", `${S}/${o.video || "thu-vp9.mp4"}`);
  const t0 = Date.now();
  await p.click("#nut-bat-dau");
  await p.waitForSelector("#the-ket-qua:not(.an), #loi:not(.an)", { timeout: o.han || 300000 });
  let kq = { ten, giay: ((Date.now() - t0) / 1000).toFixed(1), loi: (await p.textContent("#loi")).trim(), goi, elMax, loiTrang };
  kq.buoc = await p.$$eval(".cac-buoc li", (ls) => ls.map((l) => l.querySelector(".dau").textContent).join(""));
  kq.cau = await p.$$eval(".cau textarea", (t) => t.map((x) => x.value));
  if (!kq.loi) {
    const b64 = await p.evaluate(async () => { const r = await fetch(document.getElementById("xem-ket-qua").src); const a = new Uint8Array(await r.arrayBuffer()); let s = ""; for (let i = 0; i < a.length; i += 8192) s += String.fromCharCode(...a.subarray(i, i + 8192)); return btoa(s); });
    fs.writeFileSync(`${S}/kt-${ten}.mp4`, Buffer.from(b64, "base64"));
    kq.probe = execSync(`ffprobe -v error -show_entries stream=codec_type,codec_name,width,height,duration -of csv=p=0 ${S}/kt-${ten}.mp4`).toString().trim().replace(/\n/g, " | ");
  }
  if (o.sau) await o.sau(p, kq, goi);
  kq.nhatKy = await p.textContent("#o-nhat-ky");
  await p.close();
  return kq;
}

// Mặc định các kịch bản cũ: chỉ bật Google Cloud (+ Edge, giọng máy phía sau)
const vanTay = (k) => { let h = 5381; for (let i = 0; i < k.length; i++) h = ((h << 5) + h + k.charCodeAt(i)) >>> 0; return h.toString(36); };
const NGHI_K = Object.fromEntries(["gemini-flash-latest", "gemini-2.5-flash", "gemini-flash-lite-latest", "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-2.5-flash-preview-tts", "gemini-2.5-flash-tts", "gemini-2.5-pro-preview-tts"].map((m) => [vanTay("K") + ":" + m, Date.now() + 3600e3]));
const CHI_GC = { el: false, gemini: false, fish: false, az: false, gc: true, edge: true };
const DU = { el: true, gemini: true, fish: true, az: true, gc: false, edge: true }; // thứ tự mới đầy đủ
// Mở Cài đặt, bấm 🔊 Nghe thử ở từng dịch vụ
async function ngheThu(p, goi, loiTrang, ten) {
  const canhBao = [];
  p.on("dialog", (d) => { canhBao.push(d.message()); d.dismiss(); });
  await p.click("#nut-cai-dat");
  const kq = { ten, tt: await p.$$eval(".dv-doc .tt", (x) => x.map((t) => t.closest(".dv-doc").dataset.dv + ":" + t.textContent).join(" | ")), moSan: await p.$eval(".dv-doc[open]", (d) => d.dataset.dv), nghe: {} };
  for (const dv of ["el", "vt", "gemini", "fpt", "fish", "az", "edge", "gc", "may"]) {
    await p.$eval(`.dv-doc[data-dv=${dv}]`, (d) => (d.open = true));
    const truoc = canhBao.length, t = Date.now();
    await p.click(`.nut-nghe[data-dv=${dv}]`);
    await p.waitForFunction((dv) => !document.querySelector(`.nut-nghe[data-dv=${dv}]`).disabled, dv, { timeout: 300000 });
    kq.nghe[dv] = canhBao.length > truoc ? "LỖI: " + canhBao.slice(truoc).join(" / ") : `ok ${((Date.now() - t) / 1000).toFixed(1)}s`;
    const nhan = await p.textContent(`.nut-nghe[data-dv=${dv}]`);
    if (/để nghe/.test(nhan)) { await p.click(`.nut-nghe[data-dv=${dv}]`); kq.nghe[dv] += " → bấm lại: " + (await p.textContent(`.nut-nghe[data-dv=${dv}]`)); }
  }
  kq.goi = goi; kq.loiTrang = loiTrang; kq.thanhPhat = await p.$$eval(".loa-nghe", (x) => x.map((a) => (a.classList.contains("an") ? "an" : "hien") + ":" + a.src.slice(0, 5)).join(",")); kq.nhatNghe = (await p.textContent("#o-nhat-ky")).split("\n").filter((l) => /Nghe thử/.test(l)).slice(-3).join(" | "); kq.phat = await p.evaluate(() => (window.__phat || []).join(","));
  await p.click("#hop-cai-dat button[value=luu]");
  kq.luu = await p.evaluate(() => { const c = JSON.parse(localStorage.getItem("phaha-dv-cai-dat")); return { bat: c.bat, giongEdge: c.dv.edge.giong, giongFish: c.dv.fish.giong }; });
  kq.nhatKy = "";
  await p.close();
  return kq;
}

const CD = { khoa: "K", bat: CHI_GC, dv: { gc: { giong: "vi-VN-Chirp3-HD-Aoede" }, az: { khoa: "AZ", vung: "southeastasia", giong: "vi-VN-HoaiMyNeural" }, el: { khoa: "sk", giong: "v1", mh: "eleven_v3" }, fish: { khoa: "fk", giong: "f1" } }, tachNhac: false, lop: { phuDe: { bat: false } } };
const LOP = { phuDe: { bat: true, co: 6, y: 88, mau: "#ffff00", kieu: "vien" }, che: { bat: true, kieu: "mo", x: 50, y: 88, w: 90, h: 13 }, logo: { bat: true, co: 20, mo: 70, x: 88, y: 12 } };
const KICH_BAN = {
  "1-day-du": { caiDat: { ...CD, tachNhac: true, lop: LOP }, logo: true },
  "2-azure": { caiDat: { ...CD, bat: { ...CHI_GC, gc: false, az: true } } },
  "3-eleven-gioi-han": { caiDat: { ...CD, bat: DU } },
  "4-eleven-het-luot": { caiDat: { ...CD, bat: DU }, elHet: 2 },
  "4b-eleven-gemini-het-sang-fish": { caiDat: { ...CD, bat: DU }, elHet: 0, gemTTS: "het" },
  "4d-giong-ban-nguoi-dung": { caiDat: { ...CD, bat: DU, tachNhac: true, lop: LOP, dv: { el: CD.dv.el } }, logo: true, elHet: 0 },
  "21-thu-tu-den-edge": { caiDat: { ...CD, bat: DU, dv: { ...CD.dv, az: { ...CD.dv.az, giong: "en-US-AvaMultilingualNeural" }, edge: { giong: "vi-VN-NamMinhNeural" } } }, elHet: 0, gemTTS: "het", fishHet: true, azHet: true,
      sau: async (p, kq) => { kq.nhatThuTu = (await p.textContent("#o-nhat-ky")).split("\n").filter((l) => /↪️|Đã đọc|thứ tự/.test(l)).join("\n"); } },
  "22-el-thu-vien-tu-chon": { caiDat: { ...CD, bat: DU, dv: { ...CD.dv, el: { khoa: "sk", mh: "eleven_v3" }, fish: { khoa: "fk" } } }, elKhongViet: true },
  "23-fish-tu-chon-giong": { caiDat: { ...CD, bat: { ...DU, el: false }, dv: { ...CD.dv, fish: { khoa: "fk" } } }, gemTTS: "het" },
  "24-edge-chua-dang-nhap": { caiDat: { ...CD, bat: { ...DU, el: false, gemini: false, az: false }, dv: { ...CD.dv, fish: { khoa: "fk" } } }, khongVe: true, han: 600000 },
  "27-gemini-ma-rieng": { caiDat: { ...CD, khoaDoc: "KD", bat: { ...DU, el: false } }, gemTTS: "het",
      sau: async (p, kq) => { kq.goi.khoaDoc = [...kq.goi.khoaDoc]; kq.goi.khoaNghe = [...kq.goi.khoaNghe]; } },
  "27b-gemini-ma-rieng-nghe-thu": { caiDat: { ...CD, khoaDoc: "KD", bat: { ...DU, el: false } }, gemTTS: "het", chiCaiDat: true },
  "28-kiem-tra-ma": { caiDat: { ...CD, khoaDoc: "KD", dp: { groq: "gsk", or: "sk-or" } }, kiemMa: true },
  "28b-kiem-tra-ma-het": { caiDat: { ...CD, dp: { groq: "gsk" }, dv: { ...CD.dv, el: {} } }, kiemMa: true, gemini: "het", groq: "het", khongVe: true },
  "29-deepseek-dich": { caiDat: { ...CD, dichBang: "deepseek", dp: { ds: "sk-ds", groq: "gsk", cf: true } } },
  "29b-deepseek-het-tien": { caiDat: { ...CD, dichBang: "deepseek", dp: { ds: "sk-ds", groq: "gsk", cf: true } }, dsHet: true },
  "29c-deepseek-nghe-hong-ve-gemini": { caiDat: { ...CD, dichBang: "deepseek", dp: { ds: "sk-ds", groq: "gsk", cf: false, azNghe: false } }, groq: "het" },
  "29d-kiem-tra-ma-deepseek": { caiDat: { ...CD, dp: { ds: "sk-ds", groq: "gsk" } }, kiemMa: true },
  "30-doi-ma-gemini": { caiDat: { ...CD, __nghi: Object.fromEntries(["gemini-flash-latest", "gemini-2.5-flash", "gemini-flash-lite-latest", "gemini-2.5-flash-lite", "gemini-2.0-flash"].map((m) => [m, Date.now() + 3600e3])) }, doiMa: "K2" },
  "30b-khong-doi-ma": { caiDat: { ...CD, dp: { groq: "gsk" }, __nghi: Object.fromEntries(["gemini-flash-latest", "gemini-2.5-flash", "gemini-flash-lite-latest", "gemini-2.5-flash-lite", "gemini-2.0-flash"].map((m) => [m, Date.now() + 3600e3])) } },
  "30c-ma-cu-nho-het": { caiDat: { ...CD, dp: { groq: "gsk" }, bat: { ...DU, el: false }, __nghi: NGHI_K } },
  "30d-ma-moi-dung-ngay": { caiDat: { ...CD, khoa: "K2", dp: { groq: "gsk" }, bat: { ...DU, el: false }, __nghi: NGHI_K } },
  "29e-deepseek-tat": { caiDat: { ...CD, dichBang: "gemini", dp: { ds: "sk-ds", groq: "gsk", cf: true } }, gemini: "het" },
  "28c-han-muc": { caiDat: { ...CD, khoaDoc: "", dp: { groq: "gsk", or: "sk-or" }, __dung: { [`gm:${vanTay("K")}:nghe`]: { ngay: new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }), n: 50 }, [`gm:${vanTay("K")}:doc`]: { ngay: new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }), n: 15 }, [`max:gm:${vanTay("K")}:doc`]: { n: 20 }, [`groq:${vanTay("gsk")}`]: { ngay: new Date().toISOString().slice(0, 10), n: 1800 } } }, kiemMa: true },
  "28d-el-het-that": { caiDat: CD, kiemMa: true, elDaDung: 9950 },
  "31-fpt-doc": { caiDat: { ...CD, bat: { ...DU, el: false }, dv: { ...CD.dv, fpt: { khoa: "fk-fpt", giong: "leminh" } } }, gemTTS: "het" },
  "31b-fpt-sai-ma": { caiDat: { ...CD, bat: { ...DU, el: false }, dv: { ...CD.dv, fpt: { khoa: "sai", giong: "banmai" } } }, gemTTS: "het" },
  "28e-kiem-tra-tat-ca": { caiDat: { ...CD, dp: { groq: "gsk" }, dv: { ...CD.dv, vt: { khoa: "vt-ok", giong: "hn-quynhanh" }, fpt: { khoa: "fk-fpt", giong: "banmai" } } }, kiemMa: true },
  "28f-kiem-tra-sai": { caiDat: { ...CD, dv: { ...CD.dv, vt: { khoa: "sai", giong: "hn-quynhanh" }, fpt: { khoa: "sai", giong: "banmai" } } }, kiemMa: true },
  "33c-viettel-cau-rong": { caiDat: { ...CD, bat: { ...DU, el: false }, dv: { ...CD.dv, vt: { khoa: "vt-ok", giong: "hn-quynhanh" } } },
      cau: [{ start: 1, end: 3, zh: "你好", vi: "Xin chào bạn" }, { start: 4, end: 5, zh: "好的", vi: "好的" }, { start: 5.5, end: 6.5, zh: "嗯", vi: "#~" }, { start: 7, end: 8.5, zh: "再见", vi: "Tạm biệt" }] },
  "4g-giong-may-cho-chen-chu": { caiDat: { ...CD, bat: DU, tachNhac: true, lop: LOP, dv: { el: CD.dv.el } }, logo: true, elHet: 0, gemTTS: "het", edge: "hong", han: 600000 },
  "34-tai-link-rednote": { caiDat: CD, link: true },
  "34b-link-rednote-la-anh": { caiDat: CD, link: "anh" },
  "29j-deepseek-chep-nguyen-van": { caiDat: { ...CD, dichBang: "deepseek", dp: { ds: "sk-ds", groq: "gsk", cf: true } }, dsChep: true },
  "29k-deepseek-tra-dang-boc": { caiDat: { ...CD, dichBang: "deepseek", dp: { ds: "sk-ds", groq: "gsk", cf: true } }, dsDang: "boc" },
  "29l-deepseek-tra-dang-mang": { caiDat: { ...CD, dichBang: "deepseek", dp: { ds: "sk-ds", groq: "gsk", cf: true } }, dsDang: "mang" },
  "29f-deepseek-dich-bu": { caiDat: { ...CD, dichBang: "deepseek", dp: { ds: "sk-ds", groq: "gsk", cf: true } }, dsThieu: true },
  "29g-deepseek-tra-chu-trung": { caiDat: { ...CD, dichBang: "deepseek", dp: { ds: "sk-ds", groq: "gsk", cf: true } }, dsTrung: true },
  "29h-gemini-con-chu-trung": { caiDat: { ...CD, dp: { groq: "gsk" } }, cau: [{ start: 1, end: 3, zh: "你好朋友", vi: "你好朋友" }, { start: 4, end: 5.5, zh: "谢谢", vi: "Cảm ơn nhé" }] },
  "25-nghe-thu": { caiDat: { ...CD, bat: DU, dv: { ...CD.dv, fpt: { khoa: "fk-fpt", giong: "myan" }, vt: { khoa: "vt-ok", giong: "hcm-diemmy" } } }, chiCaiDat: true },
  "33-viettel-doc": { caiDat: { ...CD, bat: { ...DU, el: false }, dv: { ...CD.dv, vt: { khoa: "vt-ok", giong: "hue-maingoc" } } } },
  "33d-viettel-het-ky-tu": { caiDat: { ...CD, bat: { ...DU, el: false }, dv: { ...CD.dv, vt: { khoa: "vt-het", giong: "hn-quynhanh" } } } },
  "33b-viettel-sai-ma": { caiDat: { ...CD, bat: { ...DU, el: false }, dv: { ...CD.dv, vt: { khoa: "sai", giong: "hn-quynhanh" } } } },
  "26-nghe-thu-iphone-chan": { caiDat: { ...CD, bat: DU }, chiCaiDat: true, chanLoa: true },
  "4c-gemini-nho-het-luot": { caiDat: { ...CD, dp: { groq: "gsk" } }, gemini: "het", sau: async (p, kq, goi) => {
      const truoc = goi.gemNghe || 0;
      await p.click("#nut-bat-dau");
      await p.waitForFunction(() => !document.getElementById("nut-bat-dau").disabled, null, { timeout: 120000 });
      await p.waitForSelector("#the-ket-qua:not(.an), #loi:not(.an)", { timeout: 120000 });
      kq.lan2 = { loi: (await p.textContent("#loi")).trim(), gemNgheThem: (goi.gemNghe || 0) - truoc, groq: goi.groq };
    } },
  "4e-google-het-chirp": { caiDat: { ...CD, dv: { ...CD.dv, gc: { giong: "vi-VN-Chirp3-HD-Aoede", ds: [{ ten: "vi-VN-Chirp3-HD-Aoede", nhan: "Tự nhiên nhất · Nữ · Chirp3-HD-Aoede" }, { ten: "vi-VN-Wavenet-B", nhan: "Tốt, rẻ · Nam · Wavenet-B" }, { ten: "vi-VN-Wavenet-A", nhan: "Tốt, rẻ · Nữ · Wavenet-A" }] } },
      __kyTu: { thang: new Date().toISOString().slice(0, 7), "gc-hd": 995000 } }, sau: async (p, kq) => { kq.dem = await p.evaluate(() => localStorage.getItem("phaha-dv-ky-tu")); } },
  "4h-edge-roi-vai-cau": { caiDat: { ...CD, bat: DU, dv: { el: CD.dv.el } }, elHet: 0, gemTTS: "het", edge: "roi", han: 600000 },
  "4f-giong-may": { caiDat: { ...CD, bat: DU, tachNhac: true, dv: { el: CD.dv.el } }, elHet: 0, gemTTS: "het", edge: "hong", han: 600000,
      sau: async (p, kq) => { kq.nhatMay = (await p.textContent("#o-nhat-ky")).split("\n").filter((l) => /Giọng máy|↪️|Đã đọc|Bỏ qua/.test(l)).join("\n"); } },
  "5-gemini-doc": { caiDat: { ...CD, bat: { ...DU, el: false } } },
  "6-du-phong-groq": { caiDat: { ...CD, dp: { groq: "gsk", cf: true, azNghe: true } }, gemini: "het" },
  "6b-groq-tra-mang": { caiDat: { ...CD, dp: { groq: "gsk" } }, gemini: "het", groqMang: true },
  "7-du-phong-cf": { caiDat: { ...CD, dp: { groq: "gsk", cf: true } }, gemini: "het", groq: "het" },
  "8-du-phong-az-or": { caiDat: { ...CD, dp: { groq: "gsk", cf: true, azNghe: true, or: "sk-or" } }, gemini: "het", groq: "het", cf: "hong" },
  "9-groq-bi-chan": { caiDat: { ...CD, dp: { groq: "gsk", cf: false } }, gemini: "het", groq: "chan" },
  "10-het-sach": { caiDat: { ...CD, dp: { groq: "gsk", cf: true } }, gemini: "het", groq: "het", cf: "hong" },
  "11-ai-tach-hong": { caiDat: { ...CD, tachNhac: true }, ort: "404" },
  "12-giam-tieng": { caiDat: { ...CD, tachNhac: true, mhTach: "giam" } },
  "13-h264-khong-ve-duoc": { caiDat: { ...CD, lop: LOP }, video: "thu.mp4" },
  "14-khong-tieng": { caiDat: CD, video: "khongtieng.mp4" },
  "15-mono": { caiDat: { ...CD, tachNhac: true }, video: "mono.mp4" },
  "16-xoay-doc": { caiDat: { ...CD, lop: LOP }, video: "thu-xoay.mp4" },
  "17-video-dai": { caiDat: CD, video: "dai.mp4", gemCham: 2000 },
  "18-lam-lai": { caiDat: { ...CD, tachNhac: true }, sau: async (p, kq, goi) => {
      const truoc = { ...goi };
      await p.fill(".cau textarea >> nth=0", "Chào cả nhà nhé");
      await p.click("#nut-lam-lai");
      await p.waitForFunction(() => !document.getElementById("nut-lam-lai").disabled, null, { timeout: 120000 });
      kq.ketQuaHien = await p.isVisible("#the-ket-qua");
      kq.lamLai = { loi: (await p.textContent("#loi")).trim(), gcThem: (goi.gc || 0) - (truoc.gc || 0), gemThem: (goi.gemNghe || 0) - (truoc.gemNghe || 0),
        tachLai: /Tách nhạc: dùng|Tách nhạc: 0/.test((await p.textContent("#o-nhat-ky"))) };
      kq.nhatKyLamLai = (await p.textContent("#o-nhat-ky")).split("\n").slice(0, 40).join("\n");
      if (!kq.ketQuaHien) return;
      const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 10000 }), p.click("#nut-phu-de")]);
      kq.srt = fs.readFileSync(await dl.path(), "utf8").split("\n").slice(0, 3).join(" / ");
    } },
  "19-lam-lai-2-lan-day-du": { caiDat: { ...CD, tachNhac: true, lop: LOP }, logo: true, sau: async (p, kq) => {
      kq.lan = [];
      for (const chu of ["Lần sửa một", "Lần sửa hai"]) {
        await p.fill(".cau textarea >> nth=1", chu);
        await p.click("#nut-lam-lai");
        await p.waitForFunction(() => !document.getElementById("nut-lam-lai").disabled, null, { timeout: 120000 });
        kq.lan.push({ loi: (await p.textContent("#loi")).trim(), buoc: await p.$$eval(".cac-buoc li", (ls) => ls.map((l) => l.querySelector(".dau").textContent).join("")) });
      }
    } },
  "20-doi-video": { caiDat: { ...CD, tachNhac: true, lop: LOP }, sau: async (p, kq) => {
      await p.setInputFiles("#o-video", `${S}/mono.mp4`);
      await p.click("#nut-bat-dau");
      await p.waitForFunction(() => !document.getElementById("nut-bat-dau").disabled && document.getElementById("the-tien-do").querySelector(".dang") === null, null, { timeout: 120000 });
      await p.waitForSelector("#the-ket-qua:not(.an), #loi:not(.an)", { timeout: 120000 });
      kq.video2 = { loi: (await p.textContent("#loi")).trim(), buoc: await p.$$eval(".cac-buoc li", (ls) => ls.map((l) => l.querySelector(".dau").textContent).join("")),
        tachMoi: /Tách nhạc: 00:09/.test(await p.textContent("#o-nhat-ky")) };
    } },
};
const chon = process.argv.slice(2);
for (const [ten, o] of Object.entries(KICH_BAN)) {
  if (chon.length && !chon.some((c) => ten.startsWith(c))) continue;
  try {
    const kq = await chay(ten, o);
    const { nhatKy, ...gon } = kq;
    console.log(JSON.stringify(gon, (k, v) => (v instanceof Set ? [...v] : v)));
    fs.writeFileSync(`${S}/kt-${ten}.log`, nhatKy);
  } catch (e) { console.log(JSON.stringify({ ten, NGOAI_LE: String(e.message).slice(0, 300) })); }
}
await b.close(); srv.close();
