// =====================================================
// MÁY CHỦ NHẮC GIỜ (chạy trên Cloudflare Workers)
//
// Việc của máy chủ này rất đơn giản:
//  1. App gửi lên danh sách "lúc nào cần nhắc, nhắc gì"   (đường dẫn /dong-bo)
//  2. Mỗi phút máy chủ thức dậy, thấy lần nhắc nào đến giờ
//     thì gửi thông báo về điện thoại (Web Push), kể cả khi app đang tắt.
//
// Dữ liệu nằm trong cơ sở dữ liệu D1, gồm 3 bảng:
//  - cau_hinh : cặp khóa VAPID (giống "con dấu" để điện thoại tin thông báo là của mình)
//  - dang_ky  : mỗi điện thoại đã bật thông báo
//  - nhac     : các lần nhắc đang chờ
// =====================================================

const LIEN_HE = "https://phamduycuong1604-spec.github.io/app-cua-toi/";
const TOI_DA_LAN_NHAC = 1000;      // mỗi điện thoại gửi lên tối đa bấy nhiêu lần nhắc
const TRE_TOI_DA = 60 * 60 * 1000; // trễ quá 1 tiếng thì bỏ, không nhắc nữa

export default {
  // Khi app gọi tới máy chủ
  async fetch(yeuCau, env) {
    if (yeuCau.method === "OPTIONS") return traLoi(null, 204);
    try {
      await taoBang(env);
      const duongDan = new URL(yeuCau.url).pathname;

      if (duongDan === "/khoa" && yeuCau.method === "GET") {
        const { khoaCongKhai } = await layKhoaVapid(env);
        return traLoi({ khoa: khoaCongKhai });
      }
      if (duongDan === "/dong-bo" && yeuCau.method === "POST") {
        return await dongBo(await yeuCau.json(), env);
      }
      if (duongDan === "/") return traLoi({ ok: true, ten: "Máy chủ nhắc giờ - Việc Hôm Nay" });
      return traLoi({ loi: "Không tìm thấy" }, 404);
    } catch (loi) {
      return traLoi({ loi: String(loi && loi.message ? loi.message : loi) }, 400);
    }
  },

  // Mỗi phút Cloudflare gọi hàm này
  async scheduled(_suKien, env) {
    await taoBang(env);
    await guiCacLanNhacDenGio(env);
  },
};


// ----- TRẢ LỜI CHO APP (cho phép gọi từ trang github.io) -----
function traLoi(duLieu, maTrangThai = 200) {
  return new Response(duLieu === null ? null : JSON.stringify(duLieu), {
    status: maTrangThai,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}


// ----- TẠO BẢNG (nếu chưa có) -----
async function taoBang(env) {
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS cau_hinh (khoa TEXT PRIMARY KEY, gia_tri TEXT)"),
    env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS dang_ky (endpoint TEXT PRIMARY KEY, p256dh TEXT, auth TEXT, cap_nhat INTEGER)"
    ),
    env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS nhac (endpoint TEXT, luc INTEGER, tieu_de TEXT, noi_dung TEXT, the TEXT)"
    ),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS nhac_theo_luc ON nhac (luc)"),
  ]);
}


