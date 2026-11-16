// Kiểm tra bước làm sạch từng đoạn giọng đọc (lamGon): cắt tạp âm "xoẹt" ở 2 đầu, giữ phụ âm, bỏ lệch DC, 2 đầu êm
// Chạy: node am-thanh-test.mjs   (dùng cho cả dich-video lẫn pha-rednote/web/phaha)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const R = 24000, sec = (s) => Math.round(s * R);
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
const im = (s) => new Float32Array(sec(s));
const nhieu = (s, a) => Float32Array.from({ length: sec(s) }, () => rnd() * a);
const giong = (s, a) => Float32Array.from({ length: sec(s) }, (_, i) => (a * (Math.sin((2 * Math.PI * 180 * i) / R) + 0.5 * Math.sin((2 * Math.PI * 360 * i) / R))) / 1.5);
const noi = (...p) => { const x = new Float32Array(p.reduce((t, q) => t + q.length, 0)); let o = 0; for (const q of p) { x.set(q, o); o += q.length; } return x; };

for (const goc of ["../am-thanh.js", "../../pha-rednote/web/phaha/am-thanh.js"]) {
  const tep = new URL(goc, import.meta.url);
  if (!fs.existsSync(tep)) continue;
  // thay phần import (nen.js, loi-noi.js cần trình duyệt) bằng bản giả để chạy được trên Node
  const ma = fs.readFileSync(tep, "utf8").replace(/^import .*$/gm, "").replace(/^/, "const TAN_SO_DOC = 24000; const boChuThichAmThanh = (x) => x;\n");
  const tam = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "am-")), "am-thanh.mjs");
  fs.writeFileSync(tam, ma);
  const { lamGon } = await import(tam);

  // tạp âm đầu – lặng – phụ âm "x" – lời đọc – lặng – tạp âm "xoẹt" cuối, cộng lệch DC
  const x = noi(nhieu(0.1, 0.06), im(0.08), nhieu(0.08, 0.1), giong(1.0, 0.3), im(0.1), nhieu(0.15, 0.12), im(0.05)).map((v) => v + 0.02);
  const y = lamGon(x);
  const dai = y.length / R;
  assert.ok(dai > 1.1 && dai < 1.2, `${goc}: cắt sai độ dài ${dai.toFixed(3)} giây (mong 1,14: giữ phụ âm + lời, bỏ tạp âm 2 đầu)`);
  assert.ok(Math.abs(y.reduce((t, v) => t + v, 0) / y.length) < 0.002, `${goc}: còn lệch DC`);
  assert.ok(Math.abs(y[0]) < 1e-3 && Math.abs(y[y.length - 1]) < 1e-3, `${goc}: 2 đầu không êm (dễ kêu "tách")`);
  assert.ok(Math.max(...y.map(Math.abs)) <= 0.98, `${goc}: vọt quá ±0,98`);
  // tạp âm nhỏ không bị khuếch đại quá 2 lần
  const nho = lamGon(noi(giong(0.5, 0.02)));
  assert.ok(Math.max(...nho.map(Math.abs)) < 0.06, `${goc}: khuếch đại quá tay`);
  // không bao giờ trả về rỗng khi có âm thanh (kể cả âm thanh lạ: chỉ DC, vài mẫu đổi dấu)
  assert.ok(lamGon(new Float32Array(2400).fill(0.3)).length > 0, `${goc}: đoạn chỉ có DC bị xoá sạch`);
  assert.ok(lamGon(Float32Array.from([0.37, -0.37, 0.37, -0.37])).length === 4, `${goc}: đoạn ngắn bị xoá`);
  // 2 lượt đọc to nhỏ khác nhau → sau khi làm sạch to đều nhau (chuyển đoạn không bị chỗ to chỗ nhỏ)
  const doTo = (v) => Math.sqrt(v.reduce((t, x) => t + x * x, 0) / v.length);
  const a1 = lamGon(giong(1, 0.2)), a2 = lamGon(giong(1, 0.5));
  assert.ok(Math.abs(doTo(a1) / doTo(a2) - 1) < 0.1, `${goc}: 2 đoạn to nhỏ khác nhau (${doTo(a1).toFixed(3)} / ${doTo(a2).toFixed(3)})`);
  console.log(`✅ ${goc}: làm sạch giọng đúng (${dai.toFixed(2)} giây)`);
}
