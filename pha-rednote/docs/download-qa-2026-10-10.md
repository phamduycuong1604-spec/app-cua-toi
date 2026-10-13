# Kiểm tra lỗi “Đã nhận video. Load failed”

Ảnh từ Safari và đoạn code chỉ ra thông báo này được tạo trong catch của **dịch caption sau khi pullLink đã thành công**, không phải lỗi giới hạn hai phút. Nhật ký máy chủ có POST /api/translate trả 502; dự phòng Google trên trình duyệt có thể thất bại với TypeError Load failed. Đây là đường lỗi đã tái hiện bằng test VM với cả video nằm trong bộ nhớ và file attachment. Chưa có kết nối điều khiển iPhone thật.

Sửa: giữ trạng thái Video sẵn sàng và nút tải; lỗi dịch caption hiện riêng, nguồn vẫn giữ nguyên. Lỗi kết nối dự phòng được đổi thành hướng dẫn thử lại Dịch caption hoặc chọn Gemini. Không tự thay bản gốc bằng stream có logo. Không tuyên bố dịch miễn phí luôn hoạt động: nguồn miễn phí vẫn có thể bị giới hạn.

Kiểm tra live trước bản sửa (máy chủ app hiện có):

- `http://xhslink.com/o/3nKkeEeedcK`: HTTP 200, 10.199.456 byte MP4 gốc, HEVC 2160×3840, AAC stereo 44.100 Hz, 18,012 giây. Tải đủ khoảng 14,1 giây. Source pipeline thực thi trong Node/WASM với chính file này: tách 287.904 mẫu/17,994 giây (khác chút với hình vì thời lượng AAC), xuất MP4 10.130.138 byte, hình giữ nguyên, HEAP 32 MiB, WORKERFS đọc tối đa 293.250 byte/lần. Bài test fixture có giả định audio >=18 giây và tổng đọc <8 MiB không dùng được cho file thực tế này; điều chỉnh chỉ ở script tạm để kiểm tra, không thay script fixture.
- `http://xhslink.com/o/mGpiohgcXG`: HTTP 200 JSON attachment, nguyên bản 798.935.226 byte. GET download qua app có Range đầu 65.536 byte và cuối 1.048.576 byte đều trả HTTP 206, Content-Range đúng và đủ byte. Từ đầu/cuối MP4 đọc được H.264 2160×3840, AAC stereo 48 kHz, thời lượng 320,250 giây (5 phút 20 giây). Không tải toàn bộ file 799 MB trong bài kiểm tra; chưa xác minh việc lưu hoàn chỉnh trên iPhone.

Giới hạn nhận vào bộ nhớ vẫn là 256 MiB, không phải hai phút. Bản 799 MB đi theo đường tải attachment về Tệp, không tự nhập vào studio. Muốn kiểm tra đầy đủ tải/lưu trên iPhone cần thao tác trên máy thật. Bộ 89 test Node và build/artifact đạt sau sửa; đây không phải chứng nhận Safari/iPhone.
