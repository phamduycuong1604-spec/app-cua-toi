// =====================================================
// TÀI KHOẢN NGƯỜI DÙNG + LƯU DỮ LIỆU CỦA TỪNG NGƯỜI
//
// - Chỉ quản trị viên tạo tài khoản (người lạ không tự đăng ký được)
// - Người đầu tiên (lúc máy chủ chưa có ai) được tạo tài khoản quản trị
// - Mật khẩu KHÔNG lưu nguyên văn, chỉ lưu "dấu vân tay" (PBKDF2)
// - Đăng nhập xong nhận một "vé" (token) dùng cho các lần gọi sau
// - Dữ liệu mỗi người gồm 3 phần: viec, thu-chi, cai-dat
// =====================================================

const VONG_BAM = 10000;                      // số vòng băm mật khẩu
const HAN_VE = 90 * 24 * 60 * 60 * 1000;     // vé đăng nhập dùng được 90 ngày
const CAC_PHAN_DU_LIEU = ["viec", "thu-chi", "cai-dat"];
const DU_LIEU_TOI_DA = 1500000;              // mỗi phần tối đa ~1,5 MB
const SAI_TOI_DA = 5;                        // sai mật khẩu 5 lần...
const KHOA_SAI_TRONG = 15 * 60 * 1000;       // ...thì khóa 15 phút

import gop from "../../chung/gop.js";

const LUU_LICH_SU_MOI = 10 * 60 * 1000;     // có thay đổi thì cứ 10 phút cất 1 bản lưu...
                                             // ...riêng khi có mục bị XÓA thì cất ngay
const SO_BAN_LUU_TOI_DA = 200;               // giữ 200 bản lưu gần nhất mỗi phần

const maHoa = new TextEncoder();

export async function taoBangTaiKhoan(env) {
  await env.DB.batch([
    env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS nguoi_dung (ten TEXT PRIMARY KEY, muoi TEXT, bam TEXT, quan_tri INTEGER, tao_luc INTEGER)"
    ),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS phien (ve_bam TEXT PRIMARY KEY, ten TEXT, het_han INTEGER)"),
    env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS du_lieu (ten TEXT, phan TEXT, gia_tri TEXT, cap_nhat INTEGER, PRIMARY KEY (ten, phan))"
    ),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS dang_nhap_sai (ten TEXT, luc INTEGER)"),
    // Bản lưu tự động: cất nội dung CŨ trước khi bị thay đổi
    env.DB.prepare("CREATE TABLE IF NOT EXISTS lich_su (ten TEXT, phan TEXT, gia_tri TEXT, luc INTEGER)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS lich_su_theo_nguoi ON lich_su (ten, phan, luc)"),
  ]);
}

// ----- CÁC HÀM NHỎ -----

class LoiNguoiDung extends Error {
  constructor(thongBao, ma = 400) {
    super(thongBao);
    this.ma = ma;
  }
}

function hex(byte) {
  return [...new Uint8Array(byte)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function bamMatKhau(matKhau, muoi) {
  const khoa = await crypto.subtle.importKey("raw", maHoa.encode(matKhau), "PBKDF2", false, ["deriveBits"]);
  const bit = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: maHoa.encode(muoi), iterations: VONG_BAM },
    khoa,
    256
  );
  return hex(bit);
}

async function sha256(chu) {
  return hex(await crypto.subtle.digest("SHA-256", maHoa.encode(chu)));
}

// So sánh 2 chuỗi mà không để lộ thời gian (chống đoán dần)
function giongNhau(a, b) {
  if (a.length !== b.length) return false;
  let khac = 0;
  for (let i = 0; i < a.length; i++) khac |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return khac === 0;
}

function kiemTraTen(ten) {
  ten = String(ten || "").trim().toLowerCase();
  if (!/^[a-z0-9_.]{2,30}$/.test(ten)) {
    throw new LoiNguoiDung("Tên đăng nhập 2–30 ký tự, chỉ gồm chữ không dấu, số, dấu _ hoặc dấu chấm.");
  }
  return ten;
}