// ----- APP GỬI DANH SÁCH NHẮC LÊN -----
// Mỗi lần gửi sẽ THAY THẾ toàn bộ lần nhắc cũ của điện thoại đó.
async function dongBo(duLieu, env) {
  const dk = duLieu && duLieu.dangKy;
  if (!dk || typeof dk.endpoint !== "string" || !dk.endpoint.startsWith("https://") || !dk.keys) {
    return traLoi({ loi: "Thiếu thông tin đăng ký thông báo" }, 400);
  }
  const cacNhac = Array.isArray(duLieu.cacNhac) ? duLieu.cacNhac.slice(0, TOI_DA_LAN_NHAC) : [];
  const bayGio = Date.now();
  const cat = (chu, doDai) => String(chu || "").slice(0, doDai);

  const lenh = [
    env.DB.prepare(
      "INSERT INTO dang_ky (endpoint, p256dh, auth, cap_nhat) VALUES (?1, ?2, ?3, ?4) " +
        "ON CONFLICT(endpoint) DO UPDATE SET p256dh = ?2, auth = ?3, cap_nhat = ?4"
    ).bind(dk.endpoint, cat(dk.keys.p256dh, 200), cat(dk.keys.auth, 100), bayGio),
    env.DB.prepare("DELETE FROM nhac WHERE endpoint = ?1").bind(dk.endpoint),
  ];
  for (const n of cacNhac) {
    const luc = Number(n.luc);
    if (!Number.isFinite(luc) || luc < bayGio - TRE_TOI_DA) continue;
    lenh.push(
      env.DB.prepare("INSERT INTO nhac (endpoint, luc, tieu_de, noi_dung, the) VALUES (?1, ?2, ?3, ?4, ?5)").bind(
        dk.endpoint, luc, cat(n.tieuDe, 200), cat(n.noiDung, 500), cat(n.the, 100)
      )
    );
  }
  await env.DB.batch(lenh);
  return traLoi({ ok: true, soLanNhac: lenh.length - 2 });
}


// ----- MỖI PHÚT: GỬI CÁC LẦN NHẮC ĐÃ ĐẾN GIỜ -----
async function guiCacLanNhacDenGio(env) {
  const bayGio = Date.now();
  // Dọn các lần nhắc quá cũ
  await env.DB.prepare("DELETE FROM nhac WHERE luc < ?1").bind(bayGio - TRE_TOI_DA).run();

  const { results: denGio } = await env.DB.prepare(
    "SELECT nhac.rowid AS ma, nhac.*, dang_ky.p256dh, dang_ky.auth FROM nhac " +
      "JOIN dang_ky ON dang_ky.endpoint = nhac.endpoint WHERE nhac.luc <= ?1 ORDER BY nhac.luc LIMIT 200"
  ).bind(bayGio).all();
  if (!denGio.length) return;

  const khoa = await layKhoaVapid(env);
  for (const n of denGio) {
    // Xóa trước để dù gửi lỗi cũng không nhắc lặp lại mãi
    await env.DB.prepare("DELETE FROM nhac WHERE rowid = ?1").bind(n.ma).run();
    const tinNhan = JSON.stringify({ tieuDe: n.tieu_de, noiDung: n.noi_dung, the: n.the });
    const ketQua = await guiWebPush({ endpoint: n.endpoint, p256dh: n.p256dh, auth: n.auth }, tinNhan, khoa);
    // 404/410 = điện thoại đã tắt thông báo hoặc gỡ app → xóa đăng ký
    if (ketQua.status === 404 || ketQua.status === 410) {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM dang_ky WHERE endpoint = ?1").bind(n.endpoint),
        env.DB.prepare("DELETE FROM nhac WHERE endpoint = ?1").bind(n.endpoint),
      ]);
    }
  }
}


// =====================================================
// PHẦN KỸ THUẬT: GỬI WEB PUSH (theo chuẩn RFC 8291 + RFC 8292)
// Không cần sửa phần dưới đây.
// =====================================================

const maHoa = new TextEncoder();

function base64url(byte) {
  let chu = "";
  for (const b of new Uint8Array(byte)) chu += String.fromCharCode(b);
  return btoa(chu).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function tuBase64url(chu) {
  const chuan = chu.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((chu.length + 3) % 4);
  return Uint8Array.from(atob(chuan), (k) => k.charCodeAt(0));
}

function noiByte(...cacPhan) {
  const tong = new Uint8Array(cacPhan.reduce((n, p) => n + p.length, 0));
  let viTri = 0;
  for (const p of cacPhan) {
    tong.set(p, viTri);
    viTri += p.length;
  }
  return tong;
}

async function hmac(khoa, duLieu) {
  const k = await crypto.subtle.importKey("raw", khoa, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, duLieu));
}

