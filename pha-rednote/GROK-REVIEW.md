# Bàn giao kiểm tra PHA Rednote trên Sites — bản 35

Đây là ảnh chụp mã nguồn app Sites đang chạy, không phải app `dich-video/` hiện có trên main.

- Ngày xuất: 28/11/2026.
- Commit nguồn Sites: `46b3abe8c8ba26968dd5d7f3cd6f649150ae6879`.
- Git tree nguồn: `e0f08db464f02fa345bce8cfc7cfdad697326b23`.
- Nhánh bàn giao: `review/pha-rednote-v35-2026-11-28`.
- Không thay đổi triển khai Sites khi đưa mã lên GitHub.
- Toàn bộ 108 tệp được Git theo dõi đã được chép, gồm code, test, lockfile, font và tài nguyên được build sẵn.
- Riêng `.openai/hosting.json`: đặt `project_id` thành null để không gắn bản sao với Site sản xuất. Khi triển khai cần điền project ID của Site đích. Không có API key hay dữ liệu trình duyệt của người dùng trong bản chép.

## Chạy build và test

Dùng Node.js 22 trở lên, chạy từ thư mục `pha-rednote/`:

```sh
npm ci
npm run build
node --test scripts/*.test.mjs
```

Bản nguồn này đã được build và kiểm tra khi khôi phục bản 35: 457/457 test Node đạt. Đây là kết quả kiểm tra trước đó, không phải xác nhận API Gemini trực tiếp hiện vẫn hoạt động.

## Vấn đề cần Grok đối chiếu

Nhật ký ngày 28/11/2026: video dài 04:21.1, 162 câu, SRT nhập ghép được 161/162 câu. Gemini dùng `gemini-2.5-flash-preview-tts` / `Kore`, tạo xong 8/9 gói. Gói còn lại nhiều lần nhận phản hồi không có audio qua các key; Làm lại đã tái sử dụng đúng 8 gói.

Các ca mô phỏng đã tái hiện trên mã này:
1. HTTP 200 nhưng không có audio: scheduler không giữ đủ nguyên nhân, không ghi finishReason/blockReason và xoay các key với cùng gói. Chưa có phản hồi gốc nên chưa xác định nguyên nhân Google không tạo gói cuối.
2. HTTP 400 với lỗi đầu vào: nguyên nhân bị bọc vào thông báo model tạm không dùng được; thiếu chi tiết trong nhật ký.
3. Lỗi TTS chạy song song đôi khi được đánh dấu sai bước Tải bộ xử lý / Nghe & dịch.

Lỗi độc lập: DeepSeek HTTP 402 Insufficient Balance; Groq đã dịch dự phòng. Không kết luận lỗi Gemini là do DeepSeek. Số lượt Gemini còn lại trên giao diện là ước tính; nhiều key cùng project có thể dùng chung quota.

Ưu tiên đọc các tệp:
- `web/phaha/gemini-tts.js`: hàng đợi, xử lý phản hồi, quota và khóa model/giọng.
- `web/phaha/giong-doc.js`: gộp gói, cache và đặt tiếng vào video.
- `web/phaha/app.js`: điều phối các bước song song và báo lỗi.
- `web/phaha/phu-de.js`: ghép SRT (bản 35 vẫn giữ mốc giờ/danh sách câu cũ).
- `web/phaha/tts-audio-cache.js`: lưu audio đã tạo.
- `scripts/`: kiểm thử hiện có.

## Phạm vi kiểm tra

Chỉ phân tích và báo cáo bằng chứng trước khi sửa. Giữ audio đã tạo, model/giọng đã khóa và không tự đổi sang Giọng máy. Phần tải video đang chạy là phạm vi cần giữ nguyên. Không dùng README cũ để suy ra hành vi tải; đối chiếu mã và test hiện tại. Không cam kết đã thử trên Mac/iPhone thật hoặc Gemini thật nếu chỉ dùng mô phỏng.