function kiemTraMatKhau(matKhau) {
  matKhau = String(matKhau || "");
  if (matKhau.length < 6 || matKhau.length > 100) throw new LoiNguoiDung("Mật khẩu cần ít nhất 6 ký tự.");
  return matKhau;
}

async function luuNguoiDung(env, ten, matKhau, quanTri) {
  const muoi = hex(crypto.getRandomValues(new Uint8Array(16)));
  const bam = await bamMatKhau(matKhau, muoi);
  await env.DB.prepare("INSERT INTO nguoi_dung VALUES (?1, ?2, ?3, ?4, ?5)")
    .bind(ten, muoi, bam, quanTri ? 1 : 0, Date.now())
    .run();
}

async function datMatKhau(env, ten, matKhau) {
  const muoi = hex(crypto.getRandomValues(new Uint8Array(16)));
  const bam = await bamMatKhau(matKhau, muoi);
  await env.DB.batch([
    env.DB.prepare("UPDATE nguoi_dung SET muoi = ?2, bam = ?3 WHERE ten = ?1").bind(ten, muoi, bam),
    env.DB.prepare("DELETE FROM phien WHERE ten = ?1").bind(ten), // đăng xuất mọi máy
  ]);
}

async function taoVe(env, ten) {
  const ve = hex(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.batch([
    env.DB.prepare("INSERT INTO phien VALUES (?1, ?2, ?3)").bind(await sha256(ve), ten, Date.now() + HAN_VE),
    env.DB.prepare("DELETE FROM phien WHERE het_han < ?1").bind(Date.now()),
  ]);
  return ve;
}

// Đọc vé trong yêu cầu → trả về người dùng, hoặc báo lỗi 401
async function xacThuc(yeuCau, env) {
  const ve = (yeuCau.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!ve) throw new LoiNguoiDung("Chưa đăng nhập", 401);
  const nguoi = await env.DB.prepare(
    "SELECT nguoi_dung.ten, nguoi_dung.quan_tri FROM phien JOIN nguoi_dung ON nguoi_dung.ten = phien.ten " +
      "WHERE phien.ve_bam = ?1 AND phien.het_han > ?2"
  ).bind(await sha256(ve), Date.now()).first();
  if (!nguoi) throw new LoiNguoiDung("Phiên đăng nhập đã hết hạn, hãy đăng nhập lại", 401);
  return { ten: nguoi.ten, quanTri: !!nguoi.quan_tri, ve };
}

async function canQuanTri(yeuCau, env) {
  const nguoi = await xacThuc(yeuCau, env);
  if (!nguoi.quanTri) throw new LoiNguoiDung("Chỉ quản trị viên mới làm được việc này", 403);
  return nguoi;
}

async function demNguoiDung(env) {
  return env.DB.prepare("SELECT COUNT(*) AS n FROM nguoi_dung").first("n");
}

// ----- XỬ LÝ CÁC ĐƯỜNG DẪN -----
// Trả về null nếu đường dẫn không thuộc phần tài khoản

export async function xuLyTaiKhoan(yeuCau, env, duongDan, traLoi) {
  const p = yeuCau.method + " " + duongDan;
  const docThan = async () => {
    try {
      return await yeuCau.json();
    } catch (loi) {
      return {};
    }
  };

  try {
    // Máy chủ đã có ai chưa? (app dùng để biết hiện màn hình "tạo quản trị" hay "đăng nhập")
    if (p === "GET /tai-khoan/trang-thai") {
      return traLoi({ daCoNguoiDung: (await demNguoiDung(env)) > 0 });
    }

    // Tạo tài khoản quản trị đầu tiên (chỉ được khi chưa có ai)
    if (p === "POST /tai-khoan/khoi-tao") {
      const than = await docThan();
      const ten = kiemTraTen(than.ten);
      const matKhau = kiemTraMatKhau(than.matKhau);
      if ((await demNguoiDung(env)) > 0) throw new LoiNguoiDung("Máy chủ đã có tài khoản quản trị rồi", 403);
      // Cần "mã khởi tạo" (Account ID Cloudflare) để người lạ không chiếm quyền quản trị
      if (env.MA_KHOI_TAO && String(than.maKhoiTao || "").trim().toLowerCase() !== env.MA_KHOI_TAO.toLowerCase()) {
        throw new LoiNguoiDung("Mã khởi tạo chưa đúng", 403);
      }
      await luuNguoiDung(env, ten, matKhau, true);
      return traLoi({ ve: await taoVe(env, ten), ten, quanTri: true });
    }

    if (p === "POST /tai-khoan/dang-nhap") {
      const than = await docThan();
      const ten = String(than.ten || "").trim().toLowerCase();
      const bayGio = Date.now();
      const soLanSai = await env.DB.prepare("SELECT COUNT(*) AS n FROM dang_nhap_sai WHERE ten = ?1 AND luc > ?2")
        .bind(ten, bayGio - KHOA_SAI_TRONG).first("n");
      if (soLanSai >= SAI_TOI_DA) throw new LoiNguoiDung("Sai mật khẩu nhiều lần. Hãy thử lại sau 15 phút.", 429);

      const nguoi = await env.DB.prepare("SELECT * FROM nguoi_dung WHERE ten = ?1").bind(ten).first();
      const dung = nguoi && giongNhau(await bamMatKhau(String(than.matKhau || ""), nguoi.muoi), nguoi.bam);
      if (!dung) {
        await env.DB.batch([
          env.DB.prepare("INSERT INTO dang_nhap_sai VALUES (?1, ?2)").bind(ten, bayGio),
          env.DB.prepare("DELETE FROM dang_nhap_sai WHERE luc < ?1").bind(bayGio - KHOA_SAI_TRONG),
        ]);
        throw new LoiNguoiDung("Sai tên đăng nhập hoặc mật khẩu", 401);
      }
      await env.DB.prepare("DELETE FROM dang_nhap_sai WHERE ten = ?1").bind(ten).run();
      return traLoi({ ve: await taoVe(env, ten), ten, quanTri: !!nguoi.quan_tri });
    }

    if (p === "POST /tai-khoan/dang-xuat") {
      const nguoi = await xacThuc(yeuCau, env);
      await env.DB.prepare("DELETE FROM phien WHERE ve_bam = ?1").bind(await sha256(nguoi.ve)).run();
      return traLoi({ ok: true });
    }

    if (p === "GET /tai-khoan/toi") {
      const nguoi = await xacThuc(yeuCau, env);
      return traLoi({ ten: nguoi.ten, quanTri: nguoi.quanTri });
    }

    if (p === "POST /tai-khoan/doi-mat-khau") {
      const nguoi = await xacThuc(yeuCau, env);
      const than = await docThan();
      const dong = await env.DB.prepare("SELECT * FROM nguoi_dung WHERE ten = ?1").bind(nguoi.ten).first();
      if (!giongNhau(await bamMatKhau(String(than.matKhauCu || ""), dong.muoi), dong.bam)) {
        throw new LoiNguoiDung("Mật khẩu hiện tại chưa đúng", 403);
      }
      await datMatKhau(env, nguoi.ten, kiemTraMatKhau(than.matKhauMoi));
      // Đổi xong vẫn giữ đăng nhập trên máy đang dùng
      return traLoi({ ve: await taoVe(env, nguoi.ten) });
    }

    // ----- QUẢN TRỊ: quản lý tài khoản -----

    if (p === "GET /quan-tri/nguoi-dung") {
      await canQuanTri(yeuCau, env);
      const { results } = await env.DB.prepare(
        "SELECT ten, quan_tri, tao_luc FROM nguoi_dung ORDER BY tao_luc"
      ).all();
      return traLoi({ nguoiDung: results.map((r) => ({ ten: r.ten, quanTri: !!r.quan_tri, taoLuc: r.tao_luc })) });
    }

    if (p === "POST /quan-tri/nguoi-dung") {
      await canQuanTri(yeuCau, env);
      const than = await docThan();
      const ten = kiemTraTen(than.ten);
      const matKhau = kiemTraMatKhau(than.matKhau);
      if (await env.DB.prepare("SELECT 1 FROM nguoi_dung WHERE ten = ?1").bind(ten).first()) {
        throw new LoiNguoiDung("Tên đăng nhập này đã có người dùng");
      }
      await luuNguoiDung(env, ten, matKhau, !!than.quanTri);
      return traLoi({ ok: true });
    }

    if (p === "POST /quan-tri/dat-lai-mat-khau") {
      await canQuanTri(yeuCau, env);
      const than = await docThan();
      const ten = kiemTraTen(than.ten);
      if (!(await env.DB.prepare("SELECT 1 FROM nguoi_dung WHERE ten = ?1").bind(ten).first())) {
        throw new LoiNguoiDung("Không tìm thấy tài khoản", 404);
      }
      await datMatKhau(env, ten, kiemTraMatKhau(than.matKhau));
      return traLoi({ ok: true });
    }

    if (p === "POST /quan-tri/xoa") {
      const toi = await canQuanTri(yeuCau, env);
      const ten = kiemTraTen((await docThan()).ten);
      if (ten === toi.ten) throw new LoiNguoiDung("Không thể tự xóa tài khoản của chính mình");
      await env.DB.batch([
        env.DB.prepare("DELETE FROM nguoi_dung WHERE ten = ?1").bind(ten),
        env.DB.prepare("DELETE FROM phien WHERE ten = ?1").bind(ten),
        env.DB.prepare("DELETE FROM du_lieu WHERE ten = ?1").bind(ten),
        env.DB.prepare("DELETE FROM lich_su WHERE ten = ?1").bind(ten),
      ]);
      return traLoi({ ok: true });
    }

    // ----- DỮ LIỆU CỦA TỪNG NGƯỜI -----

    if (p === "GET /du-lieu") {
      const nguoi = await xacThuc(yeuCau, env);
      const { results } = await env.DB.prepare("SELECT phan, gia_tri, cap_nhat FROM du_lieu WHERE ten = ?1")
        .bind(nguoi.ten).all();
      const ketQua = {};
      results.forEach((r) => (ketQua[r.phan] = { giaTri: JSON.parse(r.gia_tri), capNhat: r.cap_nhat }));
      return traLoi(ketQua);
    }

    // Danh sách bản lưu tự động (không kèm nội dung)
    if (p === "GET /du-lieu/lich-su") {
      const nguoi = await xacThuc(yeuCau, env);
      const { results } = await env.DB.prepare(
        "SELECT rowid AS ma, phan, luc, gia_tri FROM lich_su WHERE ten = ?1 ORDER BY luc DESC LIMIT 60"
      ).bind(nguoi.ten).all();
      return traLoi({
        banLuu: results.map((r) => {
          const giaTri = JSON.parse(r.gia_tri);
          const soMuc = r.phan === "cai-dat" ? null : gop.chuanHoaPhan(giaTri).muc.length;
          return { ma: r.ma, phan: r.phan, luc: r.luc, soMuc };
        }),
      });
    }

    // Nội dung một bản lưu
    const khopBanLuu = /^GET \/du-lieu\/lich-su\/(\d+)$/.exec(p);
    if (khopBanLuu) {
      const nguoi = await xacThuc(yeuCau, env);
      const dong = await env.DB.prepare("SELECT phan, gia_tri, luc FROM lich_su WHERE rowid = ?1 AND ten = ?2")
        .bind(Number(khopBanLuu[1]), nguoi.ten).first();
      if (!dong) throw new LoiNguoiDung("Không tìm thấy bản lưu", 404);
      return traLoi({ phan: dong.phan, luc: dong.luc, giaTri: JSON.parse(dong.gia_tri) });
    }

    // Lưu dữ liệu: GỘP với bản trên máy chủ (không ghi đè), cất bản cũ vào lịch sử
    const khopLuu = /^PUT \/du-lieu\/([a-z-]+)$/.exec(p);
    if (khopLuu) {
      const nguoi = await xacThuc(yeuCau, env);
      const phan = khopLuu[1];
      if (!CAC_PHAN_DU_LIEU.includes(phan)) throw new LoiNguoiDung("Không có phần dữ liệu này", 404);
      const chu = await yeuCau.text();
      if (chu.length > DU_LIEU_TOI_DA) throw new LoiNguoiDung("Dữ liệu quá lớn", 413);
      const giaTriGuiLen = JSON.parse(chu).giaTri;

      // Thử vài lần phòng khi 2 máy gửi cùng lúc (mỗi lần đọc lại bản mới nhất rồi gộp)
      for (let lan = 0; lan < 5; lan++) {
        const dong = await env.DB.prepare("SELECT gia_tri, cap_nhat FROM du_lieu WHERE ten = ?1 AND phan = ?2")
          .bind(nguoi.ten, phan).first();
        const giaTriCu = dong ? JSON.parse(dong.gia_tri) : null;
        // Cài đặt: lấy bản mới; công việc / thu chi: gộp từng mục
        const giaTriMoi = phan === "cai-dat" ? giaTriGuiLen : gop.gopPhan(giaTriCu, giaTriGuiLen);
        const capNhat = Math.max(Date.now(), dong ? dong.cap_nhat + 1 : 0);

        let ketQua;
        if (!dong) {
          ketQua = await env.DB.prepare("INSERT OR IGNORE INTO du_lieu VALUES (?1, ?2, ?3, ?4)")
            .bind(nguoi.ten, phan, JSON.stringify(giaTriMoi), capNhat).run();
        } else {
          ketQua = await env.DB.prepare(
            "UPDATE du_lieu SET gia_tri = ?3, cap_nhat = ?4 WHERE ten = ?1 AND phan = ?2 AND cap_nhat = ?5"
          ).bind(nguoi.ten, phan, JSON.stringify(giaTriMoi), capNhat, dong.cap_nhat).run();
        }
        if (!ketQua.meta.changes) continue; // máy khác vừa ghi xen vào → làm lại

        // Cất bản CŨ vào lịch sử: ngay lập tức nếu có mục bị xóa, còn lại tối đa 10 phút một bản
        if (dong && dong.gia_tri !== JSON.stringify(giaTriMoi)) {
          let coMucBiXoa = false;
          if (phan !== "cai-dat") {
            const conLai = new Set(giaTriMoi.muc.map((x) => x.id));
            coMucBiXoa = gop.chuanHoaPhan(giaTriCu).muc.some((x) => !conLai.has(x.id));
          }
          const ganNhat = await env.DB.prepare("SELECT MAX(luc) AS luc FROM lich_su WHERE ten = ?1 AND phan = ?2")
            .bind(nguoi.ten, phan).first("luc");
          if (coMucBiXoa || !ganNhat || Date.now() - ganNhat > LUU_LICH_SU_MOI) {
            await env.DB.batch([
              env.DB.prepare("INSERT INTO lich_su VALUES (?1, ?2, ?3, ?4)").bind(nguoi.ten, phan, dong.gia_tri, Date.now()),
              env.DB.prepare(
                "DELETE FROM lich_su WHERE ten = ?1 AND phan = ?2 AND rowid NOT IN " +
                  "(SELECT rowid FROM lich_su WHERE ten = ?1 AND phan = ?2 ORDER BY luc DESC LIMIT ?3)"
              ).bind(nguoi.ten, phan, SO_BAN_LUU_TOI_DA),
            ]);
          }
        }
        return traLoi({ capNhat, giaTri: giaTriMoi });
      }
      throw new LoiNguoiDung("Máy chủ đang bận, thử lại sau ít giây", 409);
    }

    return null;
  } catch (loi) {
    if (loi instanceof LoiNguoiDung) return traLoi({ loi: loi.message }, loi.ma);
    throw loi;
  }
}
