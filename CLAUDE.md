# Ghi chú cho Claude

- Người dùng không chuyên lập trình: trả lời ngắn, tiếng Việt dễ hiểu.
- App dịch video (`dich-video/`): MỖI LẦN sửa và đưa lên app (merge vào main) phải
  1. tăng `PHIEN_BAN` trong `dich-video/nen.js` (dạng năm.tháng.ngày.lần-trong-ngày),
  2. ghi thay đổi lên đầu `dich-video/PHIEN-BAN.md`,
  3. báo rõ cho người dùng số phiên bản vừa đưa lên app.
- Kiểm tra trước khi đưa lên: `dich-video/kiem-tra/` (`bash chuan-bi.sh` một lần, rồi `node kiemtra.mjs`,
  `node am-thanh-test.mjs`). Kịch bản 10-het-sach và 14-khong-tieng cố ý báo lỗi.
