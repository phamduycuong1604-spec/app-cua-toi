# Nhật ký xử lý trên thiết bị

Màn hình chính, studio lồng tiếng và trang kiểm tra iPhone dùng cùng nhật ký. Nút **Sao chép nhật ký** lấy toàn bộ log hiện có; nếu Safari chặn clipboard thì chọn chữ để sao chép bằng menu. Nút **Xóa toàn bộ nhật ký** xóa dữ liệu nhật ký mới và dữ liệu cũ của studio, không xóa video/cài đặt/mã API. Xóa khi đang chạy chỉ bỏ lịch sử đã có; bước tiếp theo tiếp tục ghi log mới.

Log gồm thời điểm, link Rednote không có tham số truy cập, chuyên môn, thông tin trình duyệt, đường API/HTTP, dung lượng nhận theo mốc 8 MiB, cách nhận file lớn, lỗi caption và các bước nghe/dịch/lồng tiếng. Nhấp nút lưu video chỉ ghi yêu cầu lưu, không coi là đã lưu thành công. Tách nhạc, FFmpeg và giọng đọc giữ các log chi tiết đã có từ source.

Log lưu bằng localStorage riêng trên thiết bị và được giới hạn khoảng 180.000 ký tự. Tải lại trang giữ lịch sử; tab khác cập nhật khi dữ liệu nhật ký thay đổi. Không ghi request body hoặc API key. Bộ lọc ẩn mã đã biết, Bearer, mã theo định dạng Gemini/OpenAI và tham số URL. Không tự gửi log lên máy chủ.

Kiểm tra: 96 test Node đạt; có kiểm tra luồng lỗi caption thực tế ghi vào journal, copy/fallback chọn chữ, xóa không mất cài đặt, không khôi phục log cũ khi ghi lượt mới, log dài được giữ sau reload, ẩn mã/link truy cập và giới hạn lưu trữ. Build/artifact hợp lệ. Chưa điều khiển iPhone thật trong phiên này.
