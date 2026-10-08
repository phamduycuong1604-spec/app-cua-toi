# PhaHa AI — panel AI sửa ảnh trong Photoshop

Panel chạy **bên trong Photoshop**. Gõ prompt hoặc bấm nút mẫu → AI xử lý → kết quả tự chèn vào Photoshop thành **layer mới có mask mềm**, ảnh gốc giữ nguyên. Mỗi lần chèn là **1 bước Undo** (Ctrl+Z một lần là xóa sạch).

5 tab: **Gen API** · **Retouch** · **Special** · **Gen Free** · **Upscale**.

---

## 1. Cần có gì

| Thứ | Ghi chú |
|---|---|
| **Photoshop 2023 (bản 24.4) trở lên** | Bản 2021/2022 **không chạy được** — thiếu "Imaging API" để chèn ảnh đúng vị trí và tạo mask. |
| **Node.js 18+** | Để build. Tải ở nodejs.org (bản LTS). |
| **UXP Developer Tool** | Công cụ miễn phí của Adobe để nạp plugin khi đang phát triển. Cài từ app **Creative Cloud** → Apps → tìm "UXP Developer Tool". |

---

## 2. Chạy thử trong Photoshop (lần đầu, ~10 phút)

### Bước 1 — Build

Mở Terminal (macOS) / PowerShell (Windows) tại thư mục `phaha-ai-panel`:

```
npm install
npm run build
```

Xong sẽ có thư mục `dist/` — đó chính là plugin.

### Bước 2 — Bật máy chủ giả lập (khi chưa có backend thật)

Mở **thêm một** cửa sổ Terminal, cũng tại `phaha-ai-panel`:

```
npm run mock
```

Thấy dòng `Máy chủ giả lập PhaHa AI đang chạy: http://localhost:8787` là được. **Để nguyên cửa sổ này.**

> Máy chủ giả lập không có AI thật — nó chỉ đổi tông màu / làm mịn / phóng to ảnh để bạn **thấy layer được chèn đúng chỗ, đúng tên, có mask**. Ví có sẵn 500 điểm.

### Bước 3 — Nạp plugin vào Photoshop

1. Mở **Photoshop** trước.
2. Mở **UXP Developer Tool** → bấm **Add Plugin** → chọn file `phaha-ai-panel/dist/manifest.json`.
3. Ở dòng PhaHa AI vừa thêm, bấm **••• → Load**.
4. Trong Photoshop: menu **Plugins → PhaHa AI** để mở panel (nếu chưa tự hiện).

### Bước 4 — Đăng nhập

1. Bấm **Máy chủ ⚙** ở dưới form → điền `http://localhost:8787`.
2. Nhập email + mật khẩu **bất kỳ** → **Đăng nhập**.
3. Góc trên thấy **500đ** là thành công.

### Bước 5 — Thử từng tính năng

| Thử gì | Làm thế nào | Kết quả đúng |
|---|---|---|
| Gen cơ bản | Mở 1 ảnh → tab ✨ Gen → chọn "Đổi bầu trời" → "Hoàng hôn" → **Chạy** | Hàng đợi hiện job → ~4 giây sau có layer mới tên "Thay bầu trời thành hoàng hôn…", ảnh ngả vàng ấm. Điểm còn 485. |
| Chỉ sửa vùng chọn | Dùng Lasso khoanh 1 vùng → bật **Chỉ sửa vùng chọn** → Chạy | Layer mới có **mask đúng hình vùng chọn, mép mềm**. |
| Quên chọn vùng | Bỏ chọn (Ctrl+D) → bật Chỉ sửa vùng chọn → Chạy | Hiện cảnh báo "Bạn chưa chọn vùng…". |
| Giữ mặt gốc | Bật **Giữ mặt gốc** → Chạy (17đ) | 2 layer: layer nền + **"Face 1"** có mask hình elip. |
| Chạy liên tiếp | Bấm Chạy 3 lần liền | 3 job xếp hàng, lần lượt ra 3 layer. |
| Đóng ảnh giữa chừng | Bấm Chạy rồi đóng ảnh ngay | Job báo "ảnh gốc đã đóng" + nút **Chèn** để chèn vào ảnh đang mở. |
| Retouch | Tab 🖌️ → khoanh vùng → **Làm da** | Layer "Làm da" (mịn + hồng nhẹ). Kéo **Độ mờ layer** → layer đổi độ mờ theo. |
| Nút của tôi | Bấm ✎ → đặt tên "Mịn cổ" → Lưu → bấm nút | Layer tên "Mịn cổ". |
| Chạy tự động | **Chạy tự động** | 4 layer: Làm da - Đầu / Cổ vai / Tay / Chân. |
| Hàng loạt | **Chọn thư mục & chạy** → chọn thư mục vài ảnh JPG | Trong thư mục đó xuất hiện thư mục **Pixelius** chứa ảnh JPG đã xử lý. |
| Special | Tab 💇 → Fake tone → "Trắng đen" | Layer "Fake tone - Trắng đen", trừ 20đ. |
| Free | Tab 🎁 → nhập prompt → Chạy miễn phí | Layer "Free - …", không trừ điểm. |
| Upscale | Tab 🔍 → 2x → Phóng to | Ảnh to gấp đôi, layer "Upscale 2x" nằm trên layer gốc. |
| Hết điểm | Chạy đến khi còn < 15đ rồi bấm Gen | Cảnh báo "Không đủ điểm…". |
| Lịch sử | Bấm avatar → Lịch sử giao dịch | Danh sách trừ/cộng điểm. |

