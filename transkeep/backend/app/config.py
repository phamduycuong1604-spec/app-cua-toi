"""Cài đặt của máy chủ, đọc từ biến môi trường (file .env khi chạy Docker)."""
import os
from pathlib import Path

# Thư mục lưu file người dùng tải lên và kết quả
DATA_DIR = Path(os.getenv("DATA_DIR", "/tmp/transkeep-data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

# Mật khẩu vào app (để trống = ai có link cũng dùng được)
APP_PASSWORD = os.getenv("APP_PASSWORD", "")

# Chìa khóa dịch đặt sẵn trên máy chủ (người dùng cũng có thể tự nhập trên web)
API_KEYS = {
    "gemini": os.getenv("GEMINI_API_KEY", ""),
    "openai": os.getenv("OPENAI_API_KEY", ""),
    "deepl": os.getenv("DEEPL_API_KEY", ""),
    "google": os.getenv("GOOGLE_TRANSLATE_API_KEY", ""),
}
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-flash-latest")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")

# Mô hình xóa chữ LaMa (nếu không có file thì dùng OpenCV thay thế)
LAMA_MODEL = Path(os.getenv("LAMA_MODEL", "/models/lama_fp32.onnx"))

# Giới hạn dung lượng file tải lên (MB)
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "50"))

# Xóa job cũ sau bao nhiêu giờ
KEEP_HOURS = int(os.getenv("KEEP_HOURS", "24"))

FONTS_DIR = Path(__file__).parent / "fonts"
