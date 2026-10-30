# Tải Rednote: nguồn sạch và tải ổn định trên iPhone

## Chọn nguồn

- Request đọc bài dùng Chrome desktop, Accept-Language tiếng Trung và Referer Rednote. Bài công khai được thử trước; khi cần đăng nhập, dùng phiên mã hóa đã lưu, chỉ gửi đến đúng miền. Quản lý phiên được mô tả trong `rednote-session.md`.
- Đọc các trường video gốc `consumer.originVideoKey`, `origin`, `origin_url`, `master_url`, và các cấu trúc video trong `mediaV2`/`media_v2`, ngoài `media.stream` đang có.
- Tên trường, đuôi URL, độ phân giải và dung lượng không phải bằng chứng không watermark. Cần cờ rõ ràng gắn với chính nguồn/stream đó. Cờ mâu thuẫn, URL hoặc chuyển hướng có dấu hiệu watermark đều bị từ chối.
- Ưu tiên nguồn gốc sạch dùng được. Theo lựa chọn của chủ app, **vẫn tải nguồn gốc sạch trên 400 MB**; 400 MB là mốc thông tin, không phải giới hạn cứng. Nếu không có nguồn gốc sạch dùng được, chọn 1080p sạch, H.264 trước H.265. Không xác minh được thì dừng, không tự lấy bản có thể dính logo.
- Probe xác minh chữ ký MP4/WebM, tổng byte, CDN dự phòng và URL cuối. Tổng thời gian lấy thông tin và chọn nguồn có ngân sách 55 giây trước khi client hết chờ phản hồi đầu 60 giây. Probe có giới hạn chờ dữ liệu đầu.
- `/api/extract` cũng dùng quy tắc chọn nguồn này, giữ caption khi không chọn được video sạch; không cấp đường tự tải video chưa xác minh.

## Tải về app

- Tối đa **4 luồng**, mỗi phần 8 MiB, mỗi lần ghi OPFS không quá 1 MiB.
- Phản hồi đầu: **60 giây**. Không nhận thêm byte: **35 giây**. Một phần được tải lại tối đa **3 lần** ngoài lượt đầu (tối đa 4 lượt); lỗi mạng và đứng dữ liệu dùng chung ngân sách này.
- Mỗi lần thử lại ghi rõ khoảng byte, chờ phản hồi hay đọc dữ liệu, số lần thử và nguyên nhân. Ghi OPFS chậm không bị nhầm là mạng đứng; chunk rỗng không đặt lại đồng hồ chờ dữ liệu.
- Giữ kiểm tra Range, tổng byte, chữ ký file, kích thước file thực lưu, dung lượng còn trống, dọn file lỗi, giữ màn hình sáng và đọc song song những byte đã ghi.
- Máy không dùng được OPFS tiếp tục nhận file nhỏ vào RAM, tối đa 256 MiB, với giới hạn chờ và tải lại tương tự. Nếu vẫn không nhận được, hiện nút tải nguồn đã chọn về Tệp. Video trên giới hạn xử lý 2 GiB của app cũng có thể tải qua nút này.

## Kiểm tra

`npm run build && node --test scripts/*.test.mjs`

Các bộ kiểm tra liên quan: `rednote-media`, `download-policy`, `core`, `video-download`, `rednote-session`, `download-overlap`. Các kiểm thử mạng, dữ liệu đầu, OPFS và retry dùng fixture; kiểm tra phiên thật cần chủ app nhập cookie trong giao diện. Không khẳng định tất cả video đều tải được: quyền xem bài, CAPTCHA và chặn IP/vùng của Rednote vẫn được áp dụng.
