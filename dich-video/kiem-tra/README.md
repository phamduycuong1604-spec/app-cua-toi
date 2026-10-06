# Bộ kiểm tra tự động – trang Dịch video (PhaHa)

Chạy app thật trong Chromium (Playwright), **giả lập mọi dịch vụ bên ngoài** (Gemini, Groq, DeepSeek,
Cloudflare/máy chủ PHAHA, ElevenLabs, Viettel AI, FPT.AI, Fish, Azure, Google Cloud, OpenRouter, Edge),
nên không tốn lượt, không cần mã thật.

## Chuẩn bị (1 lần)
```bash
./chuan-bi.sh          # cần node/npm + ffmpeg; tạo thư mục du-lieu/ (không đưa lên git)
```
Mô hình AI tách nhạc (`mdx/*.onnx`) app tự lấy trong `dich-video/mo-hinh/`.

## Chạy
```bash
node kiemtra.mjs                 # tất cả kịch bản (~45, mất 15–25 phút)
node kiemtra.mjs 1- 29 33        # chỉ các kịch bản có tên bắt đầu bằng 1-, 29, 33
node dongbo-test.mjs             # đồng bộ cài đặt giữa 2 máy
node dongbo-test2.mjs            # tình huống từng làm mất dữ liệu đồng bộ (đã sửa)
```
Biến môi trường: `PLAYWRIGHT` (đường dẫn playwright/index.mjs nếu khác `/opt/node-tools/...`),
`S` (thư mục dữ liệu, mặc định `du-lieu/`).

Mỗi kịch bản in 1 dòng JSON: `buoc` (✅ xong, ❌ lỗi, – bỏ qua, ○ chưa chạy cho 7 bước),
`loi` (thông báo lỗi trên màn hình), `goi` (số lần gọi từng dịch vụ), `probe` (ffprobe video xuất ra).
Nhật ký đầy đủ của từng kịch bản ghi vào `du-lieu/kt-<tên>.log`.
Kịch bản `10-het-sach` và `14-khong-tieng` CỐ Ý báo lỗi.
