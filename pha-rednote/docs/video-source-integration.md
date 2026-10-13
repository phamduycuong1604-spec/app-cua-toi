# Bộ mã PHAHA do chủ app cung cấp

Nguồn: https://github.com/phamduycuong1604-spec/app-cua-toi
Snapshot: `10be28d6936da7f7b2cd9a48f149aed1871b4ae5`.

Đã đọc 13 file được gửi: tám file trong `dich-video/` và năm file
trong `may-chu/src/`. Danh sách kích thước/SHA-256 trong
`video-source-manifest.json`. Chỉ nhánh dịch/lồng tiếng được thay.

## File tích hợp

- `index.html`, `style.css` → `web/dub.html`, `web/dub.css`, CSS giới hạn
  trong `#videoStudio` để không đổi giao diện tải/caption.
- `app.js` → `web/dub-client.js`, giữ pipeline của chủ app: FFmpeg,
  chia đoạn 90 giây, nghe/dịch/dịch bù, lồng tiếng, tách nhạc và ghép MP4.
- `lop-phu.js`, `du-phong.js`, `tach-nhac.js`, `doc-may.js`, `dong-bo.js`
  → các file cùng tên trong `web/`.
- Máy chủ: dùng cơ chế Edge từ `edge-tts.js`; `worker/video-server.js`
  nối API `/ai/` và đồng bộ mã hóa với hosting hiện tại.
- `tai-khoan.js`, toàn bộ `index.js` máy chủ và `rednote.js` được đối chiếu;
  không thay hệ thống tài khoản hoặc tải Rednote của app hiện tại.
  App riêng tư dùng đăng nhập chủ sở hữu của Sites, không giả lập vé PHAHA.

## Điều chỉnh cần thiết

`web/site-bridge.js` chuyển API ra ngoài thành proxy cùng nguồn, di chuyển mã
và tùy chọn cũ trên điện thoại sang cấu trúc mã gốc, đưa chuyên môn/từ điển PHA
và quy tắc riêng vào lời nhắc. Mã nằm trên thiết bị; máy chủ đọc tạm mã khi
chuyển yêu cầu nhưng không lưu mã. Header đăng nhập Sites/cookie không chuyển
sang nhà cung cấp. Đồng bộ chỉ lưu ciphertext AES-GCM trong R2, PBKDF2-SHA256
250.000 vòng; vẫn mở được định dạng nguồn cũ 150.000 vòng.

FFmpeg, ba mô hình ONNX và cấu hình giọng được tải qua đường cùng nguồn.
Các mô hình giữ đúng bản ở snapshot trên; CacheStorage trên điện thoại
giảm tải lại. Không cần SharedArrayBuffer. Edge có ba lượt thử, sau đó tách
câu ở khoảng trắng và thử từng nửa; Microsoft vẫn có thể chặn dịch vụ.
Cloudflare cần token + Account ID của chủ app hoặc máy chủ đã bật Workers AI.

Bổ sung thứ tự giọng kéo bằng ↑/↓, bật/tắt giọng máy, nút Dừng, hủy công việc
nền và chờ các yêu cầu đang chạy kết thúc trước khi đổi giọng. Sửa lời hoặc
lớp phủ làm mất hiệu lực kết quả cũ. Câu chưa dịch được vẫn giữ để sửa và
chặn xuất video thiếu lời. Không lọc bỏ CTA thực sự có trong lời nguồn.

## Kiểm tra và giới hạn

`npm run check`: 80 ca qua, gồm hồi quy downloader/caption/API cũ, trạng thái giao diện nguồn,
proxy/mã hóa, đổi giọng và lỗi Edge. DOM stub không phải Safari thật.
`node scripts/source-wasm-check.mjs <fixture.mp4>` chạy chính các hàm tách
tiếng và xuất MP4 của source mới bằng FFmpeg WASM thật. Fixture dọc, có tên file tiếng Trung,
2160×3840, AAC, 18 giây, WORKERFS với file ảo khoảng 96 MiB: tách được
288.299 mẫu mono 16 kHz, xuất MP4 giữ hình 4K và AAC 18 giây; lượng đọc
851.968 byte, lượt đọc lớn nhất 32.768 byte, heap WASM 40.304.640 byte.
Đây không phải file lỗi gốc của chủ app và không xác minh bộ nhớ Safari.

Chưa có mã AI thật để kiểm tra toàn bộ nghe/dịch/đọc với tài khoản trả phí.
Tách nhạc WebGPU/Piper và dựng hình WebCodecs cần kiểm tra trên điện thoại.
Không cam kết thời gian 5–7 phút cho video 10 phút. Tìm khoảng thiếu lời
trong mã nguồn là phép đo năng lượng âm thanh, có thể nhầm nhạc thành lời.