### Khi sửa code

Chạy `npm run watch` (tự build lại khi lưu file) → trong UXP Developer Tool bấm **••• → Reload**. Xem lỗi: **••• → Debug** (mở công cụ giống Chrome DevTools).

---

## 3. Cài cho người dùng thật (file .ccx)

```
npm run package
```

Tạo ra `release/PhaHa-AI-0.1.0.ccx`. Người dùng **nhấp đúp** file này → Creative Cloud tự cài vào Photoshop (có thể hiện cảnh báo "plugin chưa được xác minh" — bấm Cài vẫn được). Muốn hết cảnh báo thì phải đưa lên **Adobe Marketplace** (Adobe ký xác nhận).

> Trước khi phát hành: đổi `DEFAULT_API_BASE` trong `src/config.ts` thành địa chỉ máy chủ thật, tăng `version` trong `manifest.json`.

---

## 4. Nối với máy chủ PhaHa thật

Panel gọi các đường dẫn dưới đây. Mọi request (trừ đăng nhập) có header `Authorization: Bearer <token>`. Ảnh gửi đi là **data URL** (`data:image/jpeg;base64,...`).

| Đường dẫn | Gửi | Nhận |
|---|---|---|
| `POST /api/auth/login` | `{email, password}` | `{token, refresh_token, expires_in, user}` |
| `POST /api/auth/refresh` | `{refresh_token}` | `{token, refresh_token, expires_in}` |
| `GET /api/me` | — | `{id, name, email, avatar_url?, credits}` |
| `GET /api/transactions` | — | `{items: [{id, created_at, amount, description, balance}]}` |
| `GET /api/prompts` | — | `{groups: [{id, name, prompts: [{title, prompt}]}]}` *(không có thì dùng 14 nhóm sẵn trong panel)* |
| `GET /api/special/presets` | — | `{presets: [{id, name, group: hair/makeup/dress/tone, thumbnail?}]}` *(tùy chọn)* |
| `POST /api/gen` | `{prompt, model: "gpt-image-2.5"/"gpt-image-2", image, mask?, ref?, face_lock?, free?, max_side}` | `{job_id, cost?, credits_left?}` |
| `POST /api/retouch` | `{image, region, mask?, type: skin/clothes/custom, name, quality: standard/4k}` | `{job_id}` |
| `POST /api/retouch/detect` | `{image}` | `{regions: [{label, name, bounds:{left,top,right,bottom}}]}` *(toạ độ theo ảnh gửi lên)* |
| `POST /api/special` | `{image, preset, ref?}` | `{job_id}` |
| `POST /api/upscale` | `{image, scale?: 2/4, mpx?: 12/24, target_width, target_height}` | `{job_id}` |
| `GET /api/jobs/:id` | — | `{id, status: pending/running/done/error/canceled, progress?: 0..1, error?, credits_left?, result?}` |
| `POST /api/jobs/:id/cancel` | — | `{ok: true}` *(không hỗ trợ thì trả 404, panel vẫn ẩn job)* |

**Kết quả job** (`result`):

```
{ "layers": [
    { "image": "<base64 | data URL | https URL>" },
    { "name": "Face 1", "image": "...", "mask": "...", "x": 120, "y": 40, "width": 300, "height": 360 }
] }
```