// Lấy cặp khóa VAPID; lần đầu chưa có thì tự tạo và cất vào D1
async function layKhoaVapid(env) {
  const dong = await env.DB.prepare("SELECT gia_tri FROM cau_hinh WHERE khoa = 'vapid'").first();
  if (dong) return JSON.parse(dong.gia_tri);

  const capKhoa = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const khoa = {
    khoaRieng: await crypto.subtle.exportKey("jwk", capKhoa.privateKey),
    khoaCongKhai: base64url(await crypto.subtle.exportKey("raw", capKhoa.publicKey)),
  };
  // Nếu 2 yêu cầu cùng tạo một lúc thì giữ khóa được lưu trước
  await env.DB.prepare("INSERT OR IGNORE INTO cau_hinh (khoa, gia_tri) VALUES ('vapid', ?1)")
    .bind(JSON.stringify(khoa)).run();
  const daLuu = await env.DB.prepare("SELECT gia_tri FROM cau_hinh WHERE khoa = 'vapid'").first();
  return JSON.parse(daLuu.gia_tri);
}

// Chữ ký VAPID (JWT ES256) chứng minh thông báo đến từ máy chủ của mình
async function taoChuKyVapid(endpoint, khoa) {
  const dau = base64url(maHoa.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const than = base64url(maHoa.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 60 * 60, // hết hạn sau 1 tiếng
    sub: LIEN_HE,
  })));
  const khoaKy = await crypto.subtle.importKey("jwk", khoa.khoaRieng, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const chuKy = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, khoaKy, maHoa.encode(`${dau}.${than}`));
  return `vapid t=${dau}.${than}.${base64url(chuKy)}, k=${khoa.khoaCongKhai}`;
}

// Mã hóa nội dung thông báo (aes128gcm) để chỉ điện thoại đó đọc được
export async function maHoaNoiDung(noiDung, p256dhB64, authB64) {
  const khoaDienThoai = tuBase64url(p256dhB64);
  const biMatXacThuc = tuBase64url(authB64);

  const capKhoaTam = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const khoaTamCongKhai = new Uint8Array(await crypto.subtle.exportKey("raw", capKhoaTam.publicKey));
  const khoaDT = await crypto.subtle.importKey("raw", khoaDienThoai, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const biMatChung = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: khoaDT }, capKhoaTam.privateKey, 256)
  );

  // HKDF theo RFC 8291
  const prkKhoa = await hmac(biMatXacThuc, biMatChung);
  const thongTinKhoa = noiByte(maHoa.encode("WebPush: info\0"), khoaDienThoai, khoaTamCongKhai);
  const ikm = (await hmac(prkKhoa, noiByte(thongTinKhoa, new Uint8Array([1])))).slice(0, 32);

  const muoi = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(muoi, ikm);
  const cek = (await hmac(prk, maHoa.encode("Content-Encoding: aes128gcm\0\x01"))).slice(0, 16);
  const nonce = (await hmac(prk, maHoa.encode("Content-Encoding: nonce\0\x01"))).slice(0, 12);

  const khoaAes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const banRo = noiByte(maHoa.encode(noiDung), new Uint8Array([2]));
  const banMa = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, khoaAes, banRo));

  // Phần đầu: muối (16) + kích thước bản ghi (4) + độ dài khóa (1) + khóa tạm (65)
  const dau = new Uint8Array(21);
  dau.set(muoi, 0);
  new DataView(dau.buffer).setUint32(16, 4096);
  dau[20] = khoaTamCongKhai.length;
  return noiByte(dau, khoaTamCongKhai, banMa);
}

export async function guiWebPush(dangKy, noiDung, khoa) {
  const than = await maHoaNoiDung(noiDung, dangKy.p256dh, dangKy.auth);
  return fetch(dangKy.endpoint, {
    method: "POST",
    headers: {
      Authorization: await taoChuKyVapid(dangKy.endpoint, khoa),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "3600",
      Urgency: "high",
    },
    body: than,
  });
}
