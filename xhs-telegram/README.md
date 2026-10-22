# Bot gửi video nhiếp ảnh viral từ Xiaohongshu qua Telegram

Mỗi lần chạy: tìm 5 từ khóa → giữ video viral → gửi **10 link** (mỗi dòng một link) vào Telegram.

**Scraper dùng:** [`yangsijie666/xiaohongshu-crawler`](https://github.com/yangsijie666/xiaohongshu-crawler) (Playwright, MIT, miễn phí).
Lý do: `qd-xhs` không cài được bằng pip trong môi trường kiểm tra; crawler này clone và dùng được.

> **Lưu ý thật:** trang web Xiaohongshu **không hiện lượt xem** ở kết quả tìm kiếm, chỉ hiện lượt thích.
> Nên trên thực tế bộ lọc dùng quy tắc dự phòng: `like_count > 500`. Nếu có lượt xem thì dùng `view_count > 10000`.
> Link gửi đi là link bài viết (`note_url`) vì link video gốc thường là link tạm.

## 1. Cài scraper
```bash
git clone https://github.com/yangsijie666/xiaohongshu-crawler
cd xiaohongshu-crawler
uv sync
uv run playwright install chromium
uv run python scripts/verify_login.py   # quét mã QR bằng app Xiaohongshu, chỉ làm 1 lần
```
(Máy cần có `uv`: https://docs.astral.sh/uv/)

## 2. Tạo bot Telegram
1. Mở Telegram, chat với **@BotFather** → gõ `/newbot` → đặt tên → nhận **token**.
2. Mở bot vừa tạo, bấm **Start** và gửi một tin bất kỳ.
3. Lấy chat ID: mở `https://api.telegram.org/bot<TOKEN>/getUpdates`, tìm `"chat":{"id": 123456789`. Số đó là chat ID.
   (Hoặc chat với @userinfobot.)

## 3. Cài và cấu hình script
```bash
cd xhs-telegram
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/playwright install chromium
cp .env.example .env     # rồi điền token, chat ID, đường dẫn crawler
```

## 4. Chạy thử
```bash
.venv/bin/python main.py
```

## 5. Chạy tự động mỗi 8h sáng (cron)
```cron
0 8 * * * /path/to/xhs-telegram/.venv/bin/python /path/to/xhs-telegram/main.py >> /tmp/xhs.log 2>&1
```
(Dùng `/usr/bin/python3 /path/to/main.py` cũng được nếu đã `pip install -r requirements.txt` cho python hệ thống.)

## Khi có lỗi
- Chưa đăng nhập / phiên hết hạn → chạy lại `verify_login.py` ở bước 1. Bot sẽ nhắn báo lỗi vào Telegram.
- Gặp CAPTCHA/đăng nhập: script **không** vượt qua, hãy tự xử lý trong trình duyệt.
