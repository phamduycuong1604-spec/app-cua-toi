# Kiểm tra trực tiếp trên iPhone

Mở `/dub/device-test.html` trên cùng app bằng Safari, bấm **Chạy kiểm tra trên điện thoại**. Nếu cần tìm lỗi tách tiếng, chọn file bị lỗi trước khi chạy. Video không được tải lên máy chủ. Giữ Safari ở phía trước và màn hình sáng.

Trang tải cùng FFmpeg single-thread 0.12.10 và wrapper 0.12.15 của phần dịch video. Nó tạo mẫu H.264/AAC hai giây trên máy, gắn video qua WORKERFS, tách tối đa 30 giây sang PCM mono 16 kHz, kiểm tra dữ liệu rồi ghép MP4 với hình copy và tiếng AAC 160k. Từ chối file lớn hơn 256 MiB cho bài thử.

Sau khi giải phóng FFmpeg, trang gọi **chính `xuatHinh` và `veLop` của app** để dựng phụ đề Việt có dấu, lớp che và logo trên mẫu 320×180. Mẫu này được ghép lại với âm thanh. Có nút phát và tải MP4. Giọng Edge tùy chọn gửi một câu mẫu cố định đến máy chủ PHAHA, rồi giải mã MP3 trên trình duyệt và hiện trình phát.

Thông tin WebGPU gồm xin adapter/device; chưa chạy mô hình tách nhạc. Trình duyệt không xác định được chính xác đời máy iPhone từ UA. Nhãn và nhật ký chỉ mô tả khả năng trình duyệt, không tự kết luận đó là iPhone 17 Pro Max.

Kết quả có thể là đạt, lỗi, chưa hỗ trợ hoặc đã dừng. Không chuyển một bước thiếu hỗ trợ thành đạt. Có deadline, nút dừng và giải phóng worker/blob URL. Nhật ký chứa tên file và UA, không đọc kho API key. Sao chép nhật ký hoặc tải TXT để gửi lại.

Bài thử không kiểm chứng toàn bộ nghe/dịch bằng mã dịch vụ của chủ app, tách nhạc AI, Piper, chất lượng dịch, tải RedNote hay hiệu năng video dài. Các kết quả Node/WASM trong môi trường phát triển không được coi là kết quả chạy trên iPhone; cần nhật ký từ chính điện thoại.

Kiểm tra trước khi xuất bản: 89 test Node (80 cũ, 8 kiểm tra dữ liệu/timeout/hủy và 1 hồi quy lỗi caption), build và artifact hợp lệ. FFmpeg WASM trong Node tạo mẫu 320×180 hai giây, tách 32.768 mẫu mono 16 kHz (2,048 giây, có AAC padding), ghép MP4 16.021 byte với H.264 và AAC; ffprobe đọc thời lượng 2,000 giây. Đây là kiểm chứng lệnh và core, không phải Safari/iPhone. Sửa thêm việc lớp phủ giữ signal của lượt chạy ban đầu khi đang tải font/module, để Dừng rồi chạy lại không làm lượt cũ tiếp tục dựng hình.
