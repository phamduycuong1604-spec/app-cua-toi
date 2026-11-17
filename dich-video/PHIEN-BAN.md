# Các phiên bản app Dịch video (PhaHa)

Số phiên bản hiện ở đầu trang app và ở dòng đầu nhật ký mỗi lần chạy.
Cách đọc: năm.tháng.ngày.lần-sửa-trong-ngày.

## 2026.11.17.3
- Lọc tiếng nhiễu kiểu radio trong giọng Gemini: nhận biết tiếng nói bằng NHỊP RUNG của giọng (cao độ), không
  chỉ bằng độ "rè chói" như trước → nhiễu trầm kiểu radio cũng bị lọc. Lọc cả ở khoảng nghỉ giữa các câu
  (trước chỉ lọc 2 đầu mỗi lượt đọc). Phụ âm đầu từ (s, x, ph, th…) vẫn giữ nguyên.

## 2026.11.17.2
- Cả video đọc CÙNG MỘT TỐC ĐỘ: khi lời Việt dài hơn lời gốc, app tính 1 tốc độ chung cho cả video; mỗi lượt
  chỉ được nhanh hơn tốc độ chung một chút. Trước đây lượt này tua 1,5 lần, lượt sau bị trễ phải tua gấp tới
  1,9 lần → nghe như 2 giọng khác nhau và có tiếng "xoẹt" ở chỗ nối giữa 2 lượt Gemini.

## 2026.11.17.1
- Hết tiếng "xoẹt" cuối câu sau mỗi lượt Gemini đọc: bản trước còn giữ tới 0,15 giây tiếng rè dính sát sau lời
  đọc; nay cắt hết (tiếng Việt không có từ tận cùng bằng âm gió nên không mất chữ), cuối đoạn nhỏ dần 50 ms.
- Giọng đồng nhất hơn giữa các lượt: mọi lượt Gemini đọc với cùng độ ngẫu nhiên thấp (0,6) và cùng "hạt giống",
  bớt cảnh lượt này cao/nhanh, lượt kia trầm/chậm. Loại Gemini nào không nhận thì tự gửi lại không kèm.

## 2026.11.16.3
- Cả video chỉ 1 giọng: chốt 1 loại Gemini ngay từ đầu cho cả video. Loại đó hết lượt hoặc Google báo quá tải
  thì đọc lại CẢ video bằng loại khác (không còn ghép 2 loại giọng trong 1 video). Đoạn đã đọc được lưu theo
  từng loại, lần làm lại không lấy nhầm đoạn của loại khác.
- Google quá tải (lỗi 503) ở nhiều mã → bỏ loại đó ngay, không xoay mã mãi; chờ quá 2 phút cũng đổi loại.
- Bớt tiếng "xoẹt" khi chuyển đoạn: mọi đoạn giọng to đều nhau; nhạc nền ở khúc còn sót giọng gốc
  giảm/tăng từ từ (0,4 giây) và không bật tắt liên tục giữa các câu.

## 2026.11.16.2
- Hiện số phiên bản ở đầu trang và trong nhật ký; thêm trang ghi các thay đổi này.

## 2026.11.16.1
- Giọng lồng tiếng không còn tiếng "xoẹt xoẹt" giữa các lượt Gemini: cắt tạp âm 2 đầu mỗi đoạn giọng,
  làm mềm chỗ nối, không khuếch đại tạp âm; chống vỡ tiếng khi trộn với nhạc nền.

## Trước 16/11/2026
- 24/10: dùng đúng SRT tiếng Việt bạn dán (đúng số câu và mốc giờ); bỏ lời bài hát của nhạc nền;
  tự giảm nhạc nền ở khúc còn sót giọng gốc.
- 21/10: viết lại giọng đọc Gemini cho mã miễn phí (đọc từng đoạn, chờ ngắn cùng mã, khoá tạm và đổi mã khi
  phải chờ lâu, nhớ hết lượt theo từng mã + loại giọng); khách chỉ dán mã giọng đọc vẫn chạy được; bỏ qua mã
  Gemini có ký tự lạ; cài đặt và mã riêng cho từng tài khoản trên cùng máy.
