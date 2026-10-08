// Mở / lưu file cho chế độ "Chạy hàng loạt" và chọn ảnh tham chiếu.
import { app } from "photoshop";
import { storage } from "uxp";
import { bytesToBase64 } from "../lib/base64";

const IMAGE_EXT = /\.(jpe?g|png|tiff?|psd|webp|heic)$/i;

/** Hộp thoại chọn 1 ảnh → trả về data URL (để gửi làm ảnh tham chiếu). */
export async function pickImageAsDataUrl(): Promise<{ name: string; dataUrl: string } | null> {
  const file = await storage.localFileSystem.getFileForOpening({ types: ["jpg", "jpeg", "png", "webp"] });
  if (!file) return null;
  const buf: ArrayBuffer = await file.read({ format: storage.formats.binary });
  const bytes = new Uint8Array(buf);
  const mime = /\.png$/i.test(file.name) ? "image/png" : /\.webp$/i.test(file.name) ? "image/webp" : "image/jpeg";
  return { name: file.name, dataUrl: `data:${mime};base64,` + bytesToBase64(bytes) };
}

export interface BatchFolder {
  folder: any;
  files: any[];
}

/** Hộp thoại chọn thư mục → danh sách file ảnh bên trong. */
export async function pickImageFolder(): Promise<BatchFolder | null> {
  const folder = await storage.localFileSystem.getFolder();
  if (!folder) return null;
  const entries = await folder.getEntries();
  const files = entries.filter((e: any) => e.isFile && IMAGE_EXT.test(e.name));
  return { folder, files };
}

/** Lấy (hoặc tạo) thư mục con, ví dụ "Pixelius". */
export async function ensureSubfolder(folder: any, name: string): Promise<any> {
  const entries = await folder.getEntries();
  const found = entries.find((e: any) => e.isFolder && e.name === name);
  return found || folder.createFolder(name);
}

/** Mở file trong Photoshop. Gọi trong runModal. */
export async function openFile(entry: any) {
  return app.open(entry);
}

/** Lưu bản JPG vào thư mục đích rồi đóng tài liệu (không lưu file gốc). Gọi trong runModal. */
export async function saveJpgAndClose(doc: any, outFolder: any, baseName: string) {
  const name = baseName.replace(/\.[^.]+$/, "") + ".jpg";
  const outFile = await outFolder.createFile(name, { overwrite: true });
  await doc.saveAs.jpg(outFile, { quality: 11 }, true);
  doc.closeWithoutSaving();
}
