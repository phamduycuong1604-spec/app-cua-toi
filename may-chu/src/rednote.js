// =====================================================
// TẢI VIDEO TỪ LINK REDNOTE / XIAOHONGSHU (小红书)
// Người dùng dán link chia sẻ (có thể lẫn chữ Trung xung quanh) →
//  1. lấy link trong đoạn chữ, mở trang bài viết (link rút gọn xhslink tự chuyển tiếp)
//  2. đọc dữ liệu bài viết có sẵn trong trang (window.__INITIAL_STATE__) → địa chỉ file video
//  3. app gọi /ai/rednote-tai để máy chủ tải hộ file video (trình duyệt bị chặn tải thẳng)
// =====================================================
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const TRANG_DUOC_MO = /(^|\.)(xiaohongshu\.com|xhslink\.com|rednote\.com)$/;
export const VIDEO_DUOC_TAI = /(^|\.)(xhscdn\.com|xhscdn\.net|xiaohongshu\.com)$/;

// Lấy link đầu tiên trong đoạn chữ chia sẻ
export function layLink(chu) {
  const m = String(chu || "").match(/https?:\/\/[^\s，。！？、"'<>）)]+/);
  if (!m) return null;
  try {
    const u = new URL(m[0]);
    return TRANG_DUOC_MO.test(u.hostname) ? u : null;
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

export async function layThongTinRednote(chu) {
  const link = layLink(chu);
  if (!link) throw Object.assign(new Error("Không thấy link RedNote (xiaohongshu.com hoặc xhslink.com) trong đoạn bạn dán."), { ma: 400 });
  const r = await fetch(link.href, { headers: { "User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8", Accept: "text/html" }, redirect: "follow" });
  const html = await r.text();
  const cuoi = new URL(r.url || link.href);
  // RedNote chặn máy chủ (trang đăng nhập / xác minh chống máy tự động) → không cố vượt qua, báo cách tải tay
  if (/\/(login|website-login|captcha|404)/.test(cuoi.pathname)) throw Object.assign(new Error("RedNote chặn máy chủ tải hộ (bắt đăng nhập/xác minh). Cách nhanh: trong app RedNote bấm Chia sẻ → Lưu video (保存视频), rồi bấm 🎬 Chọn video ở trên và chọn video vừa lưu."), { ma: 403 });
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
      const h = { "Content-Type": "video/mp4", "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Content-Length" };
      if (r.headers.get("content-length")) h["Content-Length"] = r.headers.get("content-length");
      return new Response(r.body, { headers: h });
    }
    loiCuoi = `mã ${r.status}`;
  }
  throw Object.assign(new Error("Không tải được file video từ RedNote (" + (loiCuoi || "không có link hợp lệ") + ")."), { ma: 502 });
}
