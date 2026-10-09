# PhaHa Tool (máy tính)

Tool chạy trên máy tính, làm theo đúng sơ đồ quy trình:
**Tải video Trung → Nghe & dịch → Phụ đề Việt → Lồng tiếng Việt → Dựng video → Viết 3 bản content → Lưu chung 1 thư mục.**

## Cài đặt (làm 1 lần)

1. Tải code về máy: trang GitHub → nút xanh **Code** → **Download ZIP** → giải nén.
2. Cài Python: https://www.python.org/downloads/ → khi cài **nhớ tick “Add python.exe to PATH”**.
3. Mở thư mục `may-tinh`:
   - **Windows**: bấm đúp `CHAY-WINDOWS.bat`
   - **Mac**: chuột phải `CHAY-MAC.command` → Open
   Lần đầu chờ 1–2 phút để tool tự cài. Lần sau bấm đúp là mở ngay (tự cập nhật bộ tải video).
4. Tab **⚙️ Cài đặt** → dán **mã Gemini** (lấy miễn phí tại https://aistudio.google.com/apikey) → **Kiểm tra** → **Lưu cài đặt**.

## Dùng hằng ngày

1. Dán link video (mỗi dòng 1 link) → **➕ Thêm link**. Hoặc **📂 Chọn video trên máy**, hoặc lấy từ Google Sheet.
2. Tick việc muốn làm (phụ đề, chèn chữ vào hình, lồng tiếng, viết content).
3. Bấm **▶ Bắt đầu**. Xong bấm đúp vào dòng để mở thư mục kết quả.

## Kết quả mỗi video (1 bài = 1 thư mục)

```
PhaHa-ket-qua/2026-10-09/Video_001/
  01_original.mp4              video gốc
  02_video_vietnamese.mp4      video đã có phụ đề + giọng Việt
  03_subtitle_vi.srt           phụ đề tiếng Việt
  03_subtitle_song_ngu.json    phụ đề song ngữ Trung–Việt
  04_content_original.txt      nội dung gốc tiếng Trung
  04b_content_vi.txt           bản dịch sát nghĩa
  05_content_vi_tiktok.txt     bản TikTok (ngắn gọn)
  06_content_vi_instagram.txt  bản Instagram (cảm xúc)
  07_content_vi_facebook.txt   bản Facebook (đầy đủ)
  08_metadata.json             thông tin xử lý (thời gian, lỗi nếu có)
```

**Muốn tự đưa lên Google Drive**: cài “Google Drive cho máy tính”, rồi trong ⚙️ chọn **Thư mục lưu** nằm trong ổ Google Drive.

## Tool dùng gì, tốn bao nhiêu

| Việc | Dùng | Chi phí |
|---|---|---|
| Tải video | yt-dlp (Douyin, TikTok, YouTube, Bilibili…) | miễn phí |
| Nghe tiếng Trung + dịch + viết content | Gemini | miễn phí trong hạn mức |
| Giọng đọc Việt | Microsoft Edge (Hoài My / Nam Minh) | miễn phí, cần mạng |
| Ghép phụ đề, giọng, dựng video | ffmpeg (tự cài kèm) | miễn phí, chạy trên máy |

## Khi gặp lỗi

- **Không tải được video Douyin**: mở Douyin trên Chrome/Edge 1 lần, rồi trong ⚙️ ô “Lấy cookie từ trình duyệt” gõ `chrome` (hoặc `edge`). Chrome bản mới đôi khi khoá cookie → dùng tiện ích “Get cookies.txt LOCALLY” xuất file rồi chọn ở ô “file cookies.txt”. Cách chắc nhất: tải tay rồi **📂 Chọn video trên máy**.
- **Gemini hết lượt**: tool tự thử các mô hình khác; vẫn lỗi thì chờ hôm sau hoặc dùng mã khác.
- Video lỗi sẽ hiện **ERROR**, bấm **▶ Bắt đầu** lần nữa để làm lại riêng video đó. Chi tiết lỗi ghi ở `nhat-ky.txt` và `08_metadata.json`.

## Google Sheet (tuỳ chọn)

Sheet cần dòng đầu là tiêu đề, có các cột: **URL**, **Tên bài**, **Nền tảng**, **Trạng thái**, **Nội dung** (chỉ URL là bắt buộc).
Tool chỉ lấy dòng có Trạng thái trống hoặc `NEW`.

1. **Đọc Sheet**: Sheet → **Chia sẻ** → “Bất kỳ ai có đường liên kết” → Người xem. Dán link vào ô Google Sheet → **📥 Lấy dòng NEW**.
2. **Ghi DONE/ERROR ngược vào Sheet** (để không làm lại lần sau):
   Sheet → **Tiện ích mở rộng** → **Apps Script** → xoá hết, dán đoạn dưới → **Triển khai** → **Tùy chọn triển khai mới** →
   loại **Ứng dụng web**, “Người có quyền truy cập”: **Bất kỳ ai** → **Triển khai** → sao chép link → dán vào ô “Link cập nhật Sheet”.

```js
function doPost(e) {
  const d = JSON.parse(e.postData.contents);
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  const bang = sh.getDataRange().getValues();
  const td = bang[0].map(x => String(x).toLowerCase());
  const cot = (...k) => td.findIndex(t => k.some(x => t.includes(x)));
  const cUrl = cot("url", "link"), cTt = cot("trạng thái", "trang thai", "status");
  let cGhi = cot("ghi chú", "thư mục", "note");
  if (cGhi < 0) { cGhi = td.length; sh.getRange(1, cGhi + 1).setValue("Ghi chú"); }
  for (let i = 1; i < bang.length; i++) {
    if (String(bang[i][cUrl]).trim() === d.url) {
      if (cTt >= 0) sh.getRange(i + 1, cTt + 1).setValue(d.trang_thai);
      sh.getRange(i + 1, cGhi + 1).setValue(d.loi || d.thu_muc);
    }
  }
  return ContentService.createTextOutput("ok");
}
```

## Báo tin qua Telegram (tuỳ chọn)

1. Trên Telegram nhắn **@BotFather** → `/newbot` → đặt tên → nhận **token** → dán vào ô “Telegram bot token”.
2. Nhắn 1 tin bất kỳ cho bot vừa tạo, rồi nhắn **@userinfobot** để biết **ID** của bạn → dán vào ô “Telegram chat ID”.

## Các file

| File | Dùng để |
|---|---|
| `phaha_tool.py` | Cửa sổ tool: danh sách video, nút bấm, cài đặt |
| `xu_ly.py` | Bộ não: từng bước của quy trình |
| `CHAY-WINDOWS.bat` / `CHAY-MAC.command` | Bấm đúp để cài & mở tool |
| `requirements.txt` | Danh sách thư viện tool cần |
| `cai-dat.json` | Cài đặt của bạn (tự tạo, chứa mã bí mật, không đưa lên GitHub) |
