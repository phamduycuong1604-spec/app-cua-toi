// =====================================================
// CHUYÊN MÔN DỊCH VIDEO (lấy y như app PHA rednote): mỗi kênh có quy tắc dịch + bảng thuật ngữ Trung → Việt
// =====================================================
const GLOSSARY={
 general:{'感光度':'độ nhạy sáng ISO','光圈':'khẩu độ','快门速度':'tốc độ màn trập','焦距':'tiêu cự'},
 lighting:{'主光':'đèn chính (key light)','辅光':'đèn bù (fill light)','补光':'bù sáng','轮廓光':'đèn viền (rim light)','背景光':'đèn nền','柔光箱':'softbox','柔光':'ánh sáng mềm','硬光':'ánh sáng cứng','色温':'nhiệt độ màu','白平衡':'cân bằng trắng','逆光':'ngược sáng','布光':'bố trí ánh sáng','反光板':'tấm hắt sáng','光比':'tỉ lệ ánh sáng','蜂巢':'lưới tổ ong'},
 retouch:{'磨皮':'làm mịn da','双曲线':'dodge & burn bằng hai đường cong','中性灰':'dodge & burn trên lớp xám trung tính','频率分离':'tách tần số','液化':'Liquify','调色':'chỉnh màu','肤色':'màu da','色调':'tông màu','色相':'sắc độ (hue)','饱和度':'độ bão hòa','明度':'độ sáng','高光':'vùng sáng (highlights)','阴影':'vùng tối (shadows)','曲线':'đường cong (Curves)','蒙版':'mặt nạ (mask)','锐化':'tăng độ sắc nét','纹理':'kết cấu'},
 film:{'运镜':'chuyển động máy quay','分镜':'phân cảnh','调色':'chỉnh màu','帧率':'tốc độ khung hình','快门速度':'tốc độ màn trập','景深':'độ sâu trường ảnh','转场':'chuyển cảnh','剪辑':'dựng phim','慢动作':'chuyển động chậm','焦距':'tiêu cự'},
 makeup:{'底妆':'lớp nền trang điểm','修容':'tạo khối','腮红':'má hồng','眼影':'phấn mắt','遮瑕':'che khuyết điểm','定妆':'cố định lớp trang điểm'},
 diy:{'花泥':'xốp cắm hoa','花艺':'nghệ thuật cắm hoa','热熔胶':'keo nến','铁丝':'dây kẽm','布景':'dựng bối cảnh','道具':'đạo cụ','手工':'thủ công','插花':'cắm hoa','花束':'bó hoa','丝带':'ruy băng'},
 photography:{'人像摄影':'nhiếp ảnh chân dung','人像':'chân dung','构图':'bố cục','景深':'độ sâu trường ảnh','对焦':'lấy nét','曝光':'phơi sáng','直出':'ảnh xuất trực tiếp từ máy','机位':'vị trí máy','等效焦距':'tiêu cự tương đương','测光':'đo sáng','逆光':'ngược sáng','虚化':'làm mờ hậu cảnh','原片':'ảnh gốc','连拍':'chụp liên tiếp'},
 lab:{'预设':'preset','查找表':'bảng tra màu (LUT)','配置文件':'profile màu','色彩空间':'không gian màu','色彩分级':'color grading','色彩校准':'hiệu chuẩn màu','降噪':'khử nhiễu','动态范围':'dải tương phản động','高光恢复':'khôi phục vùng sáng','阴影恢复':'khôi phục vùng tối','白平衡':'cân bằng trắng'},
 parenting:{'育儿':'nuôi dạy con','亲子':'cha mẹ và con','孕期':'thai kỳ','孕妇':'mẹ bầu','新生儿':'trẻ sơ sinh','宝宝':'bé','母乳':'sữa mẹ','辅食':'ăn dặm','家庭':'gia đình','陪伴':'đồng hành'},
 edit:{'关键帧':'keyframe (khung hình chính)','时间线':'timeline (dòng thời gian)','画中画':'hình trong hình (PiP)','遮罩':'mask (mặt nạ)','调色':'chỉnh màu','蒙版':'mask (mặt nạ)','速度曲线':'đường cong tốc độ','补帧':'nội suy khung hình','镜面滑行':'hiệu ứng trượt gương','素材':'tư liệu dựng','配音':'lồng tiếng','字幕':'phụ đề','镜头':'cảnh quay'}
};
const CHANNEL_PROFILES={
 pha_story:{label:'Pha Chuyện Ảnh',description:'Kiến thức nhiếp ảnh và hậu kỳ; ngắn gọn, dễ hiểu, đủ ý.',glossaries:['general','photography','lighting','retouch'],rules:'Dùng thuật ngữ nhiếp ảnh và hậu kỳ nhất quán. Diễn đạt ngắn gọn, dễ hiểu nhưng giữ đủ ý nguồn. Hashtag đúng ngách. Khi biên tập thành bài đăng, các nền tảng mặc định là TikTok, Instagram và Threads; bản dịch trong app giữ một nội dung để copy.',footer:'ĐÂY LÀ VIDEO REUP ĐƯỢC WS BỞI PHA'},
 pha_color:{label:'Pha Color Grading',description:'Chỉnh màu và retouch ảnh; Photoshop, ACR, Lightroom, Capture One.',glossaries:['general','photography','retouch','lab'],rules:'Giữ chính xác workflow, chất liệu da, sắc da, vùng sáng và vùng tối. Phân biệt màu ảnh, độ bão hòa, hue và luminance. Không bịa thông số hoặc biến suy đoán thành thao tác của tác giả.'},
 pha_lab:{label:'Pha Lab',description:'Preset, ACR, Capture One, LUT và tài nguyên nhiếp ảnh.',glossaries:['general','photography','retouch','lab'],rules:'Dịch sát nguồn. Không thêm công thức, thông số, kiến thức, claims, lời hứa hoặc diễn giải ngoài nguồn. Giữ đúng tên phần mềm, tên công cụ, định dạng XMP/DNG/CUBE và từng bước workflow. Không khẳng định tương thích phần mềm khi nguồn chưa nói.',footer:'Mình cũng đang tự học, gặp workflow nào hay từ các “pháp sư” Trung Quốc thì Việt hóa và chia sẻ lại để anh em cùng nghiên cứu. 📸\n\n— Pha Lab'},
 pha_edit:{label:'Pha Edit',description:'Quay dựng, hậu kỳ và chỉnh màu video.',glossaries:['general','film','edit'],rules:'Dịch đúng ngữ cảnh quay dựng: cảnh quay, chuyển động máy, keyframe, timeline, mask, phụ đề và color grading video. Giữ thứ tự thao tác, tên phần mềm, thông số và thời lượng. Không tự thêm cảnh, lời thoại hoặc thông số xuất.'},
 phaha_oi:{label:'PhaHa Ơi',description:'DIY, handmade, decor, hoa và đạo cụ concept.',glossaries:['general','diy'],rules:'Dịch sát các bước thủ công, vật liệu, hoa, trang trí và đạo cụ. Giọng gần gũi, rõ ràng. Không tự thêm vật liệu, kích thước, định lượng hoặc bước thiếu trong nguồn. Giữ lời kêu gọi có trong nguồn; hashtag đúng chủ đề.'},
 nha_phaha:{label:'Nhà PhaHa',description:'Nuôi dạy con, mẹ bầu và gia đình.',glossaries:['general','parenting'],rules:'Giọng ấm áp, dễ hiểu, đúng ngữ cảnh cha mẹ, trẻ nhỏ, mẹ bầu và gia đình. Không biến chia sẻ cá nhân thành lời khuyên y tế đã xác minh; không tự thêm khuyến cáo, liều lượng hay khẳng định sức khỏe. Ghi chú điểm cần xác minh ngoài bản dịch.'},
 phaha:{label:'Phaha',description:'Kênh tổng hợp của hệ sinh thái PhaHa.',glossaries:['general','photography','lighting','retouch','lab','film','edit','makeup','diy','parenting'],rules:'Đây là kênh tổng hợp, không mặc định là studio. Chọn ngữ cảnh và thuật ngữ phù hợp nội dung nguồn trong hệ sinh thái PhaHa; giọng rõ, gần gũi. Không tự gán bài cho một thương hiệu, thêm dịch vụ, giá hoặc cam kết ngoài nguồn.'},
 pha_light:{label:'Pha Light',description:'Lighting nhiếp ảnh; key, fill, rim, màu da và cảm xúc.',glossaries:['general','photography','lighting'],rules:'Dịch đúng hướng sáng, độ mềm, đèn chính, đèn bù, đèn viền, nhiệt độ màu và cân bằng trắng. Giữ phần suy đoán là suy đoán. Không tự suy ra công suất, khoảng cách đèn, tiêu cự hoặc tỉ lệ ánh sáng. Không nhận tác phẩm nguồn là do PHA tự sản xuất.'},
 general:{label:'Nội dung thông thường',description:'Dịch sát nghĩa nội dung thông thường.',glossaries:['general'],rules:''},
 lighting:{label:'Lighting / Ánh sáng',description:'Ánh sáng nhiếp ảnh.',glossaries:['general','lighting'],rules:''},
 retouch:{label:'Retouch / Chỉnh màu',description:'Retouch chân dung và chỉnh màu ảnh.',glossaries:['general','retouch'],rules:''},
 film:{label:'Quay & dựng phim',description:'Quay phim, dựng phim và color grading.',glossaries:['general','film','edit'],rules:''},
 makeup:{label:'Makeup / Trang điểm',description:'Trang điểm chụp ảnh.',glossaries:['general','makeup'],rules:''},
 diy:{label:'DIY / Đạo cụ & decor',description:'Thủ công, đạo cụ và trang trí.',glossaries:['general','diy'],rules:''}
};

export const KENH = CHANNEL_PROFILES;
export const KENH_MAC_DINH = "pha_story";
// Quy tắc riêng dựng sẵn cho kênh (người dùng sửa/xoá được trong app)
export const QUY_TAC_RIENG_SAN = {
  pha_story: "Giữ nguyên tên các phần mềm: Photoshop (PTS), Lightroom (LR), Capture One, CapCut, DaVinci Resolve…\nDịch theo văn phong giảng dạy.\nXưng thầy với các trò.",
};
// Thuật ngữ của kênh → [[chữ Trung, tiếng Việt]] (bỏ phần tiếng Anh trong ngoặc cho máy đọc tự nhiên)
export function thuatNguKenh(id) {
  const k = CHANNEL_PROFILES[id] || CHANNEL_PROFILES.general;
  const ra = new Map();
  for (const nhom of k.glossaries || []) for (const [zh, vi] of Object.entries(GLOSSARY[nhom] || {})) if (!ra.has(zh)) ra.set(zh, vi.replace(/\s*\([^)]*\)\s*/g, " ").trim());
  return [...ra];
}
