import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { fileURLToPath } from "node:url";
const THU_MUC = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(process.env.PLAYWRIGHT || "/opt/node-tools/node_modules/playwright/index.mjs");
const ROOT = path.resolve(THU_MUC, "../..");
const T = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png" };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(q.url.split("?")[0]).replace(/\/$/, "/index.html")); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { "Content-Type": T[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r); }).listen(8782);
const b = await chromium.launch();
const kho = {}; let capNhat = 1000; const nhanDuoc = [];
const J = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
async function mo(ten, caiDat, dongBo) {
  const ctx = await b.newContext(); const p = await ctx.newPage({ viewport: { width: 400, height: 900 } });
  const loi = []; p.on("pageerror", (e) => loi.push(e.message)); p.on("dialog", (d) => { p.__hoi = d.message(); d.accept(); });
  await p.route("https://viec-hom-nay-nhac.phamduycuong1604.workers.dev/**", async (rt) => { const u = new URL(rt.request().url()); const m = rt.request().method();
    if (m === "OPTIONS") return rt.fulfill({ status: 204, headers: { ...J, "Access-Control-Allow-Headers": "*" } });
    if (rt.request().headers().authorization !== "Bearer VE") return rt.fulfill({ status: 401, headers: J, body: "{}" });
    if (u.pathname === "/du-lieu" && m === "GET") return rt.fulfill({ headers: J, body: JSON.stringify(kho) });
    if (u.pathname === "/du-lieu/dich-video" && m === "PUT") { const g = JSON.parse(rt.request().postData()).giaTri; nhanDuoc.push(JSON.stringify(g)); kho["dich-video"] = { giaTri: g, capNhat: ++capNhat }; return rt.fulfill({ headers: J, body: JSON.stringify({ capNhat }) }); }
    rt.fulfill({ headers: J, body: "{}" }); });
  await p.route(/^https:\/\/(?!viec-hom-nay).*/, (rt) => rt.fulfill({ status: 200, body: "" }));
  await p.goto("http://localhost:8782/dich-video/");
  await p.evaluate(([cd, db]) => { localStorage.clear(); localStorage.setItem("ve-dang-nhap", "VE"); if (cd) localStorage.setItem("phaha-dv-cai-dat", JSON.stringify(cd)); if (db) localStorage.setItem("phaha-dv-dong-bo", JSON.stringify(db)); }, [caiDat, dongBo]);
  await p.reload(); await p.waitForTimeout(2500);
  return { p, loi, ten };
}
const doc = (p) => p.evaluate(() => ({ cd: JSON.parse(localStorage.getItem("phaha-dv-cai-dat") || "{}"), db: JSON.parse(localStorage.getItem("phaha-dv-dong-bo") || "{}") }));
async function bamDongBo(m, mk) {
  if (!(await m.p.$eval("#hop-cai-dat", (d) => d.open))) await m.p.click("#nut-cai-dat"); await m.p.$eval("#muc-dong-bo", (d) => (d.open = true));
  if (mk) await m.p.fill("#o-mk-dong-bo", mk);
  await m.p.click("#nut-dong-bo");
  await m.p.waitForFunction(() => !document.getElementById("nut-dong-bo").disabled, null, { timeout: 30000 }).catch(() => {});
  await m.p.waitForTimeout(1500);
  return (await m.p.textContent("#tt-dong-bo").catch(() => "(trang tải lại)"));
}
// Máy 1: có đủ mã, đặt mật khẩu, bấm đồng bộ
const A = await mo("A", { khoa: "GEM-A", dp: { ds: "sk-ds", groq: "gsk-A" }, dv: { fpt: { khoa: "fpt-A", giong: "leminh" } }, capNhat: 5 });
console.log("A bấm:", await bamDongBo(A, "matkhau123"));
console.log("máy chủ có:", !!kho["dich-video"], "· không lộ mã:", !nhanDuoc.join("").includes("GEM-A") && !nhanDuoc.join("").includes("gsk-A"));
// Máy 2: mới tinh, nhập SAI mật khẩu
const B = await mo("B", null, null);
console.log("B sai mk:", await bamDongBo(B, "saimatkhau"), "| hỏi:", B.p.__hoi);
// Máy 2: nhập đúng mật khẩu
B.p.__hoi = null;
console.log("B đúng mk:", await bamDongBo(B, "matkhau123"), "| hỏi:", B.p.__hoi);
await B.p.waitForTimeout(2500);
let s = await doc(B.p);
console.log("B sau khi lấy về: gemini", s.cd.khoa, "groq", s.cd.dp?.groq, "fpt", s.cd.dv?.fpt?.khoa, s.cd.dv?.fpt?.giong, "· mk giữ lại:", s.db.mk);
// Máy 2 đổi giọng FPT rồi lưu → tự gửi lên
await B.p.click("#nut-cai-dat"); await B.p.$eval(".dv-doc[data-dv=fpt]", (d) => (d.open = true));
await B.p.selectOption("#o-giong-fpt", "lannhi"); await B.p.click("#hop-cai-dat button[value=luu]");
await B.p.waitForTimeout(5000);
console.log("sau khi B lưu: số lần gửi lên =", nhanDuoc.length);
// Máy 1 mở lại app → tự lấy bản mới
await A.p.reload(); await A.p.waitForTimeout(5000);
s = await doc(A.p);
console.log("A sau khi mở lại: giọng fpt =", s.cd.dv?.fpt?.giong, "· gemini vẫn", s.cd.khoa);
console.log("lỗi trang:", A.loi, B.loi);
await b.close(); srv.close();
