// =====================================================
// GỘP DỮ LIỆU GIỮA CÁC MÁY (dùng chung cho app và máy chủ)
//
// Mỗi phần dữ liệu (công việc, thu chi) có dạng:
//   { muc: [ {id, ..., capNhatLuc}, ... ], daXoa: [ {id, luc}, ... ] }
// - capNhatLuc: lúc mục được thêm/sửa gần nhất
// - daXoa: "giấy báo xóa" — mục nào bị xóa ở máy nào thì máy khác cũng xóa theo
// Gộp 2 bản: mỗi mục lấy bản sửa sau cùng; mục bị xóa sau lần sửa cuối thì bỏ.
// KHÔNG bao giờ ghi đè cả danh sách.
// =====================================================

const GIU_GIAY_BAO_XOA = 90 * 24 * 60 * 60 * 1000; // giữ giấy báo xóa 90 ngày

// Dữ liệu cũ chỉ là một danh sách → đổi sang dạng mới
function chuanHoaPhan(giaTri) {
  if (Array.isArray(giaTri)) return { muc: giaTri, daXoa: [] };
  if (giaTri && Array.isArray(giaTri.muc)) return { muc: giaTri.muc, daXoa: giaTri.daXoa || [] };
  return { muc: [], daXoa: [] };
}

function gopPhan(a, b) {
  a = chuanHoaPhan(a);
  b = chuanHoaPhan(b);
  const lucXoa = new Map();
  [...a.daXoa, ...b.daXoa].forEach((t) => lucXoa.set(t.id, Math.max(lucXoa.get(t.id) || 0, t.luc || 0)));

  const theoId = new Map();
  [...a.muc, ...b.muc].forEach((x) => {
    const daCo = theoId.get(x.id);
    if (!daCo || (x.capNhatLuc || 0) > (daCo.capNhatLuc || 0)) theoId.set(x.id, x);
  });

  const han = Date.now() - GIU_GIAY_BAO_XOA;
  return {
    muc: [...theoId.values()].filter((x) => !(lucXoa.has(x.id) && lucXoa.get(x.id) >= (x.capNhatLuc || 0))),
    daXoa: [...lucXoa].filter(([, luc]) => luc > han).map(([id, luc]) => ({ id, luc })),
  };
}

// Dùng được cả trong app (thẻ <script>) lẫn máy chủ (import)
if (typeof module !== "undefined") module.exports = { chuanHoaPhan, gopPhan };
