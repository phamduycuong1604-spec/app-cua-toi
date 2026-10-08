// Bổ sung các hàm mà một số bản Photoshop (UXP) có thể thiếu. PHẢI được import đầu tiên.
const g = globalThis as any;

if (typeof g.TextEncoder !== "function") {
  g.TextEncoder = class {
    encoding = "utf-8";
    encode(str = ""): Uint8Array {
      const out: number[] = [];
      for (let i = 0; i < str.length; i++) {
        let c = str.charCodeAt(i);
        if (c >= 0xd800 && c < 0xdc00 && i + 1 < str.length) {
          const d = str.charCodeAt(i + 1);
          if (d >= 0xdc00 && d < 0xe000) {
            c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
            i++;
          }
        }
        if (c < 0x80) out.push(c);
        else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
        else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
        else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      }
      return new Uint8Array(out);
    }
  };
}

if (typeof g.TextDecoder !== "function") {
  g.TextDecoder = class {
    constructor(public encoding = "utf-8") {}
    decode(input?: ArrayBuffer | ArrayBufferView): string {
      if (!input) return "";
      const b =
        input instanceof Uint8Array
          ? input
          : ArrayBuffer.isView(input)
            ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
            : new Uint8Array(input as ArrayBuffer);
      if (/latin1|iso-8859-1/i.test(this.encoding)) {
        let s = "";
        for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
        return s;
      }
      let s = "";
      for (let i = 0; i < b.length; ) {
        const c = b[i++];
        let cp = c;
        if (c >= 0xf0) cp = ((c & 7) << 18) | ((b[i++] & 63) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63);
        else if (c >= 0xe0) cp = ((c & 15) << 12) | ((b[i++] & 63) << 6) | (b[i++] & 63);
        else if (c >= 0xc0) cp = ((c & 31) << 6) | (b[i++] & 63);
        if (cp >= 0x10000) {
          cp -= 0x10000;
          s += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 1023));
        } else s += String.fromCharCode(cp);
      }
      return s;
    }
  };
}

export {};
