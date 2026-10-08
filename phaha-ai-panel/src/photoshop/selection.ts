// Đọc vùng chọn (selection) của Photoshop: khung bao + mask chi tiết (hỗ trợ lasso, feather...).
import { imaging } from "photoshop";
import { batchPlay } from "./modal";
import type { GrayImage } from "../lib/image";

import type { Bounds } from "../lib/bounds";

export { boundsWidth, boundsHeight, type Bounds } from "../lib/bounds";

function px(v: any): number {
  if (typeof v === "number") return v;
  if (v && typeof v._value === "number") return v._value;
  return 0;
}

/** Khung bao vùng chọn (đã cắt theo khổ ảnh), hoặc null nếu chưa chọn gì. */
export async function getSelectionBounds(docId: number, docWidth: number, docHeight: number): Promise<Bounds | null> {
  const [res] = await batchPlay([
    { _obj: "get", _target: [{ _property: "selection" }, { _ref: "document", _id: docId }] },
  ]);
  const sel = res?.selection;
  if (!sel || sel.top === undefined) return null;
  const b: Bounds = {
    left: Math.max(0, Math.floor(px(sel.left))),
    top: Math.max(0, Math.floor(px(sel.top))),
    right: Math.min(docWidth, Math.ceil(px(sel.right))),
    bottom: Math.min(docHeight, Math.ceil(px(sel.bottom))),
  };
  if (b.right - b.left < 2 || b.bottom - b.top < 2) return null;
  return b;
}

/**
 * Mask của vùng chọn trong khung `bounds` (255 = được chọn).
 * `size` để thu nhỏ khi gửi lên máy chủ. Gọi trong runModal.
 */
export async function getSelectionMask(
  docId: number,
  bounds: Bounds,
  size?: { width: number; height: number },
): Promise<GrayImage> {
  const opts: any = { documentID: docId, sourceBounds: bounds };
  if (size) opts.targetSize = size;
  const res = await imaging.getSelection(opts);
  try {
    const data = (await res.imageData.getData({ chunky: true })) as Uint8Array;
    return { width: res.imageData.width, height: res.imageData.height, data: new Uint8Array(data) };
  } finally {
    res.imageData.dispose();
  }
}
