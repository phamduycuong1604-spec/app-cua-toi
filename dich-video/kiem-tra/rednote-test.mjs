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
const MP4 = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 1, 2, 3]); // "....ftypisom…"
const chuyen = (den) => new Response(null, { status: 302, headers: { location: den } });
const html = (x) => new Response(x, { headers: { "content-type": "text/html" } });
globalThis.fetch = async (url, o) => {
  const u = String(url), ua = o.headers["User-Agent"];
  if (u.includes("xhslink.com/a/")) return chuyen("https://www.xiaohongshu.com/discovery/item/abc?xsec_token=T1&xsec_source=app_share");
  if (u.includes("xhslink.com/ra/")) return chuyen("https://evil.com/x");
  if (u.includes("/discovery/item/abc")) { kq.push("   trang: " + u.split("?")[1]); return html(trang(ttMay)); }
  if (u.includes("/explore/chanIphone")) return /iPhone/.test(ua) ? chuyen("/website-login/captcha?x=1") : html(trang(ttMay));
  if (trangGia[u]) return trangGia[u].den ? chuyen(trangGia[u].den) : html(trangGia[u].html);
  if (u.includes("xhscdn.com")) {
    kq.push("   tải: " + u + " · Referer " + o.headers.Referer);
    if (u.includes("h264.mp4")) return new Response(MP4, { headers: { "content-length": String(MP4.length) } });
    if (u.includes("loi.html")) return new Response("<html>bị chặn</html>");
    return new Response("", { status: 403 });
  }
  throw new Error("không mong đợi " + u);
};

ok("lấy link trong đoạn chữ chia sẻ", layLink("54 小明发布了一篇小红书笔记，快来看吧！ 😆 abc 😆 http://xhslink.com/a/AbCd123，复制本条信息")?.href === "http://xhslink.com/a/AbCd123");
ok("từ chối link trang khác", layLink("https://evil.com/x") === null);
const t1 = await layThongTinRednote("xem nè http://xhslink.com/a/AbCd123，复制");
ok("chọn h264 trước, rồi h265, link gốc, og:video", JSON.stringify(t1.cacLink) === JSON.stringify(["https://sns-video-bd.xhscdn.com/h264.mp4", "https://sns-bak-v1.xhscdn.com/h264b.mp4", "https://sns-video-hw.xhscdn.com/h265.mp4", "https://sns-video-bd.xhscdn.com/pre_post/goc", "https://sns-video-hw.xhscdn.com/og.mp4"]));
ok("lấy tiêu đề", t1.tieuDe === "调色教程");
trangGia["https://www.xiaohongshu.com/explore/anh1"] = { html: trang(ttAnh).replace(/<meta[^>]+>/, "") };
await layThongTinRednote("https://www.xiaohongshu.com/explore/anh1").then(() => ok("bài ảnh báo lỗi", false), (e) => ok("bài ảnh báo lỗi: " + e.message, /ảnh/.test(e.message)));
trangGia["https://www.xiaohongshu.com/explore/dn"] = { den: "https://www.xiaohongshu.com/login?redirect=x" };
await layThongTinRednote("https://www.xiaohongshu.com/explore/dn").then(() => ok("bắt đăng nhập", false), (e) => ok("bắt đăng nhập: " + e.message, /Lưu video/.test(e.message)));
await layThongTinRednote("không có link").then(() => ok("không có link", false), (e) => ok("không có link: " + e.message, e.ma === 400));
ok("bỏ dấu câu cuối link", layLink("xem http://xhslink.com/a/AbC123.")?.href === "http://xhslink.com/a/AbC123");
ok("không nhận link có mật khẩu / cổng lạ", layLink("https://a:b@www.xiaohongshu.com/x") === null && layLink("https://www.xiaohongshu.com:8080/x") === null);
ok("không nhận địa chỉ IP", layLink("http://1.2.3.4/x") === null);
const t2 = await layThongTinRednote("https://www.xiaohongshu.com/explore/chanIphone");
ok("iPhone bị chặn → thử lại như máy tính được", t2.cacLink.length === 5);
await layThongTinRednote("http://xhslink.com/ra/xyz").then(() => ok("chặn chuyển hướng ra ngoài", false), (e) => ok("chặn chuyển hướng ra ngoài: " + e.message, /ngoài/.test(e.message)));
const r = await taiVideoRednote(["https://evil.com/a.mp4", "https://sns-video-hw.xhscdn.com/h265.mp4", "https://sns-video-bd.xhscdn.com/h264.mp4"]);
const byte = new Uint8Array(await r.arrayBuffer());
ok("tải: bỏ link lạ, link lỗi thì thử link sau, đủ byte", byte.length === MP4.length && byte[14] === 3 && r.headers.get("Content-Type") === "video/mp4");
await taiVideoRednote(["https://sns-video-bd.xhscdn.com/loi.html"]).then(() => ok("từ chối trang web giả làm video", false), (e) => ok("từ chối trang web giả làm video: " + e.message, /không phải video/.test(e.message)));
await taiVideoRednote(["https://evil.com/a.mp4"]).then(() => ok("chặn tải từ trang lạ", false), (e) => ok("chặn tải từ trang lạ", e.ma === 502));
console.log(kq.join("\n"));
