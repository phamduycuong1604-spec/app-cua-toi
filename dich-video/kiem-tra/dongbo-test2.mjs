// Tái hiện lỗi: máy TRỐNG đồng bộ trước, rồi máy ĐẦY ĐỦ (chưa từng đồng bộ) mở app / bấm đồng bộ
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { fileURLToPath } from "node:url";
const THU_MUC = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(process.env.PLAYWRIGHT || "/opt/node-tools/node_modules/playwright/index.mjs");
const ROOT = path.resolve(THU_MUC, "../..");
const T = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png" };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split("?")[0]).replace(/\/$/, "/index.html")); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { "Content-Type": T[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r); }).listen(8783);
const b = await chromium.launch();
const kho = {}, lichSu = []; let capNhat = 1000;
const J = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
async function mo(caiDat, dongBo, traLoi) {
  const ctx = await b.newContext(); const p = await ctx.newPage({ viewport: { width: 400, height: 900 } });
  const loi = [], hoi = []; p.on("pageerror", (e) => loi.push(e.message));
  p.on("dialog", (d) => { hoi.push(d.message().split("\n")[0]); const tl = traLoi.shift(); tl === false ? d.dismiss() : d.accept(); });
  await p.route("https://viec-hom-nay-nhac.phamduycuong1604.workers.dev/**", async (rt) => { const u = new URL(rt.request().url()); const m = rt.request().method();
    if (m === "OPTIONS") return rt.fulfill({ status: 204, headers: { ...J, "Access-Control-Allow-Headers": "*" } });
    if (u.pathname === "/du-lieu" && m === "GET") return rt.fulfill({ headers: J, body: JSON.stringify(kho) });
    if (u.pathname === "/du-lieu/dich-video" && m === "PUT") { if (kho["dich-video"]) lichSu.unshift({ ma: lichSu.length + 1, phan: "dich-video", luc: kho["dich-video"].capNhat, gia_tri: kho["dich-video"].giaTri }); kho["dich-video"] = { giaTri: JSON.parse(rt.request().postData()).giaTri, capNhat: ++capNhat }; return rt.fulfill({ headers: J, body: JSON.stringify({ capNhat }) }); }
    if (u.pathname === "/du-lieu/lich-su") return rt.fulfill({ headers: J, body: JSON.stringify({ banLuu: lichSu.map(({ ma, phan, luc }) => ({ ma, phan, luc })) }) });
    const k = /\/du-lieu\/lich-su\/(\d+)/.exec(u.pathname); if (k) { const x = lichSu.find((y) => y.ma == k[1]); return rt.fulfill({ headers: J, body: JSON.stringify({ phan: x.phan, luc: x.luc, giaTri: x.gia_tri }) }); }
    rt.fulfill({ headers: J, body: "{}" }); });
  await p.route(/^https:\/\/(?!viec-hom-nay).*/, (rt) => rt.fulfill({ status: 200, body: "" }));
  await p.goto("http://localhost:8783/dich-video/");
  await p.evaluate(([cd, db]) => { localStorage.clear(); localStorage.setItem("ve-dang-nhap", "VE"); if (cd) localStorage.setItem("phaha-dv-cai-dat", JSON.stringify(cd)); if (db) localStorage.setItem("phaha-dv-dong-bo", JSON.stringify(db)); }, [caiDat, dongBo]);
  await p.reload(); await p.waitForTimeout(3000);
  return { p, loi, hoi };
}
const doc = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("phaha-dv-cai-dat") || "{}"));
async function bam(m, mk) {
  if (!(await m.p.$eval("#hop-cai-dat", (d) => d.open))) await m.p.click("#nut-cai-dat");
  await m.p.$eval("#muc-dong-bo", (d) => (d.open = true));
  if (mk) await m.p.fill("#o-mk-dong-bo", mk);
  await m.p.click("#nut-dong-bo"); await m.p.waitForTimeout(3000);
  return m.p.textContent("#tt-dong-bo").catch(() => "(tải lại)");
}
const DAY = { khoa: "GEM", dp: { ds: "sk-ds", groq: "gsk" }, dv: { fpt: { khoa: "fpt" } } };
// 1) Máy B trống bấm đồng bộ trước (đồng ý gửi bản trống)
const B = await mo(null, null, [true]);
console.log("B trống bấm:", await bam(B, "mk123456"), "| hỏi:", B.hoi);
// 2) Máy A đầy đủ, đã đặt mật khẩu nhưng chưa đồng bộ lần nào → mở app (tự đồng bộ) KHÔNG được đè
const A = await mo(DAY, { mk: "mk123456" }, [false]);
console.log("A sau khi mở app: còn", (await doc(A.p)).khoa, (await doc(A.p)).dp?.groq, "| trạng thái:", await A.p.textContent("#tt-dong-bo"));
// 3) A bấm đồng bộ, chọn Huỷ (= giữ máy này & gửi lên)
console.log("A bấm (chọn giữ):", await bam(A), "| hỏi:", A.hoi);
console.log("A vẫn còn:", (await doc(A.p)).khoa);
// 4) B bấm lại → chỉ tài khoản có bản mới (nhiều mã hơn) → tự lấy về
B.hoi.length = 0;
console.log("B bấm lại:", await bam(B), "| hỏi:", B.hoi); await B.p.waitForTimeout(2500);
console.log("B sau khi lấy:", (await doc(B.p)).khoa, (await doc(B.p)).dv?.fpt?.khoa);
// 5) B có bản sao lưu trước khi bị thay + khôi phục được bản cũ trên tài khoản
await B.p.click("#nut-cai-dat"); await B.p.$eval("#muc-dong-bo", (d) => (d.open = true));
await B.p.click("#nut-khoi-phuc-cd"); await B.p.waitForTimeout(3000);
console.log("danh sách khôi phục:", (await B.p.textContent("#ds-khoi-phuc")).replace(/Khôi phục/g, " | "));
console.log("lỗi trang:", A.loi, B.loi);
await b.close(); srv.close();
