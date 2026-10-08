// Mã hóa/giải mã base64 tự viết — UXP không chắc có sẵn btoa/atob.
const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const LOOKUP = new Uint8Array(256);
for (let i = 0; i < CHARS.length; i++) LOOKUP[CHARS.charCodeAt(i)] = i;
LOOKUP["-".charCodeAt(0)] = 62;
LOOKUP["_".charCodeAt(0)] = 63;

export function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  let chunk = "";
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const a = bytes[i];
    const b = i + 1 < len ? bytes[i + 1] : 0;
    const c = i + 2 < len ? bytes[i + 2] : 0;
    chunk +=
      CHARS[a >> 2] +
      CHARS[((a & 3) << 4) | (b >> 4)] +
      (i + 1 < len ? CHARS[((b & 15) << 2) | (c >> 6)] : "=") +
      (i + 2 < len ? CHARS[c & 63] : "=");
    if (chunk.length > 65536) {
      parts.push(chunk);
      chunk = "";
    }
  }
  parts.push(chunk);
  return parts.join("");
}

/** Nhận cả chuỗi base64 thuần lẫn "data:image/png;base64,...". */
export function base64ToBytes(input: string): Uint8Array {
  const comma = input.startsWith("data:") ? input.indexOf(",") : -1;
  const s = (comma >= 0 ? input.slice(comma + 1) : input).replace(/[^A-Za-z0-9+/_-]/g, "");
  const outLen = Math.floor((s.length * 3) / 4);
  const out = new Uint8Array(outLen);
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    const a = LOOKUP[s.charCodeAt(i)];
    const b = LOOKUP[s.charCodeAt(i + 1)];
    const c = i + 2 < s.length ? LOOKUP[s.charCodeAt(i + 2)] : 0;
    const d = i + 3 < s.length ? LOOKUP[s.charCodeAt(i + 3)] : 0;
    if (o < outLen) out[o++] = (a << 2) | (b >> 4);
    if (i + 2 < s.length && o < outLen) out[o++] = ((b & 15) << 4) | (c >> 2);
    if (i + 3 < s.length && o < outLen) out[o++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, o);
}
