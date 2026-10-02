# PHAHA

App quản lý công việc hàng ngày cho điện thoại (cài được vào màn hình chính).

## Các file

| File | Dùng để |
|---|---|
| `index.html` | Bộ khung: các nút, ô nhập |
| `style.css` | Màu sắc, kích thước, bố cục |
| `app.js` | "Bộ não": thêm/sửa/xóa, lưu dữ liệu, nhắc lịch |
| `sw.js` | Chạy ngầm: giúp app mở khi mất mạng và hiện thông báo |
| `manifest.json` | Tên, biểu tượng khi cài vào màn hình chính |
| `icons/` | Biểu tượng app |
| `may-chu.js` | Địa chỉ máy chủ nhắc giờ (tự động điền) |
| `may-chu/` | Máy chủ nhắc giờ chạy trên Cloudflare: gửi thông báo kể cả khi app tắt |
| `.github/workflows/may-chu.yml` | Tự động đưa máy chủ lên Cloudflare |

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
