# =====================================================
# MÁY CHỦ VIENEU-TTS TRÊN MAC cho app Dịch video PhaHa
# VieNeu-TTS v3 Turbo (https://github.com/pnnbao97/VieNeu-TTS) đọc tiếng Việt ngay trên máy Mac (chạy bằng CPU,
# không cần mạng sau lần tải đầu, không tốn lượt). App Dịch video mở bằng trình duyệt TRÊN CHÍNH MÁY MAC này
# sẽ gửi từng câu tới đây và nhận giọng đọc về.
#
# Bật (giữ cửa sổ Terminal mở trong lúc lồng tiếng; tắt bằng Ctrl + C):
#   ~/.local/bin/uv run --python 3.11 --with vieneu python ~/may-chu-vieneu.py
#
# Chỉ nhận yêu cầu từ chính máy này (127.0.0.1) và từ trang app PhaHa – máy khác trong mạng không gọi được.
# =====================================================
import io, json, sys, threading, time, wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

CONG = 8765
NGUON_DUOC_PHEP = ("https://phamduycuong1604-spec.github.io", "http://localhost", "http://127.0.0.1")

print("⏳ Đang nạp VieNeu-TTS (lần đầu tải AI về máy, có thể mất vài phút)…", flush=True)
import numpy as np
from vieneu import Vieneu

may = Vieneu()  # mặc định: v3 Turbo, 48 kHz
TAN_SO = int(getattr(may, "sample_rate", 48000) or 48000)
DS_GIONG = [(str(nhan), str(ma)) for nhan, ma in may.list_preset_voices()]
khoa_doc = threading.Lock()  # đọc lần lượt từng câu (AI chạy trên CPU, chạy chồng chỉ chậm thêm)


def doc(chu, giong):
    """Đọc 1 câu. giong = mã hoặc tên giọng có sẵn; trống = giọng mặc định."""
    thu = [None] if not giong else [giong] + [n for n, m in DS_GIONG if m == giong] + [m for n, m in DS_GIONG if n == giong]
    loi = None
    for g in dict.fromkeys(thu):
        try:
            with khoa_doc:
                return may.infer(chu, voice=g) if g else may.infer(chu)
        except Exception as e:  # tên giọng không khớp → thử cách gọi khác
            loi = e
    raise loi


def sang_wav(am):
    a = np.clip(np.asarray(am, dtype=np.float32).reshape(-1), -1.0, 1.0)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(TAN_SO)
        w.writeframes((a * 32767).astype("<i2").tobytes())
    return buf.getvalue()


class XuLy(BaseHTTPRequestHandler):
    def _cho_phep(self):
        nguon = self.headers.get("Origin", "")
        if any(nguon.startswith(x) for x in NGUON_DUOC_PHEP):
            self.send_header("Access-Control-Allow-Origin", nguon)
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        # trang trên mạng gọi vào máy này: Chrome hỏi quyền "mạng cục bộ" và cần dòng này
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def _json(self, ma, du):
        b = json.dumps(du, ensure_ascii=False).encode("utf-8")
        self.send_response(ma)
        self._cho_phep()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cho_phep()
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/suc-khoe"):
            return self._json(200, {"ok": True, "ten": "VieNeu-TTS v3 Turbo", "tanSo": TAN_SO})
        if self.path.startswith("/giong"):
            return self._json(200, {"giong": [{"ten": m, "nhan": n} for n, m in DS_GIONG]})
        self._json(404, {"loi": "Không có đường dẫn này"})

    def do_POST(self):
        if not self.path.startswith("/doc"):
            return self._json(404, {"loi": "Không có đường dẫn này"})
        try:
            du = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
        except Exception:
            return self._json(400, {"loi": "Yêu cầu không đúng dạng"})
        chu = str(du.get("chu") or "").strip()
        if not chu:
            return self._json(400, {"loi": "Thiếu chữ cần đọc"})
        bd = time.time()
        try:
            b = sang_wav(doc(chu, str(du.get("giong") or "").strip()))
        except Exception as e:
            print(f"❌ Lỗi đọc: {e}", flush=True)
            return self._json(500, {"loi": f"VieNeu đọc bị lỗi: {e}"[:300]})
        giay = (len(b) - 44) / 2 / TAN_SO
        print(f"✅ {len(chu)} chữ → {giay:.1f} giây giọng, mất {time.time() - bd:.1f} giây", flush=True)
        self.send_response(200)
        self._cho_phep()
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def log_message(self, *a):  # không in mỗi yêu cầu ra màn hình
        pass


if __name__ == "__main__":
    print(f"✅ VieNeu sẵn sàng: {len(DS_GIONG)} giọng · http://127.0.0.1:{CONG}", flush=True)
    print("   Mở app Dịch video trên trình duyệt của máy Mac này, bật 'VieNeu (máy Mac)' trong ⚙️ Cài đặt.", flush=True)
    print("   Giữ cửa sổ này mở trong lúc lồng tiếng. Tắt: bấm Ctrl + C.", flush=True)
    try:
        ThreadingHTTPServer(("127.0.0.1", CONG), XuLy).serve_forever()
    except KeyboardInterrupt:
        print("\nĐã tắt VieNeu.")
        sys.exit(0)
