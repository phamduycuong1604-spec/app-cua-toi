# PHA Rednote — mã app hiện tại từ Sites

Bộ mã này được chép nguyên vẹn từ app PHA Rednote/PHAHA Dịch video đang chạy trên Sites, đã áp PHA bản 34 · Phần sửa 12.

- Commit nguồn Sites: `a7c0db3fecdea17c1ed8c43b312e2029bd024725`.
- `pha_edit` là cấu hình chuyên môn Pha Edit trong `worker/index.js`.
- Dịch/lồng tiếng/xuất MP4: `web/dub-client.js`.
- Phụ đề/lớp che/logo/ghép hình với tiếng: `web/lop-phu.js`.
- Giao diện: `web/dub.html`, `web/dub.css`.
- Tải video: `web/video-download.js`, `worker/index.js`.
- Máy chủ: `worker/video-server.js`, `worker/edge-tts.js`, `worker/dub.js`.

## Cài và build

Dùng Node.js 24 hoặc mới hơn, chạy trong thư mục `pha-rednote`:

```sh
npm ci
npm run build
node --test scripts/*.test.mjs
```

Bộ kiểm tra tại thời điểm chép: 163/166 đạt. Một test font còn dùng kỳ vọng cũ; hai mock dựng hình chưa có `Quality`. Các test gốc được giữ nguyên. Phần sửa 12 được áp nguyên nội dung; mục dọn file kết quả cũ chưa hiệu quả do `invalidateResult()` xóa tham chiếu trước đó.

`.openai/hosting.json` giữ định danh app Sites hiện có. Nếu dùng bộ mã này cho app mới hoặc hosting khác, cần cấu hình lại theo nền tảng của bạn. Không kèm mã API, thông tin đăng nhập, `node_modules`, video thử hoặc thư mục `.git`.

Các file ở gốc kho và `dich-video/`, `may-chu/` là bộ mã cũ; thư mục `pha-rednote/` chứa bản app Sites hiện tại. Tệp `SOURCE-SITES.json` ghi commit và SHA-256 của 60 file được chép.
