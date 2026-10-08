/** Khung chữ nhật theo điểm ảnh của tài liệu. */
export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const boundsWidth = (b: Bounds) => b.right - b.left;
export const boundsHeight = (b: Bounds) => b.bottom - b.top;
