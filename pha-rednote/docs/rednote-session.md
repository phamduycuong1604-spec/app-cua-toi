# Phiên Rednote trên máy chủ

Trong app, mở **Đăng nhập Rednote · quản trị** dưới nút chọn video từ máy.
Chỉ tài khoản ChatGPT chủ app được lưu, kiểm tra hoặc xóa phiên.

1. Trên máy tính, đăng nhập `www.xiaohongshu.com` hoặc `www.rednote.com` và mở bài cần tải.
2. Trong Developer Tools → Network, chọn request trang bài của đúng miền, mở Request Headers và sao chép **giá trị Cookie**. Không sao chép mật khẩu, toàn bộ lệnh cURL hoặc Response Headers/Set-Cookie.
3. Trong app, chọn đúng miền, dán cookie, bấm **Lưu phiên**. Ô nhập được xóa sau thao tác; cookie không được hiện lại.
4. Dán link bài cần đăng nhập vào ô Link video phía trên, rồi bấm **Kiểm tra phiên**. Khi app xác minh được đăng nhập, trạng thái hiện **Đã đăng nhập**. Nếu chỉ nhận trang công khai hoặc gặp lỗi mạng, trạng thái sẽ là chưa xác minh, không khẳng định cookie còn hiệu lực.
5. Bấm lấy video như thường. Bài công khai được đọc trước không kèm cookie; khi gặp yêu cầu đăng nhập, máy chủ thử phiên đã lưu. Khi phiên bị từ chối: **Phiên đăng nhập Rednote hết hạn, vui lòng cập nhật lại**. Có thể lưu cookie mới hoặc chọn video từ máy.

Cookie được mã hóa AES-256-GCM trong R2 (`BUCKET`); khóa mã hóa riêng nằm trong runtime secret `REDNOTE_SESSION_KEY` (32 byte mã hóa base64). `REDNOTE_SESSION_ADMIN_EMAIL` cho phép đúng email chủ app quản lý phiên, kết hợp danh tính do Sites cấp. Không thay khóa mã hóa trừ khi chấp nhận phải nhập lại cookie.

API quản trị `/api/rednote/session` (GET trạng thái, PUT lưu, DELETE xóa) và `/api/rednote/session/check` (POST kiểm tra) chỉ trả trạng thái. Thao tác ghi yêu cầu JSON và Origin cùng app. Cookie không có trong source, log, query, localStorage hoặc phản hồi API. Mỗi lần chuyển hướng đều tính lại phạm vi cookie: chỉ HTTPS trên miền đã chọn; không gửi sang xhslink, CDN hoặc dịch vụ AI.

Phiên được quản lý theo tài khoản chủ app trên máy chủ. Tài khoản Rednote vẫn phải có quyền xem bài. Cookie không vượt được CAPTCHA, chặn IP/vùng mạng hoặc các yêu cầu xác minh thiết bị của Rednote. Nếu gặp các rào cản đó, có thể vẫn cần tải thủ công rồi chọn video từ máy.

Kiểm thử mô phỏng: `node scripts/rednote-session.test.mjs`. Toàn app: `npm run build && node --test scripts/*.test.mjs`. Kiểm thử với tài khoản thật cần chủ app cấu hình cookie trong giao diện; không gửi cookie vào cuộc chat.
