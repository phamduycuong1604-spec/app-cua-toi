# Dịch vụ yt-dlp cho PHA Rednote

**Sites chạy Cloudflare Workers, không chạy được Python/yt-dlp hay subprocess.** Thư mục này là dịch vụ Python riêng để chạy trên VPS hoặc host Docker. Kết nối Worker đã được thêm, nhưng chỉ hoạt động sau khi có máy chủ và cấu hình URL/token. Nếu chưa cấu hình, app tiếp tục dùng cách lấy nguồn desktop/cookie hiện có.

## Dịch vụ làm gì

- Nhận `POST /v1/rednote/resolve` với JSON chỉ có `url`, xác thực Bearer token.
- Giải link xhslink bằng redirect thủ công trong các miền Rednote chính thức, giữ tham số chia sẻ. Chuẩn hóa URL bài cho extractor XiaoHongShu của yt-dlp.
- Chạy yt-dlp **2026.10.21** trong subprocess có timeout. Dùng `YoutubeDL.extract_info(download=False)` với `best[ext=mp4]/best`, không playlist, không cache, không postprocessor. Tương đương lấy URL bằng `-g`, đồng thời giữ metadata cần kiểm tra watermark. Không tải hoặc lưu video thành file trên dịch vụ.
- Bổ sung cờ watermark từ metadata của đúng URL mà extractor chính thức đang đọc. `format_id=direct`, `ext=mp4`, tên origin hay việc yt-dlp trả URL thành công **không tự chứng minh video sạch**.
- Worker ưu tiên kết quả có bằng chứng không watermark, kiểm tra URL/CDN, MP4 và dung lượng. Không dùng được thì chuyển sang bộ lấy nguồn cũ; bài cần đăng nhập vẫn có lỗi rõ và nút chọn video từ máy.
- Dịch vụ tối đa 2 lượt trích xuất đồng thời, tổng xử lý tối đa khoảng 15 giây; Worker chờ tối đa 18 giây. HTTP tải byte, 4 luồng, retry, OPFS và giao diện client giữ nguyên.

## Chạy trên máy chủ Python

```sh
cd services/ytdlp
python -m venv .venv
.venv/bin/pip install -r requirements.txt
# Đặt YTDLP_SERVICE_TOKEN bằng secret manager hoặc môi trường của máy chủ.
# Tạo token riêng bằng: python -c 'import secrets; print(secrets.token_urlsafe(32))'
.venv/bin/python server.py
```

Ứng dụng phải được đặt sau reverse proxy HTTPS; kiểm tra `GET /health` trả `ok: true` và phiên bản yt-dlp. Token tối thiểu 32 ký tự, không lưu vào Git hoặc JS của điện thoại. Đừng dùng token mẫu trong test.

## Chạy Docker

Từ thư mục `services/ytdlp`:

```sh
docker build -t pha-rednote-ytdlp .
# Tạo tệp .env riêng trên VPS theo .env.example, điền token đã tạo.
docker run -d --name pha-rednote-ytdlp --restart unless-stopped \
  --env-file .env --read-only --tmpfs /tmp:rw,nosuid,size=64m \
  --cap-drop ALL --security-opt no-new-privileges --pids-limit 64 --memory 256m \
  -p 127.0.0.1:8080:8080 pha-rednote-ytdlp
```

Reverse proxy công khai HTTPS chuyển `/v1/rednote/resolve` và `/health` đến `127.0.0.1:8080`, giới hạn body 16 KB và thời gian chờ 20 giây. Không công khai trực tiếp cổng Python.

## Nối với Sites

Trong runtime secrets của đúng app PHA Rednote, cấu hình hai giá trị rồi đăng lại:

- `YTDLP_SERVICE_URL`: URL HTTPS gốc của máy chủ, hoặc URL đầy đủ kết thúc `/v1/rednote/resolve`.
- `YTDLP_SERVICE_TOKEN`: cùng token của dịch vụ Python.

Không đặt URL giả khi chưa có máy chủ. Không cần sửa mã client hay thay cookie Rednote đang lưu trong app. Token chỉ được gửi từ Worker đến đúng endpoint, không theo redirect.

## Phiên Rednote tùy chọn

yt-dlp không vượt được quyền riêng tư, CAPTCHA hoặc mọi chặn IP/vùng; một số bài vẫn cần đăng nhập. Khi yt-dlp yêu cầu đăng nhập, Worker có thể thử cách dự phòng sử dụng cookie mã hóa đã lưu trong app.

Dịch vụ Python có thể nhận cookie Netscape từ secret file do chủ máy chủ gắn tại `REDNOTE_COOKIES_FILE`. File được sao chép vào thư mục tạm riêng (0600), xóa sau mỗi lượt. Cookie lưu trên Sites **không tự chuyển sang máy chủ khác**. Không gửi cookie trong body API, chat hoặc Git.

## Kiểm thử

```sh
# Dùng venv đã cài requirements.txt:
.venv/bin/python -m unittest discover -s . -p test_service.py -v
# Trong thư mục gốc app:
node scripts/yt-dlp.test.mjs
npm run build
node --test scripts/*.test.mjs
```

Bộ Python có chạy extractor yt-dlp thật trên trang fixture (không dùng mạng để giả vờ có video thật), thử HTTP API, auth, cookie tạm, subprocess timeout và chống lộ stderr. Dockerfile được cung cấp để triển khai; kiểm thử Python không đồng nghĩa ảnh Docker đã được build/chạy trên VPS.
