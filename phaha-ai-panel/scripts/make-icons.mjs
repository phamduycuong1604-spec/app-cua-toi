// Vẽ icon PhaHa AI (ô vuông bo góc tím + ngôi sao lấp lánh trắng) ra PNG.
// Chạy: npm run icons
import { encode } from "fast-png";
import { writeFileSync, mkdirSync } from "node:fs";

function draw(size, { background }) {
  const data = new Uint8Array(size * size * 4);
  const r = size * 0.22; // bo góc
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      let a = 1;
      if (background) {
        // ô vuông bo góc
        const dx = Math.max(r - x, 0, x - (size - 1 - r));
        const dy = Math.max(r - y, 0, y - (size - 1 - r));
        a = Math.min(1, Math.max(0, r + 0.5 - Math.hypot(dx, dy)));
      }
      // ngôi sao 4 cánh: |dx|^0.5 + |dy|^0.5 <= k
      const nx = Math.abs(x - c) / (size * 0.42);
      const ny = Math.abs(y - c) / (size * 0.42);
      const star = Math.sqrt(nx) + Math.sqrt(ny);
      const s = Math.min(1, Math.max(0, (0.95 - star) * size * 0.25));
      const t = (x + y) / (2 * size);
      const bg = background ? [124 - 40 * t, 77 + 30 * t, 255 - 40 * t] : [230, 230, 230];
      if (background) {
        data[i] = bg[0] * (1 - s) + 255 * s;
        data[i + 1] = bg[1] * (1 - s) + 255 * s;
        data[i + 2] = bg[2] * (1 - s) + 255 * s;
        data[i + 3] = 255 * a;
      } else {
        data[i] = data[i + 1] = data[i + 2] = 230;
        data[i + 3] = 255 * s;
      }
    }
  }
  return encode({ width: size, height: size, data, channels: 4 });
}

mkdirSync("icons", { recursive: true });
writeFileSync("icons/panel.png", draw(23, { background: false }));
writeFileSync("icons/panel@2x.png", draw(46, { background: false }));
writeFileSync("icons/plugin.png", draw(48, { background: true }));
writeFileSync("icons/plugin@2x.png", draw(96, { background: true }));
writeFileSync("icons/logo.png", draw(64, { background: true }));
console.log("Đã vẽ icon vào thư mục icons/");
