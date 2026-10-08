// 14 nhóm prompt mẫu dự phòng (dùng khi máy chủ chưa trả /api/prompts).
import type { PromptGroup } from "../api/types";

const g = (id: string, name: string, prompts: [string, string][]): PromptGroup => ({
  id,
  name,
  prompts: prompts.map(([title, prompt]) => ({ title, prompt })),
});

export const DEFAULT_PROMPT_GROUPS: PromptGroup[] = [
  g("sun", "Ánh nắng", [
    ["Nắng chiều vàng", "Thêm ánh nắng chiều vàng ấm chiếu xiên từ bên trái, có vệt nắng nhẹ trên tóc và vai, giữ nguyên khuôn mặt"],
    ["Nắng xuyên lá", "Thêm nắng xuyên qua tán lá tạo đốm sáng lung linh trên người và nền"],
    ["Ngược sáng", "Tạo hiệu ứng ngược sáng, viền sáng quanh tóc, lóa sáng nhẹ góc trên"],
  ]),
  g("dress", "Dáng váy", [
    ["Váy xòe bồng", "Làm chân váy xòe bồng, phồng đều và tự nhiên hơn, giữ nguyên chất liệu và màu"],
    ["Đuôi váy dài", "Kéo dài đuôi váy cưới trải dài ra phía sau trên mặt đất, nếp vải mềm mại"],
    ["Váy bay gió", "Làm tà váy bay nhẹ trong gió, chuyển động tự nhiên"],
  ]),
  g("sky", "Đổi bầu trời", [
    ["Trời xanh mây trắng", "Thay bầu trời thành trời xanh trong với mây trắng bồng bềnh, cân lại ánh sáng cho hợp"],
    ["Hoàng hôn", "Thay bầu trời thành hoàng hôn cam tím rực rỡ, ánh sáng cảnh vật ấm theo"],
    ["Trời sao", "Thay bầu trời thành bầu trời đêm đầy sao và dải ngân hà"],
  ]),
  g("weather", "Đổi thời tiết", [
    ["Tuyết rơi", "Thêm tuyết rơi nhẹ và lớp tuyết mỏng trên mặt đất, tông lạnh"],
    ["Mưa nhẹ", "Thêm mưa phùn nhẹ, mặt đất ướt phản chiếu ánh sáng"],
    ["Sương mờ", "Thêm sương mù mờ ảo ở hậu cảnh, giữ chủ thể rõ nét"],
  ]),
  g("light", "Đổi ánh sáng", [
    ["Studio mềm", "Ánh sáng studio mềm, đều mặt, nền tối nhẹ"],
    ["Ánh đèn neon", "Đổi ánh sáng thành đèn neon hồng xanh kiểu thành phố đêm"],
    ["Ánh nến ấm", "Ánh sáng ấm áp như ánh nến, tương phản nhẹ"],
  ]),
  g("restore", "Phục chế", [
    ["Phục chế ảnh cũ", "Phục chế ảnh cũ: xóa vết xước, vết ố, tăng nét, giữ nguyên khuôn mặt"],
    ["Tô màu ảnh đen trắng", "Tô màu tự nhiên cho ảnh đen trắng, màu da chân thật"],
    ["Làm nét ảnh mờ", "Làm nét ảnh bị mờ nhòe, khôi phục chi tiết mắt và tóc"],
  ]),
  g("film", "Màu phim cưới", [
    ["Film Hàn Quốc", "Chỉnh màu phim cưới Hàn Quốc trong trẻo, da hồng hào, tông pastel"],
    ["Film vintage", "Màu phim vintage ấm, hạt film nhẹ, tương phản dịu"],
    ["Film điện ảnh", "Màu điện ảnh teal & orange, sâu và có chiều sâu"],
  ]),
  g("profile", "Hồ sơ", [
    ["Ảnh thẻ nền xanh", "Chuyển thành ảnh thẻ nền xanh dương, áo sơ mi trắng chỉnh tề, ánh sáng đều"],
    ["Ảnh thẻ nền trắng", "Chuyển thành ảnh thẻ nền trắng, chỉnh tóc gọn, ánh sáng đều"],
    ["Ảnh profile công sở", "Ảnh chân dung công sở chuyên nghiệp, vest tối màu, nền văn phòng mờ"],
  ]),
  g("skin", "Làm da", [
    ["Da mịn tự nhiên", "Làm da mịn tự nhiên, giữ lỗ chân lông và kết cấu da, xóa mụn"],
    ["Da trắng hồng", "Làm da sáng trắng hồng tự nhiên, đều màu"],
    ["Xóa thâm mắt", "Xóa quầng thâm và bọng mắt nhẹ nhàng"],
  ]),
  g("background", "Đổi phông nền", [
    ["Phông studio xám", "Thay nền thành phông studio xám trơn, có vignette nhẹ"],
    ["Bãi biển", "Thay nền thành bãi biển nhiệt đới, ánh sáng hợp với chủ thể"],
    ["Vườn hoa", "Thay nền thành vườn hoa mùa xuân, hậu cảnh xóa phông"],
  ]),
  g("remove", "Xóa vật thể", [
    ["Xóa người thừa", "Xóa những người phía sau, lấp nền tự nhiên"],
    ["Xóa dây điện", "Xóa dây điện, cột điện khỏi ảnh"],
    ["Xóa chữ / logo", "Xóa chữ và logo, lấp nền liền mạch"],
  ]),
  g("outfit", "Trang phục", [
    ["Áo dài trắng", "Đổi trang phục thành áo dài trắng truyền thống, giữ dáng người"],
    ["Vest đen", "Đổi trang phục thành bộ vest đen lịch lãm"],
    ["Váy dạ hội", "Đổi trang phục thành váy dạ hội lấp lánh"],
  ]),
  g("season", "Mùa & lễ hội", [
    ["Tết", "Thêm không khí Tết: hoa đào, câu đối đỏ, ánh sáng ấm"],
    ["Giáng sinh", "Thêm không khí Giáng sinh: đèn lấp lánh, cây thông, tuyết nhẹ"],
    ["Mùa thu lá vàng", "Chuyển cảnh sang mùa thu lá vàng rơi"],
  ]),
  g("art", "Phong cách nghệ thuật", [
    ["Tranh sơn dầu", "Chuyển ảnh thành tranh sơn dầu, nét cọ rõ"],
    ["Hoạt hình 3D", "Chuyển thành nhân vật hoạt hình 3D dễ thương, giữ nét mặt"],
    ["Ký họa chì", "Chuyển thành tranh ký họa bút chì"],
  ]),
];
