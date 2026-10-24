// =====================================================
// PHỤ ĐỀ SRT: tạo file, đọc file người dùng dán, ghép bản dịch vào các câu
// =====================================================

// Tạo SRT từ danh sách câu, lấy chữ ở trường "vi" (tiếng Việt) hoặc "zh" (tiếng Trung)
export function taoSrt(cacCau, truong = "vi") {
  const gio = (s) => {
    const ms = Math.round(s * 1000);
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), g = Math.floor((ms % 60000) / 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(g).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
  };
  return cacCau
    .filter((c) => (c[truong] || "").trim())
    .map((c, i) => `${i + 1}\n${gio(c.start)} --> ${gio(c.end)}\n${c[truong].trim()}\n`)
    .join("\n");
}

// Dòng mốc giờ: 2 mốc giờ, giữa là "-->" – chấp nhận cả "->", "–>", "→" (điện thoại/app dịch hay tự đổi dấu)
const MOC_GIO = /(\d{1,2}\s*:\s*\d{1,2}\s*:\s*\d{1,2}\s*[,.]\s*\d{1,3})\s*[-–—=>→\s]+\s*(\d{1,2}\s*:\s*\d{1,2}\s*:\s*\d{1,2}\s*[,.]\s*\d{1,3})/;
const giay = (t) => {
  const m = /(\d+)\s*:\s*(\d+)\s*:\s*(\d+)\s*[,.]\s*(\d+)/.exec(t);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4].padEnd(3, "0").slice(0, 3) / 1000 : NaN;
};

// Đọc SRT (hoặc chỉ là các dòng chữ, mỗi dòng 1 câu) → [{start, end, chu}]
// Đọc từng dòng: gặp dòng mốc giờ là bắt đầu câu mới; các dòng chữ sau đó là lời
// (bỏ số thứ tự đứng ngay trước mốc giờ) → vẫn đọc được SRT bị mất dòng trống giữa các câu
export function docSrt(chu) {
  const dong = String(chu || "").replace(/\r/g, "").split("\n").map((d) => d.trim());
  const ra = [];
  dong.forEach((d, i) => {
    const m = MOC_GIO.exec(d);
    if (m) return ra.push({ start: giay(m[1]), end: giay(m[2]), chu: "" });
    const cuoi = ra[ra.length - 1];
    if (!cuoi || !d) return;
    if (/^\d+$/.test(d) && MOC_GIO.test(dong[i + 1] || "")) return;
    cuoi.chu = cuoi.chu ? cuoi.chu + " " + d : d;
  });
  if (ra.length) return ra;
  // Không có mốc giờ: mỗi dòng là 1 câu, theo đúng thứ tự
  return dong.filter(Boolean).map((d) => ({ start: NaN, end: NaN, chu: d }));
}

// Dùng bản dịch người dùng dán:
// - Có mốc giờ: dùng ĐÚNG các câu, chữ và mốc giờ trong bản dán (thay hẳn danh sách câu của app – không câu nào
//   còn giữ bản dịch của app); lời gốc tiếng Trung lấy theo các câu trùng giờ
// - Không có mốc giờ: cùng số câu thì ghép theo thứ tự; khác số câu thì báo lỗi
// Trả về số câu đã dùng.
export function ganBanDich(cacCau, ds) {
  if (ds.every((d) => Number.isFinite(d.start) && Number.isFinite(d.end) && d.end > d.start)) {
    const moi = ds
      .map((d) => ({
        start: d.start,
        end: d.end,
        vi: d.chu,
        zh: cacCau.filter((c) => Math.min(c.end, d.end) - Math.max(c.start, d.start) > 0.1).map((c) => c.zh).join(" "),
      }))
      .sort((a, b) => a.start - b.start);
    cacCau.splice(0, cacCau.length, ...moi);
    return moi.length;
  }
  const cau = cacCau.filter((c) => (c.zh || "").trim());
  if (ds.length !== cau.length)
    throw new Error(`Bản dán có ${ds.length} câu nhưng video có ${cau.length} câu, lại không có mốc giờ → không ghép được. Dán đủ ${cau.length} câu, hoặc dán dạng SRT có mốc giờ.`);
  cau.forEach((c, i) => (c.vi = ds[i].chu));
  return cau.length;
}
