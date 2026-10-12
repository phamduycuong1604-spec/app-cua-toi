"""Bước 4: xóa chữ cũ và tái tạo nền phía sau. Chỉ điểm ảnh trong vùng chữ bị đụng tới."""
import threading

import cv2
import numpy as np

from .. import config
from .ocr import box_geometry

_session = None
_lock = threading.Lock()


def grow_px(box) -> int:
    """Nới vùng chữ ra vài điểm ảnh để xóa sạch mép chữ."""
    w, h, _, _ = box_geometry(box)
    return max(2, round(min(w, h) * 0.12))


def region_mask(shape, box, grow: int) -> np.ndarray:
    m = np.zeros(shape[:2], np.uint8)
    cv2.fillPoly(m, [np.asarray(box, np.int32)], 255)
    if grow > 0:
        m = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * grow + 1,) * 2))
    return m


def lama_available() -> bool:
    return config.LAMA_MODEL.exists()


def _get_session():
    global _session
    with _lock:
        if _session is None:
            import onnxruntime as ort

            prov = [p for p in ("CUDAExecutionProvider", "CPUExecutionProvider")
                    if p in ort.get_available_providers()]
            _session = ort.InferenceSession(str(config.LAMA_MODEL), providers=prov)
        return _session


def _lama(rgb: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """Chạy LaMa trên từng cụm chữ: cắt vùng quanh chữ → phóng về 512×512 → vá → thu về cỡ cũ."""
    sess = _get_session()
    names = [i.name for i in sess.get_inputs()]
    mask_name = next((n for n in names if "mask" in n.lower()), names[1])
    img_name = next(n for n in names if n != mask_name)
    H, W = rgb.shape[:2]
    out = rgb.copy()
    n, _, stats, _ = cv2.connectedComponentsWithStats((mask > 0).astype(np.uint8))
    for i in range(1, n):
        x, y, w, h = stats[i][:4]
        side = max(int(max(w, h) * 1.8) + 32, 128)
        cw, ch = min(side, W), min(side, H)
        x0 = int(np.clip(x + w / 2 - cw / 2, 0, W - cw))
        y0 = int(np.clip(y + h / 2 - ch / 2, 0, H - ch))
        crop = out[y0:y0 + ch, x0:x0 + cw]
        cm = mask[y0:y0 + ch, x0:x0 + cw] > 0
        img = cv2.resize(crop, (512, 512), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
        mm = (cv2.resize(cm.astype(np.uint8), (512, 512), interpolation=cv2.INTER_NEAREST) > 0)
        mm = cv2.dilate(mm.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(np.float32)
        img = img * (1 - mm[..., None])
        res = sess.run(None, {
            img_name: img.transpose(2, 0, 1)[None],
            mask_name: mm[None, None],
        })[0][0].transpose(1, 2, 0)
        if res.max() <= 1.5:  # có bản mô hình trả 0..1, có bản trả 0..255
            res = res * 255
        res = cv2.resize(np.clip(res, 0, 255).astype(np.uint8), (cw, ch), interpolation=cv2.INTER_CUBIC)
        out[y0:y0 + ch, x0:x0 + cw][cm] = res[cm]
    return out


def _smooth_fill(rgb: np.ndarray, m: np.ndarray):
    """Nền trơn hoặc chuyển màu đều: dựng lại nền bằng mặt cong bậc 2 từ vành nền xung quanh.
    Trả về ảnh đã tô, hoặc None nếu nền có họa tiết (để LaMa xử lý)."""
    ring = (cv2.dilate(m, np.ones((9, 9), np.uint8)) > 0) & (m == 0)
    ys, xs = np.nonzero(ring)
    if len(xs) < 20:
        return None
    cx, cy, sc = xs.mean(), ys.mean(), max(np.ptp(xs), np.ptp(ys), 1)

    def basis(x, y):
        x, y = (x - cx) / sc, (y - cy) / sc
        return np.stack([np.ones_like(x), x, y, x * x, x * y, y * y], 1)

    A = basis(xs.astype(np.float64), ys.astype(np.float64))
    vals = rgb[ys, xs].astype(np.float64)
    coef, *_ = np.linalg.lstsq(A, vals, rcond=None)
    if (vals - A @ coef).std(axis=0).max() > 4.0:
        return None
    my, mx = np.nonzero(m)
    out = rgb.copy()
    out[my, mx] = np.clip(basis(mx.astype(np.float64), my.astype(np.float64)) @ coef + 0.5, 0, 255)
    return out


def remove_text(rgb: np.ndarray, regions: list[dict]):
    """Trả về (ảnh đã xóa chữ, mặt nạ vùng đã xóa)."""
    clean = rgb.copy()
    full = np.zeros(rgb.shape[:2], np.uint8)
    hard = np.zeros_like(full)
    for r in regions:
        m = region_mask(rgb.shape, r["box"], grow_px(r["box"]))
        full |= m
        # Nền trơn/chuyển màu đều: tô lại bằng toán, sạch và nhanh; nền phức tạp để LaMa vá
        filled = _smooth_fill(clean, m)
        if filled is not None:
            clean = filled
        else:
            hard |= m
    if hard.any():
        if lama_available():
            clean = _lama(clean, hard)
        else:
            clean = cv2.inpaint(clean, hard, 5, cv2.INPAINT_TELEA)
    # Bảo đảm tuyệt đối: ngoài vùng chữ giữ nguyên ảnh gốc
    clean[full == 0] = rgb[full == 0]
    return clean, full
