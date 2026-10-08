// Lấy ảnh nguồn từ Photoshop trước khi gửi job: tài liệu, vùng chọn, ảnh JPEG, mask.
import { requireActiveDoc, PhotoshopError, type DocInfo } from "../photoshop/document";
import { getSelectionBounds, getSelectionMask, boundsHeight, boundsWidth, type Bounds } from "../photoshop/selection";
import { exportRegion, maskToDataUrl } from "../photoshop/export";
import { runModal } from "../photoshop/modal";
import { featherMask, fitSize, type GrayImage } from "../lib/image";
import { MASK_FEATHER_PX } from "../config";
import { padBounds } from "./placement";
import type { InsertTarget } from "../state/store";

export interface CaptureOptions {
  maxSide: number;
  /** none = cả ảnh; optional = có vùng chọn thì dùng; require = bắt buộc phải có vùng chọn */
  selection: "none" | "optional" | "require";
  /** Nới khung vùng chọn để AI thấy bối cảnh (0.15 = thêm 15% mỗi phía). */
  padding?: number;
  /** Có gửi mask vùng chọn lên máy chủ không. */
  uploadMask?: boolean;
  /** Vùng cụ thể (toạ độ tài liệu) — bỏ qua vùng chọn. */
  bounds?: Bounds;
}

export interface Captured {
  doc: DocInfo;
  bounds: Bounds;
  image: string;
  sentWidth: number;
  sentHeight: number;
  uploadMask?: string;
  selectionMask?: GrayImage;
  usedSelection: boolean;
}

export async function captureSource(opts: CaptureOptions): Promise<Captured> {
  const doc = requireActiveDoc();
  const full: Bounds = { left: 0, top: 0, right: doc.width, bottom: doc.height };
  let selBounds: Bounds | null = null;
  if (!opts.bounds && opts.selection !== "none") {
    selBounds = await getSelectionBounds(doc.id, doc.width, doc.height);
    if (!selBounds && opts.selection === "require") {
      throw new PhotoshopError("Bạn chưa chọn vùng. Dùng công cụ Lasso hoặc Marquee khoanh vùng cần sửa trước.");
    }
  }
  const usedSelection = !!selBounds;
  const bounds = opts.bounds ?? (selBounds ? padBounds(selBounds, opts.padding ?? 0.15, doc.width, doc.height) : full);
  const sent = fitSize(boundsWidth(bounds), boundsHeight(bounds), opts.maxSide);

  return runModal("PhaHa AI: đọc ảnh", async () => {
    const exported = await exportRegion(doc.id, bounds, opts.maxSide);
    let selectionMask: GrayImage | undefined;
    let uploadMask: string | undefined;
    if (usedSelection) {
      selectionMask = featherMask(await getSelectionMask(doc.id, bounds), MASK_FEATHER_PX);
      if (opts.uploadMask) uploadMask = maskToDataUrl(await getSelectionMask(doc.id, bounds, sent));
    }
    return {
      doc,
      bounds,
      image: exported.dataUrl,
      sentWidth: exported.width,
      sentHeight: exported.height,
      uploadMask,
      selectionMask,
      usedSelection,
    };
  });
}

/** Tạo thông tin "chèn vào đâu" từ ảnh vừa chụp. */
export function toTarget(
  src: Captured,
  layerName: string,
  extra: { opacity?: number; mode?: "overlay" | "upscale" } = {},
): InsertTarget {
  return {
    docId: src.doc.id,
    docTitle: src.doc.title,
    docWidth: src.doc.width,
    docHeight: src.doc.height,
    bounds: src.bounds,
    sentWidth: src.sentWidth,
    sentHeight: src.sentHeight,
    selectionMask: src.selectionMask,
    layerName,
    opacity: extra.opacity,
    mode: extra.mode ?? "overlay",
  };
}
