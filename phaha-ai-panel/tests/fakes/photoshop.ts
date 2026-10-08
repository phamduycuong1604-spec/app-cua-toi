// Photoshop GIẢ cho test chạy bằng Node: ghi lại mọi lệnh panel gửi tới Photoshop.
import jpeg from "jpeg-js";

export const calls: { op: string; args: any }[] = [];
let nextLayerId = 100;

export const fakeState = {
  selection: null as null | { left: number; top: number; right: number; bottom: number },
};

function makeDoc(id: number, w: number, h: number) {
  return {
    id,
    title: `anh-${id}.jpg`,
    width: w,
    height: h,
    mode: "RGBColorMode",
    bitsPerChannel: "bitDepth8",
    layers: [] as any[],
    async createPixelLayer(opts: any) {
      const l = { id: nextLayerId++, name: opts?.name, opacity: 100 };
      this.layers.unshift(l);
      calls.push({ op: "createPixelLayer", args: opts });
      return l;
    },
    async resizeImage(w2: number, h2: number) {
      calls.push({ op: "resizeImage", args: [w2, h2] });
      this.width = w2;
      this.height = h2;
    },
  };
}

export const doc = makeDoc(1, 800, 600);
export const app: any = { activeDocument: doc, documents: [doc] };

export const core = {
  async executeAsModal(fn: any, opts: any) {
    calls.push({ op: "modal", args: opts.commandName });
    return fn({ hostControl: { suspendHistory: async () => "h", resumeHistory: async () => undefined } });
  },
};

export const action = {
  async batchPlay(descs: any[]) {
    return descs.map((d) => {
      calls.push({ op: "batchPlay:" + d._obj, args: d });
      if (d._obj === "get" && d._target?.[0]?._property === "selection") {
        const s = fakeState.selection;
        if (!s) return {};
        const u = (v: number) => ({ _unit: "pixelsUnit", _value: v });
        return { selection: { left: u(s.left), top: u(s.top), right: u(s.right), bottom: u(s.bottom) } };
      }
      return {};
    });
  },
  async addNotificationListener() {},
  async removeNotificationListener() {},
};

function imageData(width: number, height: number, components: number, data: Uint8Array) {
  return { width, height, components, componentSize: 8, async getData() { return data; }, async dispose() {} };
}

export const imaging = {
  async getPixels(o: any) {
    calls.push({ op: "getPixels", args: o });
    const { width, height } = o.targetSize;
    const d = new Uint8Array(width * height * 3).map((_, i) => (i * 7) & 255);
    return { imageData: imageData(width, height, 3, d), sourceBounds: o.sourceBounds, level: 0 };
  },
  async encodeImageData(o: any) {
    const im = o.imageData;
    const raw = await im.getData();
    const rgba = new Uint8Array(im.width * im.height * 4);
    for (let i = 0; i < im.width * im.height; i++) {
      rgba.set(raw.subarray(i * 3, i * 3 + 3), i * 4);
      rgba[i * 4 + 3] = 255;
    }
    return Buffer.from(jpeg.encode({ width: im.width, height: im.height, data: rgba }, 80).data).toString("base64");
  },
  async getSelection(o: any) {
    calls.push({ op: "getSelection", args: o });
    const b = o.sourceBounds;
    const w = o.targetSize?.width ?? b.right - b.left;
    const h = o.targetSize?.height ?? b.bottom - b.top;
    return { imageData: imageData(w, h, 1, new Uint8Array(w * h).fill(255)), sourceBounds: b };
  },
  async createImageDataFromBuffer(buf: any, o: any) {
    if (buf.length !== o.width * o.height * o.components) throw new Error("sai kích thước buffer");
    return { ...o, data: buf, async dispose() {} };
  },
  async putPixels(o: any) {
    calls.push({ op: "putPixels", args: { layerID: o.layerID, targetBounds: o.targetBounds, w: o.imageData.width, h: o.imageData.height } });
  },
  async putLayerMask(o: any) {
    calls.push({ op: "putLayerMask", args: { layerID: o.layerID, targetBounds: o.targetBounds, w: o.imageData.width, h: o.imageData.height } });
  },
};

export const constants = {};
