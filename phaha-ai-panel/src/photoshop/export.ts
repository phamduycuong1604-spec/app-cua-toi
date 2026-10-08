// Xuất ảnh từ Photoshop để gửi lên máy chủ AI.
import { imaging } from "photoshop";
import { bytesToBase64 } from "../lib/base64";
import { encodeGrayPng, encodeRGBAPng, fitSize, type GrayImage } from "../lib/image";
import { boundsHeight, boundsWidth, type Bounds } from "./selection";

export interface ExportedImage {
  /** "data:image/jpeg;base64,..." */
  dataUrl: string;
  /** Kích thước ảnh đã gửi (có thể nhỏ hơn vùng gốc). */
  width: number;
  height: number;
}

/**
 * Chụp ảnh tổng hợp (mọi layer đang hiện) trong khung `bounds`,
 * thu nhỏ để cạnh dài ≤ maxSide, mã hóa JPEG. Gọi trong runModal.
 */
export async function exportRegion(docId: number, bounds: Bounds, maxSide: number): Promise<ExportedImage> {
  const size = fitSize(boundsWidth(bounds), boundsHeight(bounds), maxSide);
  const res = await imaging.getPixels({
    documentID: docId,
    sourceBounds: bounds,
    targetSize: size,
    colorSpace: "RGB",
    colorProfile: "sRGB IEC61966-2.1",
    componentSize: 8,
    applyAlpha: true,
  } as any);
  const img = res.imageData;
  try {
    let dataUrl: string;
    try {
      const jpeg = await imaging.encodeImageData({ imageData: img, base64: true } as any);
      dataUrl = "data:image/jpeg;base64," + (jpeg as string);
    } catch {
      // Dự phòng: tự mã hóa PNG nếu encodeImageData lỗi.
      const raw = (await img.getData({ chunky: true })) as Uint8Array;
      const rgba = new Uint8Array(img.width * img.height * 4);
      const c = img.components;
      for (let i = 0, n = img.width * img.height; i < n; i++) {
        rgba[i * 4] = raw[i * c];
        rgba[i * 4 + 1] = raw[i * c + 1];
        rgba[i * 4 + 2] = raw[i * c + 2];
        rgba[i * 4 + 3] = c === 4 ? raw[i * c + 3] : 255;
      }
      dataUrl = "data:image/png;base64," + bytesToBase64(encodeRGBAPng({ width: img.width, height: img.height, data: rgba }));
    }
    return { dataUrl, width: img.width, height: img.height };
  } finally {
    img.dispose();
  }
}

export function maskToDataUrl(mask: GrayImage): string {
  return "data:image/png;base64," + bytesToBase64(encodeGrayPng(mask));
}
