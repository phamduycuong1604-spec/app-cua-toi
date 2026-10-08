// Xử lý ảnh thuần JS: giải mã PNG/JPEG, đổi kích thước, làm mềm mép mask.
// Không phụ thuộc Photoshop nên test được bằng Node.
import { decode as decodePng, encode as encodePng } from "fast-png";
import decodeJpeg from "jpeg-js/lib/decoder.js";

/** Ảnh màu 8-bit, 4 kênh RGBA xếp liền nhau. */
export interface RGBAImage {
  width: number;
  height: number;
  data: Uint8Array;
}

/** Ảnh xám 1 kênh (dùng cho mask/vùng chọn): 0 = ẩn, 255 = hiện. */
export interface GrayImage {
  width: number;
  height: number;
  data: Uint8Array;
}

function isPng(b: Uint8Array) {
  return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
}
function isJpeg(b: Uint8Array) {
  return b[0] === 0xff && b[1] === 0xd8;
}

/** Giải mã PNG hoặc JPEG ra RGBA 8-bit. */
export function decodeImage(bytes: Uint8Array): RGBAImage {
  if (isJpeg(bytes)) {
    const j = decodeJpeg(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 2048, maxResolutionInMP: 400 });
    return { width: j.width, height: j.height, data: j.data };
  }
  if (!isPng(bytes)) throw new Error("Ảnh trả về không phải PNG/JPEG");
  const png = decodePng(bytes);
  const { width, height, channels, depth } = png;
  const n = width * height;
  const out = new Uint8Array(n * 4);
  const src = png.data;

  if (png.palette) {
    if (depth !== 8) throw new Error("Chưa hỗ trợ PNG bảng màu dưới 8-bit");
    const pal = png.palette;
    const trans = png.transparency;
    for (let i = 0; i < n; i++) {
      const idx = src[i];
      const c = pal[idx] || [0, 0, 0];
      out[i * 4] = c[0];
      out[i * 4 + 1] = c[1];
      out[i * 4 + 2] = c[2];
      out[i * 4 + 3] = c.length > 3 ? c[3] : trans && idx < trans.length ? trans[idx] : 255;
    }
    return { width, height, data: out };
  }
  if (depth !== 8 && depth !== 16) throw new Error(`Chưa hỗ trợ PNG ${depth}-bit`);
  const shift = depth === 16 ? 8 : 0;
  for (let i = 0; i < n; i++) {
    const s = i * channels;
    let r: number, g: number, b: number, a = 255;
    if (channels <= 2) {
      r = g = b = src[s] >> shift;
      if (channels === 2) a = src[s + 1] >> shift;
    } else {
      r = src[s] >> shift;
      g = src[s + 1] >> shift;
      b = src[s + 2] >> shift;
      if (channels === 4) a = src[s + 3] >> shift;
    }
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = a;
  }
  return { width, height, data: out };
}

/** Giải mã ảnh mask: độ sáng × độ trong suốt → giá trị mask 0..255. */
export function decodeMask(bytes: Uint8Array): GrayImage {
  const img = decodeImage(bytes);
  const n = img.width * img.height;
  const out = new Uint8Array(n);
  const d = img.data;
  for (let i = 0; i < n; i++) {
    const lum = (d[i * 4] * 299 + d[i * 4 + 1] * 587 + d[i * 4 + 2] * 114) / 1000;
    out[i] = Math.round((lum * d[i * 4 + 3]) / 255);
  }
  return { width: img.width, height: img.height, data: out };
}

/** Đổi kích thước ảnh nhiều kênh bằng nội suy song tuyến (bilinear). */
function resizeChannels(src: Uint8Array, sw: number, sh: number, ch: number, dw: number, dh: number): Uint8Array {
  if (sw === dw && sh === dh) return src;
  const out = new Uint8Array(dw * dh * ch);
  const xr = sw / dw;
  const yr = sh / dh;
  for (let y = 0; y < dh; y++) {
    const fy = Math.max(0, (y + 0.5) * yr - 0.5);
    const y0 = Math.min(sh - 1, Math.floor(fy));
    const y1 = Math.min(sh - 1, y0 + 1);
    const wy = fy - y0;
    for (let x = 0; x < dw; x++) {
      const fx = Math.max(0, (x + 0.5) * xr - 0.5);
      const x0 = Math.min(sw - 1, Math.floor(fx));
      const x1 = Math.min(sw - 1, x0 + 1);
      const wx = fx - x0;
      const o = (y * dw + x) * ch;
      const a = (y0 * sw + x0) * ch;
      const b = (y0 * sw + x1) * ch;
      const c = (y1 * sw + x0) * ch;
      const d = (y1 * sw + x1) * ch;
      for (let k = 0; k < ch; k++) {
        const top = src[a + k] + (src[b + k] - src[a + k]) * wx;
        const bot = src[c + k] + (src[d + k] - src[c + k]) * wx;
        out[o + k] = Math.round(top + (bot - top) * wy);
      }
    }
  }
  return out;
}

export function resizeRGBA(img: RGBAImage, width: number, height: number): RGBAImage {
  return { width, height, data: resizeChannels(img.data, img.width, img.height, 4, width, height) };
}

export function resizeGray(img: GrayImage, width: number, height: number): GrayImage {
  return { width, height, data: resizeChannels(img.data, img.width, img.height, 1, width, height) };
}

/** Cắt một vùng chữ nhật từ ảnh xám (phần nằm ngoài ảnh gốc = 0). */
export function cropGray(img: GrayImage, left: number, top: number, width: number, height: number): GrayImage {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const sy = y + top;
    if (sy < 0 || sy >= img.height) continue;
    for (let x = 0; x < width; x++) {
      const sx = x + left;
      if (sx < 0 || sx >= img.width) continue;
      out[y * width + x] = img.data[sy * img.width + sx];
    }
  }
  return { width, height, data: out };
}

/** Làm mờ hộp (box blur) 1 lượt theo hàng rồi theo cột. */
function boxBlur(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  const size = r * 2 + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += src[row + Math.min(w - 1, Math.max(0, k))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = Math.round(sum / size);
      sum += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = Math.round(sum / size);
      sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/** Làm mềm mép mask khoảng `px` điểm ảnh (2 lượt box blur ≈ Gaussian). */
export function featherMask(mask: GrayImage, px: number): GrayImage {
  if (px <= 0) return mask;
  const r = Math.max(1, Math.round(px / 2));
  const once = boxBlur(mask.data, mask.width, mask.height, r);
  return { width: mask.width, height: mask.height, data: boxBlur(once, mask.width, mask.height, r) };
}

/** Mask đặc toàn bộ có phải toàn trắng không (khỏi cần tạo mask). */
export function isFullMask(mask: GrayImage): boolean {
  const d = mask.data;
  for (let i = 0; i < d.length; i++) if (d[i] !== 255) return false;
  return true;
}

export function encodeGrayPng(mask: GrayImage): Uint8Array {
  return encodePng({ width: mask.width, height: mask.height, data: mask.data, channels: 1, depth: 8 });
}

export function encodeRGBAPng(img: RGBAImage): Uint8Array {
  return encodePng({ width: img.width, height: img.height, data: img.data, channels: 4, depth: 8 });
}

/** Tính kích thước thu nhỏ để cạnh dài không vượt `maxSide` (không phóng to). */
export function fitSize(width: number, height: number, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
