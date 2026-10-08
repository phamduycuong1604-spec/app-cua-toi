// Cấu hình chung — sửa giá/đường dẫn ở đây.

/** Máy chủ mặc định. Người dùng có thể đổi ở màn hình đăng nhập (mục "Máy chủ"). */
export const DEFAULT_API_BASE = "https://api.phaha.ai";
/** Trang nạp điểm (mở bằng trình duyệt). */
export const TOPUP_URL = "https://phaha.ai/nap-diem";
/** Chu kỳ hỏi trạng thái job (ms). */
export const POLL_MS = 2000;
/** Chu kỳ tự cập nhật số điểm (ms). */
export const CREDITS_REFRESH_MS = 60_000;

export type GenModel = "gpt-image-2.5" | "gpt-image-2";

/** Bảng giá hiển thị trên panel (máy chủ mới là nơi trừ điểm thật). */
export const PRICES = {
  gen: { "gpt-image-2.5": 15, "gpt-image-2": 12 } as Record<GenModel, number>,
  faceLock: 2,
  retouch: 3,
  retouch4k: 6,
  special: 20,
  free: 0,
  upscale: { "2x": 4, "4x": 8, "12mpx": 6, "24mpx": 10 } as Record<string, number>,
};

/** Cạnh dài tối đa của ảnh gửi lên máy chủ. */
export const MAX_SIDE = {
  gen: 2048,
  retouch: 2048,
  retouch4k: 4096,
  special: 2048,
  free: 1024,
  upscale: 4096,
};

/** Độ mềm mép mask (px). */
export const MASK_FEATHER_PX = 2;
