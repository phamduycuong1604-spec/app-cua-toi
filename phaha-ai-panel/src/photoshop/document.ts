// Đọc thông tin tài liệu (ảnh) đang mở trong Photoshop.
import { app } from "photoshop";

export interface DocInfo {
  id: number;
  title: string;
  width: number;
  height: number;
}

export class PhotoshopError extends Error {}

export function getActiveDocInfo(): DocInfo | null {
  const doc = app.activeDocument;
  if (!doc) return null;
  return { id: doc.id, title: doc.title, width: doc.width, height: doc.height };
}

/** Lấy ảnh đang mở, nếu không có thì báo lỗi dễ hiểu. */
export function requireActiveDoc(): DocInfo {
  const info = getActiveDocInfo();
  if (!info) throw new PhotoshopError("Chưa mở ảnh nào trong Photoshop. Hãy mở một ảnh rồi thử lại.");
  return info;
}

export function findDoc(id: number) {
  for (const d of app.documents) if (d.id === id) return d;
  return null;
}

export function isDocOpen(id: number): boolean {
  return findDoc(id) != null;
}
