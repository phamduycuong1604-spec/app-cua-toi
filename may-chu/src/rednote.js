// =====================================================
// TẢI VIDEO TỪ LINK REDNOTE / XIAOHONGSHU (小红书)
// Người dùng dán link chia sẻ (có thể lẫn chữ Trung xung quanh) →
//  1. lấy link trong đoạn chữ, mở trang bài viết (link rút gọn xhslink tự chuyển tiếp)
//  2. đọc dữ liệu bài viết có sẵn trong trang (window.__INITIAL_STATE__) → địa chỉ file video
//  3. app gọi /ai/rednote-tai để máy chủ tải hộ file video (trình duyệt bị chặn tải thẳng)
// =====================================================
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const UA_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";
const TRANG_CHAN = /\/(login|website-login|captcha|404)/;
const TRANG_DUOC_MO = /(^|\.)(xiaohongshu\.com|xhslink\.com|rednote\.com)$/;
export const VIDEO_DUOC_TAI = /(^|\.)(xhscdn\.com|xhscdn\.net|xiaohongshu\.com)$/;

// Lấy link đầu tiên trong đoạn chữ chia sẻ
export function layLink(chu) {
  const m = String(chu || "").match(/https?:\/\/[^\s，。！？、"'<>）)】]+/);
  if (!m) return null;
  try {
    const u = new URL(m[0].replace(/[.,;:!?…~]+$/, ""));
    // chỉ nhận trang RedNote; không nhận link có mật khẩu (user:pass@) hay cổng lạ
    return TRANG_DUOC_MO.test(u.hostname) && !u.username && !u.password && !u.port ? u : null;
  } catch {
    return null;
  }
}

// Dữ liệu trong trang là JavaScript, có chữ undefined → đổi thành null để đọc như JSON
function docTrangThai(html) {
  const m = html.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?})\s*<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1].replace(/:\s*undefined\b/g, ":null").replace(/\[undefined\b/g, "[null").replace(/,undefined\b/g, ",null"));
  } catch {
    return null;
  }
}

// Tìm bài viết trong dữ liệu trang (bản máy tính: note.noteDetailMap, bản điện thoại: noteData.data.noteData)
function timBaiViet(tt) {
  const map = tt?.note?.noteDetailMap;
  if (map) for (const v of Object.values(map)) if (v?.note?.video || v?.note?.type) return v.note;
  return tt?.noteData?.data?.noteData || tt?.note?.note || null;
}

const sachLink = (u) => String(u || "").replace(/\\u002F/g, "/").replace(/^http:/, "https:");

// Chọn địa chỉ file video tốt nhất trong bài viết
export function chonVideo(bai) {
  const v = bai?.video;
  if (!v) return null;
  const luong = v.media?.stream || {};
  const ds = [...(luong.h264 || []), ...(luong.h265 || []), ...(luong.av1 || [])].filter((x) => x?.masterUrl);
  // ưu tiên h264 (iPhone xử lý được chắc chắn), rồi chất lượng cao hơn
  ds.sort((a, b) => (a.videoCodec === "h264" ? 0 : 1) - (b.videoCodec === "h264" ? 0 : 1) || (b.height || 0) - (a.height || 0));
  const cacLink = [];
  for (const x of ds) cacLink.push(sachLink(x.masterUrl), ...(x.backupUrls || []).map(sachLink));
  const goc = v.consumer?.originVideoKey;
  if (goc) cacLink.push(`https://sns-video-bd.xhscdn.com/${goc}`);
  return cacLink.filter(Boolean);
}

// Đi theo từng bước chuyển hướng (tối đa 6), không cho nhảy ra ngoài RedNote; giữ nguyên xsec_token trong link
async function moTrang(link, ua) {
  let url = new URL(link.href);
  for (let buoc = 0; buoc <= 6; buoc++) {
    const r = await fetch(url.href, { headers: { "User-Agent": ua, "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8", Accept: "text/html,application/xhtml+xml" }, redirect: "manual" });
    const den = r.status >= 300 && r.status < 400 && r.headers.get("location");
    if (!den) return { r, html: await r.text(), cuoi: url };
    const tiep = new URL(den, url);
    if (!TRANG_DUOC_MO.test(tiep.hostname)) throw Object.assign(new Error("Link RedNote chuyển sang trang ngoài (" + tiep.hostname + ") – không mở."), { ma: 400 });
    url = tiep;
    if (TRANG_CHAN.test(url.pathname)) return { r, html: "", cuoi: url };
  }
  throw Object.assign(new Error("Link RedNote chuyển hướng quá nhiều lần."), { ma: 502 });
}

