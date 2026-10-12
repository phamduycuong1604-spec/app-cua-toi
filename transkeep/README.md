# TransKeep

Dịch chữ Trung trong **ảnh** sang tiếng Việt, giữ nguyên ảnh gốc. App chỉ thay đúng chỗ có chữ,
dùng cùng màu chữ, viền và góc nghiêng như bản gốc. Video sẽ có ở Phase 4.

## App làm gì với một bức ảnh

1. **Tìm và đọc chữ Trung** (giản thể lẫn phồn thể) bằng mô hình PaddleOCR.
2. **Dịch** cả ảnh trong một lượt (Gemini / OpenAI / DeepL / Google), để máy hiểu ngữ cảnh chung.
3. **Đo kiểu chữ**: màu chữ, màu viền, chữ đậm hay thường.
4. **Xóa chữ cũ**:
   - Nền trơn hoặc chuyển màu đều: app tự tô lại bằng phép tính.
   - Nền phức tạp: dùng mô hình **LaMa** để "vá" nền, giống thợ Photoshop.
5. **Viết chữ Việt** vào đúng chỗ cũ, tự co cỡ cho vừa khung, xoay theo chữ gốc.
6. **Kiểm tra lần cuối**: mọi điểm ảnh nằm ngoài vùng chữ được chép lại từ ảnh gốc, nên không pixel nào ngoài vùng chữ bị đổi.

Ảnh kết quả luôn lưu dạng **PNG**. Lý do: lưu lại thành JPG sẽ làm thay đổi nhẹ toàn bộ ảnh.

## Các file

| File / thư mục | Dùng để |
|---|---|
| `backend/app/main.py` | Máy chủ: nhận ảnh, trả kết quả |
| `backend/app/jobs.py` | Hàng đợi: xử lý ngầm từng ảnh để trang web không bị treo |
| `backend/app/pipeline/ocr.py` | Tìm và đọc chữ Trung |
| `backend/app/pipeline/translate.py` | Dịch (có lời dặn máy dịch: sát nghĩa, đúng chuyên ngành, không giải thích) |
| `backend/app/pipeline/style.py` | Đo màu chữ, viền chữ |
| `backend/app/pipeline/inpaint.py` | Xóa chữ cũ, tái tạo nền |
| `backend/app/pipeline/render.py` | Vẽ chữ Việt |
| `backend/app/fonts/` | Font có đủ dấu tiếng Việt: Be Vietnam Pro, Noto Serif, Dancing Script, Anton |
| `frontend/` | Trang web: kéo thả ảnh, thanh tiến trình, so sánh trước/sau, sửa từng vùng chữ |
| `Dockerfile`, `docker-compose.yml` | "Hộp cài sẵn" để chạy trên máy chủ bằng một lệnh |
| `.env.example` | Mẫu cài đặt: mật khẩu, chìa khóa dịch |

## Đưa lên máy chủ thuê (làm một lần, khoảng 15 phút)

Cần một máy chủ **Ubuntu** có từ **4 GB RAM** trở lên (nên chọn 8 GB). Ví dụ: Hetzner gói CX32,
hoặc DigitalOcean / Vultr gói 8 GB, giá khoảng 7–20 USD/tháng.

1. Tạo máy chủ, chọn hệ điều hành **Ubuntu 24.04**. Ghi lại **địa chỉ IP** và **mật khẩu root**.
2. Trên máy tính, mở **PowerShell** (Windows) hoặc **Terminal** (Mac), gõ lệnh sau
   (thay `1.2.3.4` bằng IP của bạn):
   ```
   ssh root@1.2.3.4
   ```
3. Dán lần lượt từng dòng dưới đây vào máy chủ:
   ```
   curl -fsSL https://get.docker.com | sh
   git clone https://github.com/phamduycuong1604-spec/app-cua-toi.git
   cd app-cua-toi/transkeep
   cp .env.example .env
   nano .env
   ```
4. Trong `nano`, điền `APP_PASSWORD=` (mật khẩu vào app) và `GEMINI_API_KEY=` (chìa khóa Gemini).
   Lưu file: bấm **Ctrl+O**, rồi **Enter**, rồi **Ctrl+X** để thoát.
5. Chạy app:
   ```
   docker compose up -d --build
   ```
   Lần đầu mất khoảng 5–10 phút để tải mô hình AI.
6. Mở trình duyệt, vào `http://1.2.3.4:8000`.

**Cập nhật bản mới** (khi có code mới trên GitHub):
```
cd app-cua-toi && git pull && cd transkeep && docker compose up -d --build
```

**Xem lỗi** khi có trục trặc: `docker compose logs -f` (bấm **Ctrl+C** để thoát).

## Chạy thử trên máy tính (cho người làm code)

```
cd transkeep
python -m venv .venv && . .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn app.main:app --app-dir backend --port 8000
```
Muốn xóa chữ đẹp hơn, tải `lama_fp32.onnx` (từ huggingface.co/Carve/LaMa-ONNX) rồi đặt
`LAMA_MODEL=đường/dẫn/lama_fp32.onnx`. Nếu không có file này, app tự dùng OpenCV thay thế.

Kiểm tra tự động: `pip install pytest && pytest tests -q`

## Lộ trình

- [x] **Phase 1**: ảnh → tìm chữ → dịch → xóa → vẽ lại; trang web có so sánh trước/sau và sửa chữ, màu, font
- [ ] **Phase 2**: kéo thả, đổi cỡ từng khung chữ ngay trên ảnh; bảng thuật ngữ riêng
- [ ] **Phase 3**: gộp nhiều dòng thành một đoạn, chữ dọc, đổ bóng, chữ cong, tự đoán font giống bản gốc
- [ ] **Phase 4**: video (giữ tiếng, giữ số khung hình mỗi giây, chữ không nhấp nháy)
- [ ] **Phase 5**: bản cài trên máy tính / điện thoại
