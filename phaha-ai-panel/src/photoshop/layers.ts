// Chèn ảnh kết quả vào Photoshop thành LAYER MỚI (có mask mềm), không đụng vào ảnh gốc.
import { app, imaging } from "photoshop";
import { batchPlay } from "./modal";
import { findDoc, PhotoshopError } from "./document";
import type { GrayImage, RGBAImage } from "../lib/image";

export interface LayerPayload {
  name: string;
  image: RGBAImage;
  /** Vị trí góc trên-trái trong tài liệu (px). */
  left: number;
  top: number;
  /** Mask cùng kích thước với image (đã làm mềm mép). */
  mask?: GrayImage;
  /** 0..100 */
  opacity?: number;
}

type Depth = 8 | 16 | 32;

function docDepth(doc: any): Depth {
  const b = String(doc.bitsPerChannel || "");
  if (b.includes("16")) return 16;
  if (b.includes("32")) return 32;
  return 8;
}

/** Đổi dữ liệu 8-bit sang đúng độ sâu màu của tài liệu (8/16/32-bit). */
function toDepth(data: Uint8Array, depth: Depth): Uint8Array | Uint16Array | Float32Array {
  if (depth === 8) return data;
  if (depth === 16) {
    // Photoshop 16-bit dùng thang 0..32768
    const out = new Uint16Array(data.length);
    for (let i = 0; i < data.length; i++) out[i] = Math.round((data[i] * 32768) / 255);
    return out;
  }
  const out = new Float32Array(data.length);
  for (let i = 0; i < data.length; i++) out[i] = data[i] / 255;
  return out;
}

function checkColorMode(doc: any) {
  const mode = String(doc.mode || "");
  if (mode && !mode.startsWith("RGB")) {
    throw new PhotoshopError(
      "Ảnh đang không ở chế độ màu RGB. Vào Image > Mode > RGB Color rồi thử lại.",
    );
  }
}

/**
 * Chèn nhiều layer vào tài liệu `docId`. PHẢI gọi bên trong runModal.
 * Trả về id các layer đã tạo.
 */
export async function insertLayers(docId: number, layers: LayerPayload[]): Promise<number[]> {
  const doc = findDoc(docId);
  if (!doc) throw new PhotoshopError("Ảnh gốc đã bị đóng.");
  checkColorMode(doc);
  if (app.activeDocument?.id !== docId) app.activeDocument = doc;
  const depth = docDepth(doc);
  const ids: number[] = [];

  for (const l of layers) {
    const layer = await doc.createPixelLayer({ name: l.name.slice(0, 250) } as any);
    if (!layer) throw new PhotoshopError("Không tạo được layer mới.");
    ids.push(layer.id);

    const imageData = await imaging.createImageDataFromBuffer(toDepth(l.image.data, depth), {
      width: l.image.width,
      height: l.image.height,
      components: 4,
      chunky: true,
      colorProfile: "sRGB IEC61966-2.1",
      colorSpace: "RGB",
    } as any);
    try {
      await imaging.putPixels({
        documentID: docId,
        layerID: layer.id,
        imageData,
        replace: true,
        targetBounds: { left: Math.round(l.left), top: Math.round(l.top) },
        commandName: "PhaHa AI",
      } as any);
    } finally {
      imageData.dispose();
    }

    if (l.mask) {
      // Chọn đúng layer vừa tạo rồi thêm mask "hiện tất cả", sau đó ghi đè nội dung mask.
      await batchPlay([
        { _obj: "select", _target: [{ _ref: "layer", _id: layer.id }], makeVisible: false },
        {
          _obj: "make",
          new: { _class: "channel" },
          at: { _ref: "channel", _enum: "channel", _value: "mask" },
          using: { _enum: "userMaskEnabled", _value: "revealAll" },
        },
      ]);
      const maskData = await imaging.createImageDataFromBuffer(toDepth(l.mask.data, depth), {
        width: l.mask.width,
        height: l.mask.height,
        components: 1,
        chunky: true,
        colorProfile: "Gray Gamma 2.2",
        colorSpace: "Grayscale",
      } as any);
      try {
        await imaging.putLayerMask({
          documentID: docId,
          layerID: layer.id,
          imageData: maskData,
          replace: true,
          targetBounds: { left: Math.round(l.left), top: Math.round(l.top) },
          commandName: "PhaHa AI mask",
        } as any);
      } finally {
        maskData.dispose();
      }
    }

    if (l.opacity != null && l.opacity < 100) layer.opacity = Math.max(0, Math.min(100, l.opacity));
  }
  return ids;
}

/** Đổi độ mờ của layer theo id (dùng cho thanh trượt sau khi đã tạo). Gọi trong runModal. */
export function setLayerOpacity(docId: number, layerIds: number[], opacity: number) {
  const doc = findDoc(docId);
  if (!doc) return;
  const want = new Set(layerIds);
  const walk = (layers: any) => {
    for (const l of layers) {
      if (want.has(l.id)) l.opacity = opacity;
      if (l.layers) walk(l.layers);
    }
  };
  walk(doc.layers);
}

/** Phóng to cả tài liệu (dùng cho Upscale trước khi chèn layer AI). Gọi trong runModal. */
export async function resizeDocument(docId: number, width: number, height: number) {
  const doc = findDoc(docId);
  if (!doc) throw new PhotoshopError("Ảnh gốc đã bị đóng.");
  if (app.activeDocument?.id !== docId) app.activeDocument = doc;
  if (doc.width !== width || doc.height !== height) await doc.resizeImage(width, height);
}
