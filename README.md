# Việc Hôm Nay

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

Web app chỉ nhắc được khi app đang mở hoặc vừa chạy ngầm. Muốn chắc chắn được nhắc
kể cả khi tắt hẳn app: mở việc đó → bấm **📅 Thêm vào lịch điện thoại**.
