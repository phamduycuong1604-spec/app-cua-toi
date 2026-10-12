"""Bước 1+2: tìm vùng có chữ Trung và đọc chữ (mô hình PaddleOCR chạy qua RapidOCR)."""
import math
import re
import threading

import numpy as np

# Chữ Hán (giản thể + phồn thể)
CJK = re.compile(r"[㐀-䶿一-鿿豈-﫿]")

_engine = None
_lock = threading.Lock()


def _get_engine():
    global _engine
    with _lock:
        if _engine is None:
            from rapidocr import RapidOCR

            _engine = RapidOCR()
        return _engine


def box_geometry(box):
    """Từ 4 góc (trên-trái, trên-phải, dưới-phải, dưới-trái) → rộng, cao, góc nghiêng, tâm."""
    p = np.asarray(box, dtype=np.float32)
    w = (np.linalg.norm(p[1] - p[0]) + np.linalg.norm(p[2] - p[3])) / 2
    h = (np.linalg.norm(p[3] - p[0]) + np.linalg.norm(p[2] - p[1])) / 2
    angle = math.degrees(math.atan2(p[1][1] - p[0][1], p[1][0] - p[0][0]))
    cx, cy = p.mean(axis=0)
    return float(w), float(h), float(angle), (float(cx), float(cy))


def detect_text(rgb: np.ndarray, min_score: float = 0.5) -> list[dict]:
    """Trả về danh sách vùng chữ Trung: {box, src, score, vertical, angle}."""
    result = _get_engine()(rgb[:, :, ::-1].copy())  # RapidOCR nhận ảnh BGR
    if result.boxes is None:
        return []
    regions = []
    for box, txt, score in zip(result.boxes, result.txts, result.scores):
        if score < min_score or not CJK.search(txt):
            continue  # bỏ chữ không phải tiếng Trung (số, chữ Latin...)
        w, h, angle, _ = box_geometry(box)
        regions.append({
            "box": np.round(np.asarray(box)).astype(int).tolist(),
            "src": txt,
            "score": round(float(score), 3),
            # Chữ dọc: khung cao hơn hẳn rộng và có từ 2 chữ trở lên
            "vertical": bool(h > w * 1.3 and len(txt) >= 2),
            "angle": round(angle, 2),
        })
    # Sắp xếp theo thứ tự đọc: trên xuống, trái sang
    regions.sort(key=lambda r: (min(p[1] for p in r["box"]), min(p[0] for p in r["box"])))
    for i, r in enumerate(regions):
        r["id"] = i
    return regions
