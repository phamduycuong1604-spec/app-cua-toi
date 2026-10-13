# PHAHA Video Studio — luồng hiện tại

Bản hiện tại dùng mã dịch/lồng tiếng do chủ app gửi, thay nhánh xử lý cũ.
Xem [nguồn, cấu hình máy chủ và kiểm tra](video-source-integration.md).

1. Tải Rednote hoặc chọn video tối đa hai GiB. File tải lớn dùng OPFS theo từng phần; cần đủ dung lượng trình duyệt. File được chuyển qua
   `PHADownload` sang nhánh dịch mà không chọn lại.
2. Chọn chuyên môn PHA cho dịch video; nhánh video dùng chuyên môn,
   từ điển và quy tắc riêng. App không tự đọc lịch sử trò chuyện ChatGPT.
3. Cài mã Gemini hoặc Groq + DeepSeek. Trong Cài đặt, bật và xếp thứ tự giọng.
4. Căn phụ đề, vùng che chữ Trung, logo và nhạc trên khung xem trước.
5. Chạy: FFmpeg WORKERFS đọc video, tách PCM mono 16 kHz, chia gần khoảng
   lặng thành đoạn khoảng 90 giây; tối đa ba đoạn nghe cùng lúc.
6. Groq → Cloudflare → Azure nghe. DeepSeek → Groq → Cloudflare → OpenRouter
   → Azure Translator dịch theo nhóm 40 câu; hỏng thì quay về Gemini nghe/dịch.
   Gemini chạy trước khi được chọn. Azure Translator không nhận lời nhắc
   chuyên môn như mô hình ngôn ngữ; nhật ký ghi rõ khi dùng dự phòng này.
7. Tìm khoảng âm thanh chưa có lời, nghe bù tối đa sáu khoảng/đoạn. Câu sót
   được dịch lại theo nhóm nhỏ, rồi đổi dịch vụ. Câu trống giữ để sửa.
8. Lồng tiếng chạy cùng tách nhạc và dựng lớp phủ. Mỗi video dùng một giọng;
   lỗi thì đọc lại toàn bộ bằng giọng tiếp theo. Edge chỉ được bỏ trống tối đa
   10% câu và ghi cảnh báo. Giọng máy chờ tách nhạc/dựng hình xong.
9. Tách nhạc MDX-Net: Nhanh ~28 MiB, Kỹ ~56 MiB; ONNX Runtime 1.22.0
   WebGPU hoặc CPU. Lỗi chuyển sang giảm tiếng gốc trong vùng lời.
10. Phụ đề/logo/vùng che dùng canvas và Mediabunny 1.61.1 / WebCodecs.
    Không hỗ trợ dựng hình thì xuất hình gốc, ghi rõ thiếu lớp phủ và vẫn có SRT.
11. Xếp lời bằng WSOLA, tăng tốc tối đa 1,6× hoặc 1,9× khi trễ; không đè hai
    câu. Lời cuối vượt video sẽ dừng để sửa. Ghép hình stream-copy với tiếng
    AAC 160 kbps, `+faststart`; không mã hóa hình thêm lần thứ hai.
12. Sửa chữ và Làm lại, Lưu/chia sẻ MP4, tải SRT và sao chép nhật ký.

Mã được lưu localStorage trên điện thoại. Đồng bộ dùng mật khẩu riêng tối thiểu
10 ký tự để mã hóa trước khi gửi R2. Máy chủ giữ tối đa mười bản cũ đã khóa.
Đồng bộ không thay thế nhập video; video/giọng/lời thoại chưa tự khôi phục
khi đóng tab. Cài đặt cũ được di chuyển trên chính thiết bị; không xóa bản cũ.

Các script `dub-wasm-check.mjs` và `audio-wasm-check.mjs` giữ để kiểm tra
codec/helper của phiên bản trước, không phải bằng chứng cho giao diện mới.
Kiểm tra WebGPU, WebCodecs, Piper và thời gian chạy cần iPhone thật.

Caption bài viết chỉ giữ nguyên để copy/lưu, không dùng trong luồng dịch tự động. Video lớn được kiểm tra bằng file tổng hợp 585.510.074 và 678.433.035 byte ghi xuống đĩa; chưa phải kiểm tra Safari trên iPhone thật.

Trước khi chuyển file Rednote vào studio, app chỉ tải nguồn gốc và chuẩn bị tối đa 1080p bằng Mediabunny 1.61.1/WebCodecs. Không thêm logo, không cắt khung, không bỏ tiếng gốc; độ phân giải, số track âm thanh và thời lượng được kiểm tra lại sau khi ghi OPFS. Chưa đo tốc độ hạ 4K trên iPhone thật.
