"""Đo kiểu chữ gốc: màu chữ, màu viền, độ dày viền, chữ đậm, màu nền."""
import cv2
import numpy as np

from .ocr import box_geometry


def _hex(rgb) -> str:
    r, g, b = (int(np.clip(v, 0, 255)) for v in rgb)
    return f"#{r:02x}{g:02x}{b:02x}"


def _lab(rgb: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB).astype(np.float32)


def estimate_style(rgb: np.ndarray, box) -> dict:
    H, W = rgb.shape[:2]
    w, h, _, _ = box_geometry(box)
    char = max(4.0, min(w, h))  # cỡ một chữ (với chữ dọc là bề rộng)
    m = max(3, int(char * 0.3))

    pts = np.asarray(box, dtype=np.int32)
    x0, y0 = np.maximum(pts.min(0) - m - 3, 0)
    x1, y1 = np.minimum(pts.max(0) + m + 4, [W, H])
    crop = rgb[y0:y1, x0:x1]
    inner = np.zeros(crop.shape[:2], np.uint8)
    cv2.fillPoly(inner, [pts - [x0, y0]], 1)

    # Vành nền bao quanh khung chữ → màu nền
    big = cv2.dilate(inner, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * m + 1,) * 2))
    ring = (big > 0) & (cv2.dilate(inner, np.ones((5, 5), np.uint8)) == 0)
    if ring.sum() < 10:
        ring = inner == 0
    if ring.sum() < 10:
        ring = np.ones_like(inner, bool)
    lab = _lab(crop)
    bg_lab = np.median(lab[ring], axis=0)
    bg_rgb = np.median(crop[ring], axis=0)

    # Điểm ảnh khác hẳn màu nền = nét chữ
    inside = inner > 0
    dist = np.linalg.norm(lab - bg_lab, axis=2)
    thr = max(30.0, 0.5 * float(np.percentile(dist[inside], 95)))
    text = inside & (dist > thr)

    style = {
        "bg_color": _hex(bg_rgb),
        "stroke_color": None,
        "stroke_width": 0,
        "bold": False,
    }
    if text.sum() < 10:
        # Không tách được nét: chọn trắng/đen tương phản với nền
        style["color"] = "#000000" if bg_lab[0] > 140 else "#ffffff"
        return style

    style["bold"] = bool(text.sum() / max(inside.sum(), 1) > 0.3)
    px_rgb = crop[text].astype(np.float32)
    px_lab = lab[text]
    style["color"] = _hex(np.median(px_rgb[dist[text] >= np.percentile(dist[text], 50)], axis=0))

    # Thử tách 2 nhóm màu: ruột chữ + viền chữ
    if len(px_lab) >= 40:
        crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
        _, labels, centers = cv2.kmeans(px_lab, 2, None, crit, 3, cv2.KMEANS_PP_CENTERS)
        labels = labels.ravel()
        share = np.bincount(labels, minlength=2) / len(labels)
        if share.min() >= 0.15 and np.linalg.norm(centers[0] - centers[1]) > 70:
            bg_in = inside & ~text
            touch = []
            for k in range(2):
                cm = np.zeros(inner.shape, np.uint8)
                cm[text] = labels == k
                touch.append((cv2.dilate(cm, np.ones((3, 3), np.uint8)).astype(bool) & bg_in).sum() / max(cm.sum(), 1))
            s, f = (0, 1) if touch[0] > touch[1] else (1, 0)
            # Nhóm "viền" nằm giữa màu chữ và màu nền chỉ là mép răng cưa, không phải viền thật
            fv, sv = centers[f], centers[s]
            seg = bg_lab - fv
            t = float(np.dot(sv - fv, seg) / max(np.dot(seg, seg), 1e-6))
            perp = float(np.linalg.norm(sv - fv - t * seg))
            if not (0.1 < t < 0.9 and perp < 20):
                fill_m = np.zeros(inner.shape, np.uint8)
                fill_m[text] = labels == f
                edge = (fill_m - cv2.erode(fill_m, np.ones((3, 3), np.uint8))).sum()
                sw = (labels == s).sum() / max(edge, 1)
                style["color"] = _hex(np.median(px_rgb[labels == f], axis=0))
                style["stroke_color"] = _hex(np.median(px_rgb[labels == s], axis=0))
                style["stroke_width"] = int(np.clip(round(sw), 1, max(1, char * 0.15)))
    return style
