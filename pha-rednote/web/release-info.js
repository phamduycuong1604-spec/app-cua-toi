// Update this list when publishing a new app release. Download module versions
// are independent: release 34 adds bounded storage reads and sequential video rendering.
export const APP_RELEASES = [
  {version:34,name:'Sửa lỗi đọc và dựng video Safari',date:'11/10/2026',description:'Đọc lại file theo phần khi Safari mất đối tượng; dựng hình ra bộ lưu trữ, bật FFmpeg sau khi dựng xong, thử lại lỗi ghi tạm thời và dừng đổi giọng sau huỷ.'},
  {version:33,name:'Sửa 10 — Tải video nhẹ hơn, 6 luồng',date:'11/10/2026',description:'Giữ bản gốc tối đa 700 MiB; video nặng dùng bản Rednote tối đa 1080p nếu có. Tải 6 luồng, thử lại phần đứng và giữ màn hình sáng.'},
  {version:32,name:'Sửa 09 — Hiện nút tải gốc về Tệp',date:'11/10/2026',description:'Hiện lại nút tải video gốc về Tệp khi tải vào app thất bại hoặc video vượt hai GB.'},
  {version:31,name:'Sửa 08 — Lưu video đúng dung lượng',date:'11/10/2026',description:'Áp dụng bản 27 và phần sửa 08: ghi đúng byte, đọc lại kích thước, cắt byte thừa và ghi rõ lỗi thiếu dung lượng.'},
  {version:30,name:'Hiển thị tên bản cập nhật',date:'11/10/2026',description:'Hiện tên phiên bản đang dùng và lịch sử cập nhật trong app.'},
  {version:29,name:'Khôi phục phần tải video bản 23',date:'11/10/2026',description:'Dùng lại phần tải video bản 23, giữ phần dịch và lồng tiếng hiện hành.'},
];
export const APP_RELEASE = APP_RELEASES[0];
export const APP_RELEASE_LABEL = `Bản ${APP_RELEASE.version} · ${APP_RELEASE.name}`;
