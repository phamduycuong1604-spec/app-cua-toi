# Cấu hình chuyên môn caption PhaHa

Cập nhật ngày 10/10/2026 theo yêu cầu chủ app. Mục Phaha là kênh tổng hợp, được chủ app xác nhận trong phiên này.

Nguồn quy tắc: PHA Việt Hóa, PHA Content và quy tắc chung PHA AI OS, hồ sơ ngày 06/10/2026. Các vai trò Color, Light, Film và Sản Phẩm Số được dùng để đối chiếu phạm vi chuyên môn.

Nguồn skill đã đọc: `skill://plugins_6ac51587b39c819193fbda3b7dcc4e81/pha-translate/references/common.md`.

| Kênh | Phạm vi |
| --- | --- |
| Pha Chuyện Ảnh | Kiến thức nhiếp ảnh và hậu kỳ |
| Pha Color Grading | Chỉnh màu và retouch ảnh |
| Pha Lab | Preset, ACR, Capture One, LUT và tài nguyên |
| Pha Edit | Quay dựng và chỉnh màu video |
| PhaHa Ơi | DIY, handmade, decor, hoa và đạo cụ |
| Nhà PhaHa | Nuôi dạy con, mẹ bầu và gia đình |
| Phaha | Tổng hợp hệ sinh thái PhaHa |
| Pha Light | Lighting nhiếp ảnh |

Các cấu hình thật nằm trong `CHANNEL_PROFILES` của `worker/index.js`. Mỗi cấu hình có nhãn, mô tả, nhóm từ điển, quy tắc dịch và câu kết nếu đã xác minh.

Gemini nhận hướng dẫn chuyên môn và quy tắc bổ sung của người dùng. Google dịch miễn phí áp dụng từ điển thuật ngữ; không mô phỏng việc hiểu và áp dụng mọi yêu cầu về giọng văn. Hai chế độ dùng cùng dữ liệu từ điển. Nguồn không được tự thêm thông số, công thức, giá, dịch vụ hay kiến thức.

Pha Chuyện Ảnh và Pha Lab có tùy chọn ghép câu kết đã xác minh. Mặc định không ghép vào bản dịch sát nguồn. Không tự thêm CTA, biến bản dịch thành ba bài đăng hoặc tự tạo nội dung ngoài nguồn.

Lựa chọn chuyên môn, quy tắc riêng và lựa chọn câu kết lưu trong localStorage trên thiết bị dưới khóa `pha-rednote-channel-settings-v1`. API key vẫn chỉ ở bộ nhớ tab. Quy tắc giọng văn gửi đến máy chủ và Gemini khi dịch AI. Thiết bị khác hoặc trình duyệt xóa dữ liệu không tự nhận cấu hình này.

App không có kết nối đọc toàn bộ lịch sử ChatGPT. Notion Memory được kiểm tra trong phiên này và chưa có bộ nhớ đã lưu. Không suy diễn rằng hướng dẫn từ mọi cuộc trò chuyện đã được nhập hoặc sẽ tự đồng bộ.

Kiểm tra: thuật ngữ theo kênh, hướng dẫn và quy tắc riêng gửi qua API đến Gemini bằng mock, câu kết opt-in không lặp, fallback trên trình duyệt và lưu cấu hình riêng từng kênh; các kiểm tra tải video hiện có vẫn chạy.
