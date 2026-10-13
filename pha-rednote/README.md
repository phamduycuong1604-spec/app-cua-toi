# PHA Rednote & PHAHA Video Studio

App điện thoại: tải video nguồn Rednote, giữ caption gốc để copy/lưu,
nghe/dịch lời Trung và lồng tiếng Việt vào video.

App riêng tư: https://pha-rednote-studio.phamduycuong1604gmail-com.chatgpt.site

## Sử dụng

1. Dán toàn bộ đoạn chia sẻ Rednote, chọn chuyên môn và lấy video gốc.
   Tải xong app tự đưa sang Dịch & lồng tiếng, không cần lưu vào Tệp trước.
2. Chạm **Dịch & lồng tiếng video**, hoặc chọn video từ máy.
3. Mở **Cài đặt** trong Video Studio. Nhập Groq + DeepSeek, hoặc Gemini.
   Bật và xếp thứ tự giọng; Giọng máy dùng Piper tiếng Việt sau lần tải đầu.
4. Căn phụ đề, lớp che chữ Trung, logo và âm lượng nhạc trên khung xem trước.
5. Bắt đầu. Sửa các dòng thiếu trong bảng lời thoại; **Làm lại** tạo lại giọng
   và video mà không dịch lại. Lưu/chia sẻ MP4, tải SRT và sao chép nhật ký.

Video dưới 256 MiB nhận vào app. File lớn tải theo từng phần 8 MiB với tối đa bốn luồng song song vào bộ
lưu trữ riêng của trình duyệt (OPFS), sau đó chuyển thẳng sang studio, tối đa
hai GiB. Gom dữ liệu thành các lần ghi tối đa 1 MiB, không giữ cả file trong RAM.
Hiện tốc độ MB/s và thời gian còn lại ước tính. Có kiểm tra dung lượng trống,
tải lại riêng phần bị mất mạng và xóa file dở. Nếu nguồn không hỗ trợ Range,
dùng một luồng toàn file. Tốc độ vẫn phụ thuộc mạng và máy chủ nguồn.
Safari cần hỗ trợ OPFS và đủ dung lượng; chế độ riêng tư có thể không cho lưu.
Nếu không lưu được, app giữ nút tải về Tệp và báo đúng lỗi. File lớn chỉ dùng
WORKERFS để tránh chép toàn bộ vào RAM; thời gian/khả năng xuất còn phụ thuộc
thiết bị, độ dài video và cài đặt lớp phủ/AI.
Chỉ tải nguồn `originVideoKey`, không có lựa chọn bản chia sẻ. App đọc độ phân
giải thật khi xử lý. Bản gốc vào Studio ngay sau khi tải, không hạ độ phân giải
trước bước nghe/dịch. Khi xuất, hạ 2K/4K xuống tối đa 1080×1920 (dọc)
hoặc 1920×1080 (ngang) cùng lần dựng phụ đề/lớp che/logo,
giữ tỉ lệ, thời lượng và tiếng nguồn. Video nhỏ hơn giữ nguyên, không phóng lớn.
Bước dựng hình khi xuất dùng Mediabunny/WebCodecs trong Safari.
Nếu chỉ muốn lưu video nguồn 1080p, chạm Chuẩn bị bản lưu 1080p; app hạ và
ghi đầu ra xuống OPFS. Chạm Lưu video hoặc Chia sẻ khi bản đó sẵn sàng.
Chỉ cho lưu file sau khi chuẩn bị xong bản tối đa 1080p. Máy không hỗ trợ thì báo lỗi,
không đưa bản 4K hoặc bản chia sẻ ra nút lưu thay thế.
Logo đã ghép trong nội dung nguồn có thể vẫn còn. Rednote có thể chặn bài,
yêu cầu đăng nhập hoặc làm link hết hạn; không bảo đảm tải mọi link.

## Dữ liệu & dịch vụ

Hình video xử lý trên thiết bị. ASR gửi âm thanh, dịch gửi lời thoại và TTS gửi
chữ Việt tới dịch vụ đã chọn. Mã dịch video lưu trên điện thoại; khi gọi API qua
Worker, máy chủ nhận mã tạm thời để chuyển yêu cầu, không lưu hoặc ghi nhật ký mã.
Bản sao khóa bằng mật khẩu riêng trên điện thoại trước khi đồng bộ R2.
Caption bài viết không được dịch, không gọi Google/Gemini/ChatGPT. Caption gốc
và chỉnh sửa lưu riêng trên điện thoại; có nút copy và lưu .txt. Làm mới xóa
caption đã lưu và file video trong bộ lưu trữ app của lượt hiện tại.

App dùng đăng nhập riêng của chủ sở hữu qua ChatGPT. Edge được nối trực tiếp
qua Worker theo mã PHAHA đã cung cấp; Microsoft có thể chặn hoặc đổi dịch vụ.
Cloudflare cần token và Account ID riêng, hoặc binding Workers AI trên máy chủ.
Không triển khai thêm tài khoản PHAHA / tab Lịch việc.
Các dịch vụ AI cần mã và hạn mức thật; kiểm tra mã chỉ báo thông tin API có
cung cấp. Thời gian 5–7 phút cho video 10 phút chưa được đo trên iPhone.

## Build và kiểm tra

Node.js 22+: `npm ci`, `npm run build`, `npm run check`,
`node scripts/validate-artifact.mjs`.

`node scripts/source-wasm-check.mjs <fixture.mp4>` chạy đúng các hàm tách tiếng
và ghép MP4 mới bằng FFmpeg WASM thật, kiểm tra video dọc 4K có tiếng AAC. Kiểm tra này không thay thế
việc chạy trên Safari thật hoặc bằng mã AI thật.

Source: `worker/`, `web/`. Build gói tài nguyên và Worker vào một file
`dist/server/index.js`; cấu hình Sites trong `.openai/hosting.json`.
Không đưa mã API vào source/manifest. Giữ quyền truy cập owner-private.

Chi tiết pipeline, giới hạn và cấu hình máy chủ:
[docs/video-studio.md](docs/video-studio.md).
Nguồn và thay đổi tích hợp: [docs/video-source-integration.md](docs/video-source-integration.md).
Nguồn thư viện và ghi công: [docs/third-party-notices.md](docs/third-party-notices.md).
