"""Ghép các bước lại: ảnh vào → tìm chữ → dịch → xóa → vẽ → ảnh ra."""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

from . import inpaint, ocr, render, style, translate

try:  # đọc được ảnh HEIC của iPhone
    import pillow_heif

    pillow_heif.register_heif_opener()
except ImportError:
    pass

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".bmp"}


def load_image(path: Path):
    """Đọc ảnh → (RGB, kênh trong suốt hoặc None, hồ sơ màu ICC)."""
    im = Image.open(path)
    icc = im.info.get("icc_profile")
    im = ImageOps.exif_transpose(im)  # xoay đúng chiều như khi xem trên điện thoại
    alpha = None
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        im = im.convert("RGBA")
        alpha = np.asarray(im)[:, :, 3].copy()
    return np.asarray(im.convert("RGB")).copy(), alpha, icc


def save_png(path: Path, rgb: np.ndarray, alpha=None, icc=None):
    """Lưu PNG (không nén mất dữ liệu) để không đổi điểm ảnh nào ngoài vùng chữ."""
    im = Image.fromarray(rgb)
    if alpha is not None:
        im = Image.fromarray(np.dstack([rgb, alpha]), "RGBA")
    im.save(path, "PNG", icc_profile=icc, compress_level=6)


def process(job_dir: Path, src: Path, opts: dict, progress) -> dict:
    rgb, alpha, icc = load_image(src)
    save_png(job_dir / "original.png", rgb, alpha, icc)

    progress(0.1, "Đang tìm chữ Trung trong ảnh…")
    regions = ocr.detect_text(rgb)
    if not regions:
        save_png(job_dir / "clean.png", rgb)
        save_png(job_dir / "result.png", rgb, alpha, icc)
        _save_regions(job_dir, [])
        return {"regions": [], "message": "Không thấy chữ Trung nào trong ảnh."}

    progress(0.35, f"Tìm thấy {len(regions)} vùng chữ. Đang dịch…")
    texts = translate.translate([r["src"] for r in regions], opts.get("provider", "gemini"),
                                opts.get("domain", "general"), opts.get("api_key", ""))

    progress(0.55, "Đang đo màu chữ, viền chữ…")
    styles = [style.estimate_style(rgb, r["box"]) for r in regions]
    for r, t, st in zip(regions, texts, styles):
        r.update({
            "text": t,
            "orig_box": r["box"],
            "color": st["color"],
            "stroke_color": st["stroke_color"],
            "stroke_width": st["stroke_width"],
            "bold": st["bold"],
            "font": opts.get("font", "sans"),
            "font_size": None,  # None = tự co cho vừa khung
            "align": "center",
            "enabled": True,
        })

    progress(0.65, "Đang xóa chữ cũ, tái tạo nền…")
    clean, _ = inpaint.remove_text(rgb, regions)
    save_png(job_dir / "clean.png", clean)

    progress(0.9, "Đang viết chữ Việt…")
    result = render.render(rgb, clean, regions)
    save_png(job_dir / "result.png", result, alpha, icc)
    _save_regions(job_dir, regions)
    return {"regions": regions}


def rerender(job_dir: Path, regions: list[dict]) -> list[dict]:
    """Vẽ lại sau khi người dùng sửa chữ/màu/font — không cần dịch hay xóa chữ lại."""
    rgb, alpha, icc = load_image(job_dir / "original.png")
    clean, _, _ = load_image(job_dir / "clean.png")
    result = render.render(rgb, clean, regions)
    save_png(job_dir / "result.png", result, alpha, icc)
    _save_regions(job_dir, regions)
    return regions


def _save_regions(job_dir: Path, regions):
    (job_dir / "regions.json").write_text(json.dumps(regions, ensure_ascii=False, indent=1), "utf-8")
