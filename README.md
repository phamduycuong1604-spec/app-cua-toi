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
| `phaha-ai-panel/` | **PhaHa AI** — panel AI sửa ảnh chạy trong Photoshop (xem `phaha-ai-panel/README.md`) |

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

App dùng 2 dịch vụ để vừa hay vừa rẻ:
- **Nghe & dịch**: Gemini (1 lượt cho mỗi 5 phút video).
- **Đọc giọng Việt** (chọn trong ⚙️, mỗi dịch vụ có hướng dẫn lấy mã ngay trong app):
  | Dịch vụ | Miễn phí/tháng | ~Video 2 phút |
  |---|---|---|
  | Google Cloud (mặc định) | 1 triệu ký tự | ~800 |
  | Microsoft Azure | 0,5 triệu ký tự | ~400 |
  | ElevenLabs (giống người nhất, không dùng cho video kiếm tiền khi miễn phí) | 10.000 lượt | ~8 (gấp đôi nếu chọn Flash) |
  | Gemini (gộp câu sát nhau để đỡ tốn lượt) | tùy mã | ít |

  ElevenLabs hết lượt giữa chừng thì app tự chuyển sang Google Cloud (nếu đã cài).

Làm 1 lần:
1. Lấy mã Gemini: https://aistudio.google.com/apikey → **Create API key** → sao chép.
2. Gắn thẻ thanh toán cho Google Cloud: https://console.cloud.google.com/billing (không bị trừ tiền nếu trong mức miễn phí).
3. Bật **Cloud Text-to-Speech API** (chọn đúng dự án của mã Gemini → **Enable**):
   https://console.cloud.google.com/apis/library/texttospeech.googleapis.com
4. Mở app → ⚙️ → dán mã Gemini → **Tải danh sách giọng** → chọn giọng → **Nghe thử** → **Lưu**.
   (Nếu báo mã bị giới hạn: tạo mã mới ở Google Cloud → Credentials, dán vào ô “Mã Google Cloud”.)

**Dự phòng khi Gemini hết lượt** (⚙️ → 🔁, file `dich-video/du-phong.js`): tự chuyển lần lượt
Groq (Whisper nghe + Qwen/Llama dịch) → Cloudflare (AI của máy chủ PHAHA, cần đăng nhập app PHAHA,
file `may-chu/src/ai.js`) → Azure (Speech nghe, Translator dịch) → OpenRouter (mô hình miễn phí, chỉ dịch).
Trình duyệt bị chặn gọi thẳng dịch vụ nào thì app đi vòng qua máy chủ PHAHA (`/ai/chuyen`).

Thẻ **🎛️ Tuỳ chỉnh video** (hiện sau khi chọn video, có ô xem thử):
- **Tách nhạc nền** (AI chạy ngay trên máy, file `dich-video/tach-nhac.js`, mô hình trong `dich-video/mo-hinh/`):
  bỏ giọng Trung gốc, giữ nhạc nền. Lần đầu tải mô hình (Nhanh 28MB / Kỹ 56MB) + bộ chạy AI (~21MB).
- **Phụ đề tiếng Việt** chèn thẳng vào hình: cỡ chữ, vị trí, màu, kiểu viền/nền.
- **Lớp che chữ Trung**: làm mờ hoặc tô màu, chỉnh vị trí và kích thước.
- **Logo**: chỉnh cỡ, độ rõ, vị trí (ảnh logo lưu trên máy).
- Có phụ đề/lớp che/logo thì app dựng lại hình bằng bộ mã hoá của điện thoại (`dich-video/lop-phu.js`,
  thư viện mediabunny) → lâu hơn; máy không hỗ trợ thì vẫn xuất video nhưng không có chữ/logo.
- Tất cả chạy trên máy, **không tốn thêm tiền**.

Dùng: chọn video → **Bắt đầu** → sửa câu dịch nếu muốn → **Làm lại** → **Lưu video**.

- Hình giữ nguyên, chỉ thay tiếng (giữ lại nhạc gốc nhỏ, chỉnh trong ⚙️).
- ⚙️ hiện số ký tự đã dùng trong tháng (đếm trên máy đó).
- Video nặng (trên ~300MB) có thể làm điện thoại bị đơ.