export async function layThongTinRednote(chu) {
  const link = layLink(chu);
  if (!link) throw Object.assign(new Error("Không thấy link RedNote (xiaohongshu.com hoặc xhslink.com) trong đoạn bạn dán."), { ma: 400 });
  // Mở trang như trình duyệt iPhone trước; trang đòi đăng nhập thì mở lại như trình duyệt máy tính
  let trang;
  for (const ua of [UA_IPHONE, UA]) {
    trang = await moTrang(link, ua);
    if (!TRANG_CHAN.test(trang.cuoi.pathname)) break;
  }
  const { r, html, cuoi } = trang;
  // Vẫn bị đưa tới trang đăng nhập / xác minh → không cố vượt qua, báo cách tải tay
  if (TRANG_CHAN.test(cuoi.pathname)) throw Object.assign(new Error(`RedNote chặn máy chủ tải hộ (bị đưa tới trang ${cuoi.pathname}). Cách nhanh: trong app RedNote bấm Chia sẻ → Lưu video (保存视频), rồi bấm 🎬 Chọn video ở trên và chọn video vừa lưu.`), { ma: 403 });
  const tt = docTrangThai(html);
  const bai = timBaiViet(tt);
  // Dự phòng: một số trang chỉ có thẻ og:video
  const og = html.match(/<meta[^>]+(?:name|property)="og:video"[^>]+content="([^"]+)"/)?.[1];
  const cacLink = [...(chonVideo(bai) || []), ...(og ? [sachLink(og)] : [])]
    .filter((u, i, a) => a.indexOf(u) === i)
    .filter((u) => { try { return VIDEO_DUOC_TAI.test(new URL(u).hostname); } catch { return false; } });
  if (!cacLink.length) {
    if (bai && bai.type && bai.type !== "video") throw Object.assign(new Error("Bài RedNote này là ảnh, không có video."), { ma: 404 });
    throw Object.assign(new Error(`Không tìm thấy video trong trang (mã ${r.status}). Có thể link đã hết hạn hoặc bài bị ẩn – thử mở link trong RedNote, bấm Chia sẻ → Sao chép link lại.`), { ma: 404 });
  }
  const tieuDe = String(bai?.title || bai?.desc || "").replace(/\s+/g, " ").trim().slice(0, 60);
  return { cacLink, tieuDe };
}

// Tải file video về qua máy chủ (chuyển thẳng từng phần, không giữ cả file trong bộ nhớ)
export async function taiVideoRednote(cacLink) {
  let loiCuoi = "";
  for (const u of cacLink.slice(0, 6)) {
    let url;
    try { url = new URL(u); } catch { continue; }
    if (url.protocol !== "https:" || !VIDEO_DUOC_TAI.test(url.hostname)) continue;
    const r = await fetch(url.href, { headers: { "User-Agent": UA, Referer: "https://www.xiaohongshu.com/" } });
    if (r.ok && r.body) {
      // Vài byte đầu phải là MP4 (…ftyp) hoặc WebM (1A 45 DF A3), không phải trang web báo lỗi
      const doc = r.body.getReader();
      let dau = new Uint8Array(0), xong = false;
      while (dau.length < 12 && !xong) {
        const { done, value } = await doc.read();
        if (done) xong = true;
        else { const n = new Uint8Array(dau.length + value.length); n.set(dau); n.set(value, dau.length); dau = n; }
      }
      const laMp4 = dau.length >= 8 && String.fromCharCode(...dau.subarray(4, 8)) === "ftyp";
      const laWebm = dau[0] === 0x1a && dau[1] === 0x45 && dau[2] === 0xdf && dau[3] === 0xa3;
      if (laMp4 || laWebm) {
        const h = { "Content-Type": laWebm ? "video/webm" : "video/mp4", "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Content-Length" };
        if (r.headers.get("content-length")) h["Content-Length"] = r.headers.get("content-length");
        const luong = new ReadableStream({
          start(c) { if (dau.length) c.enqueue(dau); if (xong) c.close(); },
          async pull(c) { const { done, value } = await doc.read(); done ? c.close() : c.enqueue(value); },
          cancel() { doc.cancel(); },
        });
        return new Response(luong, { headers: h });
      }
      doc.cancel().catch(() => {});
      loiCuoi = "file tải về không phải video";
      continue;
    }
    loiCuoi = `mã ${r.status}`;
  }
  throw Object.assign(new Error("Không tải được file video từ RedNote (" + (loiCuoi || "không có link hợp lệ") + ")."), { ma: 502 });
}
