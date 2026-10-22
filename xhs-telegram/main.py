"""Lấy video nhiếp ảnh viral trên Xiaohongshu và gửi link qua Telegram.

Scraper: yangsijie666/xiaohongshu-crawler (Playwright, MIT). Cần đăng nhập QR
một lần bằng scripts/verify_login.py; phiên đăng nhập được lưu lại.
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

KEYWORDS: list[str] = [
    "nhiếp ảnh",
    "photography tips",
    "camera settings",
    "photo editing",
    "portrait photography",
]
MAX_PER_KEYWORD = 30
MIN_VIEWS = 10_000
MIN_LIKES = 500
TOP_N = 10
EMPTY_MESSAGE = "No viral photography videos met the threshold today."

log = logging.getLogger("xhs-telegram")

Video = dict[str, Any]


class SetupError(RuntimeError):
    """Lỗi cấu hình: người dùng cần cài hoặc đăng nhập scraper."""


def _crawler_dir() -> Path:
    """Trả về thư mục xiaohongshu-crawler, hoặc báo lỗi hướng dẫn cài."""
    path = Path(os.environ.get("XHS_CRAWLER_DIR", "./xiaohongshu-crawler")).expanduser().resolve()
    if not (path / "src" / "search.py").exists():
        raise SetupError(
            f"Không thấy xiaohongshu-crawler tại {path}. Hãy cài: "
            "git clone https://github.com/yangsijie666/xiaohongshu-crawler && "
            "cd xiaohongshu-crawler && uv sync && uv run playwright install chromium, "
            "rồi đặt XHS_CRAWLER_DIR trong .env."
        )
    return path


def _to_int(value: Any) -> int | None:
    """Đổi giá trị sang số nguyên; trả None nếu thiếu hoặc sai định dạng."""
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _normalize(raw: dict[str, Any]) -> Video | None:
    """Chuẩn hóa một bài viết; trả None nếu không phải video hoặc lỗi dữ liệu."""
    try:
        if raw.get("note_type") != "video":
            return None
        url = raw.get("video_url") or raw.get("note_url")
        if not url:
            return None
        return {
            "title": (raw.get("title") or "").strip(),
            "author": (raw.get("author") or "").strip(),
            "view_count": _to_int(raw.get("views") or raw.get("view_count")),
            "like_count": _to_int(raw.get("likes")),
            "video_url": url,
        }
    except Exception as exc:  # bỏ qua bài lỗi, không làm sập cả chương trình
        log.warning("Bỏ qua bài lỗi: %s", exc)
        return None


async def _scrape_async() -> list[Video]:
    crawler = _crawler_dir()
    sys.path.insert(0, str(crawler))
    os.chdir(crawler)  # crawler lưu phiên đăng nhập theo đường dẫn tương đối
    from src.auth import is_logged_in  # type: ignore
    from src.browser import BrowserManager  # type: ignore
    from src.search import search_notes  # type: ignore

    videos: list[Video] = []
    async with BrowserManager(headless=True) as bm:
        page = await bm.new_page()
        try:
            await page.goto("https://www.xiaohongshu.com", wait_until="domcontentloaded")
            if not await is_logged_in(page):
                raise SetupError(
                    "Chưa đăng nhập Xiaohongshu. Chạy một lần: "
                    f"cd {crawler} && uv run python scripts/verify_login.py (quét mã QR)."
                )
        finally:
            await page.close()
        for keyword in KEYWORDS:
            try:
                notes = await search_notes(bm, keyword, max_count=MAX_PER_KEYWORD)
            except Exception as exc:
                log.error("Lỗi khi tìm '%s': %s", keyword, exc)
                continue
            videos.extend(v for n in notes if (v := _normalize(n)))
    return videos


def scrape() -> list[Video]:
    """Tìm từng từ khóa và trả danh sách bài video (chưa lọc)."""
    return asyncio.run(_scrape_async())


def filter_and_rank(videos: list[Video], top_n: int = TOP_N) -> list[Video]:
    """Lọc bài viral, bỏ trùng, xếp theo lượt xem (rồi lượt thích) giảm dần."""
    seen: set[str] = set()
    viral: list[Video] = []
    for v in videos:
        views, likes = v.get("view_count"), v.get("like_count")
        ok = views > MIN_VIEWS if views is not None else (likes or 0) > MIN_LIKES
        if ok and v["video_url"] not in seen:
            seen.add(v["video_url"])
            viral.append(v)
    viral.sort(key=lambda v: (v["view_count"] or 0, v["like_count"] or 0), reverse=True)
    return viral[:top_n]


def send_to_telegram(text: str) -> None:
    """Gửi một tin nhắn qua Telegram Bot API (tắt xem trước link)."""
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        raise SetupError("Thiếu TELEGRAM_BOT_TOKEN hoặc TELEGRAM_CHAT_ID (trong .env).")
    resp = requests.post(
        f"https://api.telegram.org/bot{token}/sendMessage",
        data={"chat_id": chat_id, "text": text, "disable_web_page_preview": "true"},
        timeout=30,
    )
    resp.raise_for_status()


def main() -> int:
    logging.basicConfig(stream=sys.stderr, level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    load_dotenv(Path(__file__).resolve().parent / ".env")
    try:
        top = filter_and_rank(scrape())
        send_to_telegram("\n".join(v["video_url"] for v in top) if top else EMPTY_MESSAGE)
        log.info("Đã gửi %d link.", len(top))
        return 0
    except Exception as exc:
        log.error("Thất bại: %s", exc)
        try:
            send_to_telegram(f"Xiaohongshu bot failed: {exc}"[:500])
        except Exception as send_exc:
            log.error("Không gửi được thông báo lỗi: %s", send_exc)
        return 1


if __name__ == "__main__":
    sys.exit(main())
