// Kiểm tra phần máy chủ đọc link RedNote (giả lập trang xiaohongshu, không cần mạng)
import { layLink, layThongTinRednote, taiVideoRednote } from "../../may-chu/src/rednote.js";
const kq = [];
const ok = (ten, dk) => { kq.push(`${dk ? "✅" : "❌"} ${ten}`); if (!dk) process.exitCode = 1; };

const trang = (tt) => `<html><head><meta name="og:video" content="https://sns-video-hw.xhscdn.com/og.mp4"></head><body><script>window.__INITIAL_STATE__=${tt}</script></body></html>`;
const ttMay = JSON.stringify({ note: { noteDetailMap: { abc: { note: { type: "video", title: "调色教程", video: { media: { stream: {
  h265: [{ videoCodec: "h265", height: 1080, masterUrl: "http:\\u002F\\u002Fsns-video-hw.xhscdn.com\\u002Fh265.mp4" }],
  h264: [{ videoCodec: "h264", height: 720, masterUrl: "http://sns-video-bd.xhscdn.com/h264.mp4", backupUrls: ["https://sns-bak-v1.xhscdn.com/h264b.mp4"] }] } }, consumer: { originVideoKey: "pre_post/goc" } } } } } } }).replace('"type"', 'x:undefined,"type"'.replace("x:", '"x":'));
const ttAnh = JSON.stringify({ note: { noteDetailMap: { a: { note: { type: "normal", title: "Ảnh" } } } } });

let trangGia = {};
globalThis.fetch = async (url, o) => {
  const u = String(url);
  if (u.includes("xhslink.com")) return { status: 200, url: "https://www.xiaohongshu.com/discovery/item/abc", text: async () => trang(ttMay) };
  if (u.includes("/login")) return { status: 200, url: u, text: async () => "" };
  if (trangGia[u]) return { status: 200, url: trangGia[u].url || u, text: async () => trangGia[u].html };
  if (u.includes("xhscdn.com")) { kq.push("   tải: " + u + " · Referer " + o.headers.Referer); return u.includes("h264.mp4") ? new Response("VIDEO", { headers: { "content-length": "5" } }) : new Response("", { status: 403 }); }
  throw new Error("không mong đợi " + u);
};

ok("lấy link trong đoạn chữ chia sẻ", layLink("54 小明发布了一篇小红书笔记，快来看吧！ 😆 abc 😆 http://xhslink.com/a/AbCd123，复制本条信息")?.href === "http://xhslink.com/a/AbCd123");
ok("từ chối link trang khác", layLink("https://evil.com/x") === null);
const t1 = await layThongTinRednote("xem nè http://xhslink.com/a/AbCd123，复制");
ok("chọn h264 trước, rồi h265, link gốc, og:video", JSON.stringify(t1.cacLink) === JSON.stringify(["https://sns-video-bd.xhscdn.com/h264.mp4", "https://sns-bak-v1.xhscdn.com/h264b.mp4", "https://sns-video-hw.xhscdn.com/h265.mp4", "https://sns-video-bd.xhscdn.com/pre_post/goc", "https://sns-video-hw.xhscdn.com/og.mp4"]));
ok("lấy tiêu đề", t1.tieuDe === "调色教程");
trangGia["https://www.xiaohongshu.com/explore/anh1"] = { html: trang(ttAnh).replace(/<meta[^>]+>/, "") };
await layThongTinRednote("https://www.xiaohongshu.com/explore/anh1").then(() => ok("bài ảnh báo lỗi", false), (e) => ok("bài ảnh báo lỗi: " + e.message, /ảnh/.test(e.message)));
trangGia["https://www.xiaohongshu.com/explore/dn"] = { url: "https://www.xiaohongshu.com/login?redirect=x", html: "" };
await layThongTinRednote("https://www.xiaohongshu.com/explore/dn").then(() => ok("bắt đăng nhập", false), (e) => ok("bắt đăng nhập: " + e.message, /Lưu video/.test(e.message)));
await layThongTinRednote("không có link").then(() => ok("không có link", false), (e) => ok("không có link: " + e.message, e.ma === 400));
const r = await taiVideoRednote(["https://evil.com/a.mp4", "https://sns-video-hw.xhscdn.com/h265.mp4", "https://sns-video-bd.xhscdn.com/h264.mp4"]);
ok("tải: bỏ link lạ, link lỗi thì thử link sau", (await r.text()) === "VIDEO" && r.headers.get("Content-Length") === "5");
await taiVideoRednote(["https://evil.com/a.mp4"]).then(() => ok("chặn tải từ trang lạ", false), (e) => ok("chặn tải từ trang lạ", e.ma === 502));
console.log(kq.join("\n"));
