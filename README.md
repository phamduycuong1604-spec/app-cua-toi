# PHAHA

App quản lý công việc hàng ngày cho điện thoại (cài được vào màn hình chính).

## Các file

| File | Dùng để |
|---|---|
| `index.html` | Bộ khung: các nút, ô nhập |
| `style.css` | Màu sắc, kích thước, bố cục |
| `app.js` | "Bộ não" tab Lịch việc: thêm/sửa/xóa, lưu dữ liệu, nhắc lịch |
| `chung/gop.js` | Gộp dữ liệu từng mục giữa các máy (app và máy chủ dùng chung) |
| `tai-khoan.js` | Đăng nhập, đăng xuất, tự đồng bộ dữ liệu với máy chủ |
| `cai-dat.js` | Trang ⚙️ Cài đặt: đổi mật khẩu, sửa gói màu/mục chi, quản lý tài khoản |
| `thu-chi.js` | "Bộ não" tab Thu chi: bán preset, thu khác, chi, tổng hợp theo ngày/tháng/năm |
| `sw.js` | Chạy ngầm: giúp app mở khi mất mạng và hiện thông báo |
| `manifest.json` | Tên, biểu tượng khi cài vào màn hình chính |
| `icons/` | Biểu tượng app |
| `may-chu.js` | Địa chỉ máy chủ nhắc giờ (tự động điền) |
| `may-chu/` | Máy chủ nhắc giờ chạy trên Cloudflare: gửi thông báo kể cả khi app tắt |
| `.github/workflows/may-chu.yml` | Tự động đưa máy chủ lên Cloudflare |
| `dich-video/` | App **PhaHa lồng tiếng**: video tiếng Trung → dịch → lồng tiếng Việt (xem mục bên dưới) |

## Khi sửa code

Mở `sw.js`, tăng số phiên bản (`viec-hom-nay-v2` → `v3`) để điện thoại tải bản mới.

## Đưa app lên mạng (GitHub Pages, miễn phí)

1. Vào trang kho code trên GitHub → **Settings** → **Pages**.
2. Mục **Branch**: chọn nhánh chứa code, thư mục `/ (root)` → **Save**.
3. Chờ 1–2 phút, GitHub hiện đường link dạng `https://<tên-bạn>.github.io/app-cua-toi/`.
4. Mở link đó trên điện thoại:
   - **Android (Chrome)**: menu ⋮ → **Thêm vào màn hình chính** / **Cài đặt ứng dụng**.
   - **iPhone (Safari)**: nút Chia sẻ → **Thêm vào MH chính**.

Lưu ý: kho code phải để **Public** thì GitHub Pages mới miễn phí.

## Giới hạn của nhắc lịch

Mỗi việc có giờ được nhắc lúc **bắt đầu**. Nếu có giờ kết thúc, app nhắc thêm lúc
**giữa chừng** (kèm tiến độ checklist) và lúc **kết thúc**.

Web app chỉ nhắc được khi app đang mở hoặc vừa chạy ngầm. Muốn chắc chắn được nhắc
kể cả khi tắt hẳn app: mở việc đó → bấm **📅 Thêm vào lịch điện thoại**.

## Máy chủ nhắc giờ (thông báo cả khi tắt app)

Làm một lần:

1. Tạo tài khoản miễn phí tại https://dash.cloudflare.com/sign-up
2. Vào **Workers & Pages** một lần (để Cloudflare tạo tên miền `workers.dev`).
3. Lấy **Account ID**: ở trang Workers & Pages, cột bên phải có dòng **Account ID** → bấm sao chép.
4. Tạo **API Token**: ảnh đại diện → **My Profile** → **API Tokens** → **Create Token** →
   mẫu **Edit Cloudflare Workers** → **Use template**. Ở phần Permissions bấm **+ Add more**,
   thêm dòng **Account · D1 · Edit**. Bấm **Continue to summary** → **Create Token** → sao chép.
5. Trên GitHub: **Settings** → **Secrets and variables** → **Actions** → **New repository secret**,
   thêm 2 chìa khóa: `CLOUDFLARE_ACCOUNT_ID` và `CLOUDFLARE_API_TOKEN`.
6. Vào mục **Actions** → **Triển khai máy chủ nhắc giờ** → **Run workflow**.
7. Chạy xong (dấu ✓ xanh), chờ 2–3 phút, mở app → bấm nút chuông 🔔 → **Cho phép**.

## Tài khoản người dùng

- Chỉ quản trị viên cấp tài khoản (⚙️ Cài đặt → Quản lý tài khoản).
- Tài khoản quản trị đầu tiên: mở app → nhập tên, mật khẩu và **mã khởi tạo**
  (chính là `CLOUDFLARE_ACCOUNT_ID` đã lưu trong GitHub Secrets).
- Dữ liệu mỗi người lưu trên máy chủ (Cloudflare D1), đổi máy hay cài lại app vẫn còn.
- Mật khẩu chỉ lưu dạng đã băm (PBKDF2); sai 5 lần bị khóa 15 phút.
- Đồng bộ **gộp từng mục** (không ghi đè cả danh sách): thêm ở máy nào cũng giữ, xóa ở máy nào thì máy khác xóa theo.
- **Bản lưu tự động**: máy chủ cất nội dung cũ trước khi thay đổi (ngay khi có mục bị xóa, còn lại 10 phút/bản, giữ 200 bản).
  Khôi phục trong ⚙️ Cài đặt → Sao lưu & khôi phục (chỉ thêm lại mục đang thiếu). Có thêm nút xuất/nhập file sao lưu.

## PhaHa lồng tiếng (thư mục `dich-video/`)

Mở: `https://phamduycuong1604-spec.github.io/app-cua-toi/dich-video/`

1. Lấy mã Gemini miễn phí: https://aistudio.google.com/apikey → **Create API key** → sao chép.
2. Mở app → ⚙️ → dán mã → chọn giọng → **Lưu**.
3. Chọn video → **Bắt đầu**. App tự: tách tiếng → Gemini nghe tiếng Trung & dịch → Gemini đọc tiếng Việt → ghép vào video.
4. Sửa câu dịch nếu muốn → **Làm lại**. Xong bấm **Lưu video** → **Lưu video** (vào Ảnh).

- Hình giữ nguyên, chỉ thay tiếng (giữ lại nhạc gốc nhỏ, chỉnh trong ⚙️).
- Mã miễn phí có giới hạn lượt; hết lượt app tự chờ, hết lượt trong ngày thì báo.
- Video nặng (trên ~300MB) có thể làm điện thoại bị đơ.
