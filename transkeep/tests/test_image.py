"""Kiểm tra tự động: chạy cả quy trình trên ảnh mẫu, máy dịch được giả lập.
Chạy:  cd transkeep && pip install pytest && pytest tests -q
"""
import glob
import sys
from pathlib import Path

import numpy as np
import pytest
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app.pipeline import image_job, translate  # noqa: E402
from app.pipeline.render import clip_mask  # noqa: E402

CJK_FONTS = glob.glob("/usr/share/fonts/**/wqy-*.tt*", recursive=True) + \
    glob.glob("/usr/share/fonts/**/NotoSansCJK*", recursive=True)


@pytest.fixture
def sample(tmp_path):
    if not CJK_FONTS:
        pytest.skip("Máy này không có font chữ Trung để tạo ảnh mẫu")
    font = ImageFont.truetype(CJK_FONTS[0], 48)
    a = np.zeros((400, 700, 3), np.uint8)
    a[:] = np.linspace(110, 220, 400)[:, None, None].astype(np.uint8)  # nền chuyển màu
    img = Image.fromarray(a)
    d = ImageDraw.Draw(img)
    d.text((40, 40), "欢迎光临", font=font, fill=(255, 255, 255), stroke_width=3, stroke_fill=(0, 0, 0))
    d.text((40, 200), "注意安全", font=font, fill=(255, 220, 0))
    d.rectangle((500, 250, 680, 380), fill=(30, 160, 60))  # vật thể không có chữ
    path = tmp_path / "in.jpg"
    img.save(path, quality=92)
    return path


def test_pipeline_keeps_pixels_outside_text(sample, monkeypatch, tmp_path):
    monkeypatch.setitem(translate.PROVIDERS, "gemini", lambda texts, d, k: ["Xin chào"] * len(texts))
    out = tmp_path / "job"
    out.mkdir()
    res = image_job.process(out, sample, {"api_key": "x"}, lambda *_: None)

    assert len(res["regions"]) == 2
    first = res["regions"][0]
    assert first["color"] == "#ffffff" or first["color"].startswith("#f")
    assert first["stroke_color"] is not None  # phát hiện được viền đen

    orig = np.asarray(Image.open(out / "original.png").convert("RGB"))
    result = np.asarray(Image.open(out / "result.png").convert("RGB"))
    assert orig.shape == result.shape  # không đổi kích thước
    allowed = clip_mask(orig.shape, res["regions"])
    assert not (orig[allowed == 0] != result[allowed == 0]).any()  # ngoài vùng chữ không đổi
    assert (orig[allowed > 0] != result[allowed > 0]).any()  # trong vùng chữ có thay đổi