- Layer đầu = ảnh nền, phủ đúng vùng đã gửi. Ảnh trả về to/nhỏ hơn ảnh gửi đều được — panel tự co giãn.
- `mask`: ảnh xám, trắng = hiện. Panel tự làm mềm mép 2px.
- `x, y, width, height`: vị trí layer **tính theo ảnh đã gửi lên** (dùng cho các mặt khi "Giữ mặt gốc").
- Lỗi: trả mã HTTP ≠ 200 kèm `{"error": "câu báo lỗi tiếng Việt"}` — panel hiện nguyên câu đó. Hết điểm nên trả mã **402**.

Bảng giá hiển thị nằm ở `src/config.ts` (`PRICES`). Máy chủ mới là nơi trừ điểm thật.

---

## 5. Cấu trúc code

```
phaha-ai-panel/
├── manifest.json          Khai báo plugin cho Photoshop (tên, quyền mạng, quyền file)
├── index.html             Trang gốc của panel
├── vite.config.ts         Cấu hình build ra 1 file index.js
├── src/
│   ├── main.tsx / App.tsx Khởi động, chuyển giữa màn đăng nhập và 5 tab
│   ├── config.ts          Địa chỉ máy chủ, BẢNG GIÁ, kích thước ảnh gửi đi
│   ├── api/               Gọi máy chủ (tự gắn token, tự gia hạn, dịch lỗi)
│   ├── photoshop/         Làm việc với Photoshop
│   │   ├── selection.ts   Đọc vùng chọn
│   │   ├── export.ts      Xuất vùng ảnh ra JPEG để gửi
│   │   ├── layers.ts      Chèn layer + mask mềm, đổi độ mờ, phóng to tài liệu
│   │   ├── files.ts       Chọn ảnh mẫu, chọn thư mục, lưu JPG (hàng loạt)
│   │   └── modal.ts       Xếp hàng lệnh sửa ảnh, gộp thành 1 bước Undo
│   ├── jobs/              Hàng đợi: gửi → hỏi trạng thái 2 giây/lần → chèn layer
│   ├── lib/               Giải mã PNG/JPEG, đổi cỡ, làm mềm mép (thuần JS)
│   ├── state/store.ts     Trạng thái chung (người dùng, điểm, job, thông báo)
│   ├── components/        Giao diện từng tab
│   ├── data/              14 nhóm prompt mẫu + preset Special dự phòng
│   └── styles/            Màu sắc, CSS (chỉ dùng CSS mà Photoshop hỗ trợ)
├── mock-server/           Máy chủ giả lập để thử
├── tests/                 Test tự động (chạy: npm test)
└── scripts/               Vẽ icon, đóng gói .ccx
```

## 6. Lệnh hay dùng

| Lệnh | Để làm gì |
|---|---|
| `npm run build` | Build plugin ra `dist/` |
| `npm run watch` | Tự build lại mỗi lần lưu file |
| `npm run mock` | Bật máy chủ giả lập ở cổng 8787 |
| `npm test` | Chạy test tự động (14 bài, có test cả luồng với máy chủ giả lập) |
| `npm run typecheck` | Kiểm tra lỗi kiểu dữ liệu |
| `npm run package` | Tạo file cài `.ccx` |

## 7. Gặp lỗi thường gặp

| Hiện tượng | Vì sao | Làm gì |
|---|---|---|
| Panel trắng trơn | Lỗi khi nạp code | UXP Developer Tool → ••• → **Debug** → tab Console, chụp lỗi đỏ gửi lại. |
| "Không kết nối được máy chủ" | Máy chủ chưa bật / sai địa chỉ | Kiểm tra cửa sổ `npm run mock` còn chạy; đăng xuất → Máy chủ ⚙ → sửa địa chỉ. |
| "Photoshop đang bận" | Đang mở hộp thoại / đang dùng công cụ biến hình | Bấm Enter/Esc cho xong thao tác trong Photoshop rồi chạy lại. |
| "Ảnh không ở chế độ RGB" | Ảnh CMYK/Grayscale | Image → Mode → RGB Color. |
| Plugin không hiện trong menu | Photoshop cũ hơn 24.4 | Cập nhật Photoshop qua Creative Cloud. |

## 8. Còn lại / làm sau

- [ ] Kiểm tra với máy chủ PhaHa thật (hiện mới thử với máy chủ giả lập + Photoshop giả lập trong test).
- [ ] Đa ngôn ngữ vi/en (chữ đang viết thẳng tiếng Việt trong giao diện).
- [ ] Đưa lên Adobe Marketplace (cần thu hẹp quyền mạng `"domains": "all"` thành đúng tên miền PhaHa).
- [ ] Ảnh thumbnail thật cho preset Special (máy chủ trả qua `/api/special/presets`).
