// Tính toán đặt layer kết quả vào đâu trong tài liệu (thuần JS, test được bằng Node).
import { cropGray, featherMask, resizeGray, resizeRGBA, type GrayImage, type RGBAImage } from "../lib/image";
import type { ResultLayer } from "../api/types";
import type { InsertTarget } from "../state/store";
import { boundsHeight, boundsWidth, type Bounds } from "../lib/bounds";

export interface Placement {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Nới khung vùng chọn ra thêm `ratio` mỗi phía để AI thấy bối cảnh xung quanh. */
export function padBounds(b: Bounds, ratio: number, docW: number, docH: number): Bounds {
  const px = Math.round(boundsWidth(b) * ratio);
  const py = Math.round(boundsHeight(b) * ratio);
  return {
    left: Math.max(0, b.left - px),
    top: Math.max(0, b.top - py),
    right: Math.min(docW, b.right + px),
    bottom: Math.min(docH, b.bottom + py),
  };
}

/** Layer kết quả nằm ở đâu, kích thước bao nhiêu trong tài liệu. */
export function placeLayer(target: InsertTarget, meta: ResultLayer, img: { width: number; height: number }): Placement {
  if (target.mode === "upscale") {
    // Ảnh phóng to sẽ thay khổ cả tài liệu; nếu máy chủ trả ảnh không lớn hơn thì phủ vừa khổ hiện tại.
    if (img.width > target.docWidth) return { left: 0, top: 0, width: img.width, height: img.height };
    return { left: 0, top: 0, width: target.docWidth, height: target.docHeight };
  }
  const sx = boundsWidth(target.bounds) / target.sentWidth;
  const sy = boundsHeight(target.bounds) / target.sentHeight;
  const hasRect = meta.x != null && meta.y != null;
  if (!hasRect) {
    return { left: target.bounds.left, top: target.bounds.top, width: boundsWidth(target.bounds), height: boundsHeight(target.bounds) };
  }
  const w = meta.width ?? img.width;
  const h = meta.height ?? img.height;
  return {
    left: Math.round(target.bounds.left + (meta.x as number) * sx),
    top: Math.round(target.bounds.top + (meta.y as number) * sy),
    width: Math.max(1, Math.round(w * sx)),
    height: Math.max(1, Math.round(h * sy)),
  };
}

function multiply(a: GrayImage, b: GrayImage): GrayImage {
  const out = new Uint8Array(a.data.length);
  for (let i = 0; i < out.length; i++) out[i] = Math.round((a.data[i] * b.data[i]) / 255);
  return { width: a.width, height: a.height, data: out };
}

/**
 * Chuẩn bị ảnh + mask cuối cùng cho 1 layer:
 * - đổi cỡ ảnh về đúng kích thước đặt vào tài liệu
 * - mask từ máy chủ (nếu có) được làm mềm mép
 * - ghép thêm mask vùng chọn (nếu người dùng chỉ sửa vùng chọn)
 */
export function prepareLayerPixels(
  target: InsertTarget,
  p: Placement,
  image: RGBAImage,
  serverMask: GrayImage | null,
  featherPx: number,
): { image: RGBAImage; mask?: GrayImage } {
  const img = image.width === p.width && image.height === p.height ? image : resizeRGBA(image, p.width, p.height);
  let mask: GrayImage | undefined;
  if (serverMask) {
    const m = serverMask.width === p.width && serverMask.height === p.height ? serverMask : resizeGray(serverMask, p.width, p.height);
    mask = featherMask(m, featherPx);
  }
  if (target.selectionMask && target.mode === "overlay") {
    const sel = cropGray(target.selectionMask, p.left - target.bounds.left, p.top - target.bounds.top, p.width, p.height);
    mask = mask ? multiply(mask, sel) : sel;
  }
  return { image: img, mask };
}
