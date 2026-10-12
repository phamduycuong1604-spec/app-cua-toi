"""Bước 5: vẽ chữ Việt vào đúng vị trí, đúng màu, đúng góc nghiêng, tự co cỡ cho vừa khung."""
from functools import lru_cache

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from .. import config
from .inpaint import grow_px, region_mask
from .ocr import box_geometry

# Nhóm font → (file thường, file đậm). Font nào cũng có đủ dấu tiếng Việt.
FONT_FILES = {
    "sans": ("sans-regular.ttf", "sans-bold.ttf"),  # Be Vietnam Pro
    "serif": ("serif-regular.ttf", "serif-bold.ttf"),  # Noto Serif
    "handwriting": ("handwriting.ttf", "handwriting.ttf"),  # Dancing Script
    "display": ("display.ttf", "display.ttf"),  # Anton
}
_measure = ImageDraw.Draw(Image.new("L", (1, 1)))


@lru_cache(maxsize=512)
def get_font(family: str, bold: bool, size: int):
    files = FONT_FILES.get(family, FONT_FILES["sans"])
    return ImageFont.truetype(str(config.FONTS_DIR / files[1 if bold else 0]), size)


def _wrap(text: str, font, max_w: float) -> list[str]:
    """Ngắt dòng theo từ cho vừa bề rộng."""
    lines = []
    for para in text.split("\n"):
        cur = ""
        for word in para.split():
            trial = f"{cur} {word}".strip()
            if cur and font.getlength(trial) > max_w:
                lines.append(cur)
                cur = word
            else:
                cur = trial
        lines.append(cur)
    return lines


def _stroke_for(region, size, char_h) -> int:
    sw = region.get("stroke_width") or 0
    if not sw or not region.get("stroke_color"):
        return 0
    return max(1, round(sw * size / max(char_h, 1)))


def fit_text(region, box_w, box_h):
    """Tìm cỡ chữ lớn nhất mà chữ vẫn nằm gọn trong khung. Trả về (cỡ, các dòng)."""
    text, fam, bold = region["text"], region.get("font", "sans"), region.get("bold", False)
    char_h = min(box_w, box_h)
    if region.get("font_size"):
        size = int(region["font_size"])
        return size, _wrap(text, get_font(fam, bold, size), box_w)
    lo, hi, best = 6, max(6, int(max(box_h, char_h) * 1.1)), None
    while lo <= hi:
        mid = (lo + hi) // 2
        font = get_font(fam, bold, mid)
        sw = _stroke_for(region, mid, char_h)
        lines = _wrap(text, font, box_w - 2 * sw)
        l, t, r, b = _measure.multiline_textbbox((0, 0), "\n".join(lines), font=font, anchor="mm",
                                                  align="center", spacing=int(mid * 0.15), stroke_width=sw)
        if r - l <= box_w and b - t <= box_h * 1.08:
            best, lo = (mid, lines), mid + 1
        else:
            hi = mid - 1
    if best is None:
        best = (6, _wrap(text, get_font(fam, bold, 6), box_w))
    return best


def draw_region(canvas: Image.Image, region: dict) -> None:
    if not region.get("enabled", True) or not region.get("text", "").strip():
        return
    w, h, angle, (cx, cy) = box_geometry(region["box"])
    size, lines = fit_text(region, w, h)
    region["fitted_size"] = size
    font = get_font(region.get("font", "sans"), region.get("bold", False), size)
    sw = _stroke_for(region, size, min(w, h))
    pad = sw + 6
    lw, lh = int(w) + 2 * pad, int(h * 1.1) + 2 * pad
    layer = Image.new("RGBA", (lw, lh), (0, 0, 0, 0))
    ImageDraw.Draw(layer).multiline_text(
        (lw / 2, lh / 2), "\n".join(lines), font=font, anchor="mm",
        align=region.get("align", "center"), spacing=int(size * 0.15),
        fill=region.get("color", "#000000"),
        stroke_width=sw, stroke_fill=region.get("stroke_color") or None,
    )
    if abs(angle) > 0.5:
        layer = layer.rotate(-angle, resample=Image.BICUBIC, expand=True)
    canvas.paste(layer, (round(cx - layer.width / 2), round(cy - layer.height / 2)), layer)


def clip_mask(shape, regions) -> np.ndarray:
    """Vùng được phép thay đổi: vùng chữ gốc đã xóa + khung chữ mới (nếu người dùng kéo đi chỗ khác)."""
    m = np.zeros(shape[:2], np.uint8)
    for r in regions:
        if not r.get("enabled", True):
            continue
        m |= region_mask(shape, r["orig_box"], grow_px(r["orig_box"]))
        m |= region_mask(shape, r["box"], grow_px(r["box"]) + (r.get("stroke_width") or 0))
    return m


def render(original: np.ndarray, clean: np.ndarray, regions: list[dict]) -> np.ndarray:
    allowed = clip_mask(original.shape, regions)
    # Vùng bỏ chọn (giữ chữ Trung) lấy lại ảnh gốc
    base = np.where(allowed[..., None] > 0, clean, original)
    canvas = Image.fromarray(base)
    for r in regions:
        draw_region(canvas, r)
    out = np.asarray(canvas).copy()
    # Bảo đảm tuyệt đối: ngoài vùng chữ không đổi điểm ảnh nào
    out[allowed == 0] = original[allowed == 0]
    return out
