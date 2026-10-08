// Máy chủ GIẢ LẬP PhaHa AI — để thử panel trong Photoshop khi chưa có backend thật.
// Chạy: npm run mock   →   http://localhost:8787
// Đăng nhập bằng email/mật khẩu bất kỳ. Ví có sẵn 500 điểm.
// "AI" ở đây chỉ là hiệu ứng đơn giản (đổi tông, làm mịn, phóng to) để thấy layer được chèn đúng chỗ.
import http from "node:http";
import { randomUUID } from "node:crypto";
import { decode as decodePng, encode as encodePng } from "fast-png";
import jpeg from "jpeg-js";

const PORT = Number(process.env.PORT || 8787);
const JOB_SECONDS = Number(process.env.JOB_SECONDS || 4);

const PRICES = { "gpt-image-2.5": 15, "gpt-image-2": 12, faceLock: 2, retouch: 3, retouch4k: 6, special: 20, up2: 4, up4: 8, mpx12: 6, mpx24: 10 };

const users = new Map(); // email -> user
const tokens = new Map(); // token -> { email, exp }
const refreshTokens = new Map(); // refresh -> email
const jobs = new Map();

// ── tiện ích ảnh ───────────────────────────────────────────────
function b64ToBytes(s) {
  const i = s.indexOf(",");
  return new Uint8Array(Buffer.from(s.startsWith("data:") ? s.slice(i + 1) : s, "base64"));
}
function decodeAny(s) {
  const b = b64ToBytes(s);
  if (b[0] === 0xff && b[1] === 0xd8) {
    const j = jpeg.decode(b, { useTArray: true, formatAsRGBA: true });
    return { width: j.width, height: j.height, data: j.data };
  }
  const p = decodePng(b);
  const n = p.width * p.height;
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const c = p.channels;
    const v = (k) => p.data[i * c + k] >> (p.depth === 16 ? 8 : 0);
    if (c <= 2) {
      out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v(0);
      out[i * 4 + 3] = c === 2 ? v(1) : 255;
    } else {
      out[i * 4] = v(0);
      out[i * 4 + 1] = v(1);
      out[i * 4 + 2] = v(2);
      out[i * 4 + 3] = c === 4 ? v(3) : 255;
    }
  }
  return { width: p.width, height: p.height, data: out };
}
const pngDataUrl = (img, channels = 4) =>
  "data:image/png;base64," + Buffer.from(encodePng({ width: img.width, height: img.height, data: img.data, channels })).toString("base64");

function mapPixels(img, fn) {
  const d = new Uint8Array(img.data);
  for (let i = 0; i < d.length; i += 4) {
    const [r, g, b] = fn(d[i], d[i + 1], d[i + 2]);
    d[i] = clamp(r);
    d[i + 1] = clamp(g);
    d[i + 2] = clamp(b);
  }
  return { ...img, data: d };
}
const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

function blur(img, r) {
  const { width: w, height: h } = img;
  const src = img.data;
  const tmp = new Uint8Array(src.length);
  const out = new Uint8Array(src.length);
  const size = 2 * r + 1;
  for (let y = 0; y < h; y++)
    for (let c = 0; c < 4; c++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += src[(y * w + Math.min(w - 1, Math.max(0, k))) * 4 + c];
      for (let x = 0; x < w; x++) {
        tmp[(y * w + x) * 4 + c] = s / size;
        s += src[(y * w + Math.min(w - 1, x + r + 1)) * 4 + c] - src[(y * w + Math.max(0, x - r)) * 4 + c];
      }
    }
  for (let x = 0; x < w; x++)
    for (let c = 0; c < 4; c++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += tmp[(Math.min(h - 1, Math.max(0, k)) * w + x) * 4 + c];
      for (let y = 0; y < h; y++) {
        out[(y * w + x) * 4 + c] = s / size;
        s += tmp[(Math.min(h - 1, y + r + 1) * w + x) * 4 + c] - tmp[(Math.max(0, y - r) * w + x) * 4 + c];
      }
    }
  return { width: w, height: h, data: out };
}

function resize(img, dw, dh) {
  const out = new Uint8Array(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const fy = Math.max(0, ((y + 0.5) * img.height) / dh - 0.5);
    const y0 = Math.min(img.height - 1, Math.floor(fy)), y1 = Math.min(img.height - 1, y0 + 1), wy = fy - y0;
    for (let x = 0; x < dw; x++) {
      const fx = Math.max(0, ((x + 0.5) * img.width) / dw - 0.5);
      const x0 = Math.min(img.width - 1, Math.floor(fx)), x1 = Math.min(img.width - 1, x0 + 1), wx = fx - x0;
      for (let c = 0; c < 4; c++) {
        const a = img.data[(y0 * img.width + x0) * 4 + c], b = img.data[(y0 * img.width + x1) * 4 + c];
        const cc = img.data[(y1 * img.width + x0) * 4 + c], d = img.data[(y1 * img.width + x1) * 4 + c];
        const t = a + (b - a) * wx, bt = cc + (d - cc) * wx;
        out[(y * dw + x) * 4 + c] = t + (bt - t) * wy;
      }
    }
  }
  return { width: dw, height: dh, data: out };
}

function crop(img, x, y, w, h) {
  const out = new Uint8Array(w * h * 4);
  for (let j = 0; j < h; j++) out.set(img.data.subarray(((y + j) * img.width + x) * 4, ((y + j) * img.width + x + w) * 4), j * w * 4);
  return { width: w, height: h, data: out };
}

const TONES = {
  warm: (r, g, b) => [r * 1.08 + 12, g * 1.02 + 4, b * 0.88],
  cool: (r, g, b) => [r * 0.92, g * 1.0, b * 1.1 + 10],
  film: (r, g, b) => [r * 0.95 + 18, g * 0.92 + 14, b * 0.85 + 20],
  bw: (r, g, b) => {
    const l = r * 0.3 + g * 0.59 + b * 0.11;
    return [l, l, l];
  },
  pastel: (r, g, b) => [r * 0.85 + 40, g * 0.85 + 38, b * 0.85 + 42],
  moody: (r, g, b) => [r * 0.85, g * 0.9, b * 0.95 + 5],
  pink: (r, g, b) => [r * 1.06 + 8, g * 0.98, b * 1.02 + 6],
};

// ── xử lý từng loại job ────────────────────────────────────────
function runJob(job) {
  const b = job.body;
  if (job.kind === "gen") {
    if (!b.image) {
      // sinh ảnh mới: dải màu
      const w = 1024, h = 1024, d = new Uint8Array(w * h * 4);
      for (let i = 0; i < w * h; i++) {
        d[i * 4] = (i % w) / 4;
        d[i * 4 + 1] = Math.floor(i / w) / 4;
        d[i * 4 + 2] = 180;
        d[i * 4 + 3] = 255;
      }
      return { layers: [{ image: pngDataUrl({ width: w, height: h, data: d }) }] };
    }
    const img = decodeAny(b.image);
    const toneKey = /hoàng hôn|nắng|ấm|vàng/i.test(b.prompt) ? "warm" : /tuyết|lạnh|đêm|sao/i.test(b.prompt) ? "cool" : /đen trắng|chì/i.test(b.prompt) ? "bw" : "film";
    const out = mapPixels(img, TONES[toneKey]);
    const layers = [{ image: pngDataUrl(out) }];
    if (b.face_lock) {
      // Giả lập "giữ mặt": cắt vùng giữa-trên làm Face 1 với mask hình elip.
      const fw = Math.round(img.width * 0.3), fh = Math.round(img.height * 0.35);
      const fx = Math.round((img.width - fw) / 2), fy = Math.round(img.height * 0.12);
      const face = crop(img, fx, fy, fw, fh);
      const m = new Uint8Array(fw * fh);
      for (let y = 0; y < fh; y++)
        for (let x = 0; x < fw; x++) {
          const dx = (x - fw / 2) / (fw / 2), dy = (y - fh / 2) / (fh / 2);
          m[y * fw + x] = dx * dx + dy * dy <= 1 ? 255 : 0;
        }
      layers.push({ name: "Face 1", image: pngDataUrl(face), mask: pngDataUrl({ width: fw, height: fh, data: m }, 1), x: fx, y: fy, width: fw, height: fh });
    }
    return { layers };
  }
  if (job.kind === "retouch") {
    const img = decodeAny(b.image);
    const r = b.type === "clothes" ? 2 : 3;
    let out = blur(img, Math.max(1, Math.round((r * img.width) / 1000)));
    if (b.type === "skin") out = mapPixels(out, TONES.pink);
    return { layers: [{ image: pngDataUrl(out) }] };
  }
  if (job.kind === "special") {
    const img = decodeAny(b.image);
    const key = String(b.preset).split(".")[1];
    const fn = TONES[key] || (String(b.preset).startsWith("makeup") ? TONES.pink : TONES.warm);
    return { layers: [{ image: pngDataUrl(mapPixels(img, fn)) }] };
  }
  if (job.kind === "upscale") {
    const img = decodeAny(b.image);
    let w = b.target_width, h = b.target_height;
    if (!w || !h) {
      const k = b.scale || Math.sqrt(((b.mpx || 12) * 1e6) / (img.width * img.height));
      w = Math.round(img.width * k);
      h = Math.round(img.height * k);
    }
    return { layers: [{ image: pngDataUrl(resize(img, w, h)) }] };
  }
  throw new Error("Loại job không rõ");
}

// ── HTTP ───────────────────────────────────────────────────────
function send(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const s = Buffer.concat(chunks).toString("utf8");
  return s ? JSON.parse(s) : {};
}

function issueTokens(email) {
  const token = randomUUID(), refresh = randomUUID();
  tokens.set(token, { email, exp: Date.now() + 3600_000 });
  refreshTokens.set(refresh, email);
  return { token, refresh_token: refresh, expires_in: 3600 };
}

function auth(req) {
  const t = (req.headers.authorization || "").replace(/^Bearer /, "");
  const s = tokens.get(t);
  if (!s || s.exp < Date.now()) return null;
  return users.get(s.email);
}

function charge(user, amount, description) {
  user.credits -= amount;
  user.tx.unshift({ id: randomUUID(), created_at: new Date().toISOString(), amount: -amount, description, balance: user.credits });
}

function createJob(user, kind, body, cost, description) {
  if (cost > user.credits) return { error: `Không đủ điểm: cần ${cost}đ, còn ${user.credits}đ.`, status: 402 };
  if (cost) charge(user, cost, description);
  const id = randomUUID().slice(0, 8);
  jobs.set(id, { id, kind, body, cost, user: user.email, createdAt: Date.now(), status: "pending" });
  return { job_id: id, cost, credits_left: user.credits };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const path = url.pathname;
  const t0 = Date.now();
  res.on("finish", () => console.log(`${req.method} ${path} → ${res.statusCode} (${Date.now() - t0}ms)`));
  if (req.method === "OPTIONS") return send(res, 204, {});
  try {
    if (req.method === "GET" && path === "/") return send(res, 200, { ok: true, name: "PhaHa AI mock server" });

    if (req.method === "POST" && path === "/api/auth/login") {
      const { email, password } = await readBody(req);
      if (!email || !password) return send(res, 400, { error: "Thiếu email hoặc mật khẩu." });
      if (!users.has(email)) users.set(email, { id: randomUUID(), name: email.split("@")[0], email, credits: 500, tx: [{ id: "welcome", created_at: new Date().toISOString(), amount: 500, description: "Tặng điểm dùng thử", balance: 500 }] });
      const u = users.get(email);
      return send(res, 200, { ...issueTokens(email), user: pub(u) });
    }
    if (req.method === "POST" && path === "/api/auth/refresh") {
      const { refresh_token } = await readBody(req);
      const email = refreshTokens.get(refresh_token);
      if (!email) return send(res, 401, { error: "Phiên đăng nhập hết hạn." });
      refreshTokens.delete(refresh_token);
      return send(res, 200, issueTokens(email));
    }

    const user = auth(req);
    if (!user) return send(res, 401, { error: "Phiên đăng nhập đã hết, hãy đăng nhập lại." });

    if (req.method === "GET" && path === "/api/me") return send(res, 200, pub(user));
    if (req.method === "GET" && path === "/api/transactions") return send(res, 200, { items: user.tx });
    if (req.method === "GET" && path === "/api/prompts") return send(res, 404, { error: "Dùng danh sách có sẵn trong panel" });
    if (req.method === "GET" && path === "/api/special/presets") return send(res, 404, { error: "Dùng danh sách có sẵn trong panel" });

    if (req.method === "POST" && path === "/api/gen") {
      const b = await readBody(req);
      if (!b.prompt) return send(res, 400, { error: "Thiếu prompt." });
      const cost = b.free ? 0 : (PRICES[b.model] ?? 15) + (b.face_lock ? PRICES.faceLock : 0);
      const r = createJob(user, "gen", b, cost, `Gen ${b.model}: ${b.prompt.slice(0, 40)}`);
      return send(res, r.status || 200, r);
    }
    if (req.method === "POST" && path === "/api/retouch/detect") {
      const b = await readBody(req);
      const img = decodeAny(b.image);
      const W = img.width, H = img.height;
      const R = (l, t, r, bt) => ({ left: Math.round(l * W), top: Math.round(t * H), right: Math.round(r * W), bottom: Math.round(bt * H) });
      return send(res, 200, {
        regions: [
          { label: "head", name: "Đầu", bounds: R(0.35, 0.05, 0.65, 0.3) },
          { label: "neck_shoulder", name: "Cổ vai", bounds: R(0.25, 0.28, 0.75, 0.42) },
          { label: "arms", name: "Tay", bounds: R(0.1, 0.4, 0.9, 0.65) },
          { label: "legs", name: "Chân", bounds: R(0.3, 0.65, 0.7, 0.98) },
        ],
      });
    }
    if (req.method === "POST" && path === "/api/retouch") {
      const b = await readBody(req);
      const cost = b.quality === "4k" ? PRICES.retouch4k : PRICES.retouch;
      const r = createJob(user, "retouch", b, cost, `Retouch: ${b.name || b.type}`);
      return send(res, r.status || 200, r);
    }
    if (req.method === "POST" && path === "/api/special") {
      const b = await readBody(req);
      const r = createJob(user, "special", b, PRICES.special, `Special: ${b.preset}`);
      return send(res, r.status || 200, r);
    }
    if (req.method === "POST" && path === "/api/upscale") {
      const b = await readBody(req);
      const cost = b.scale === 4 ? PRICES.up4 : b.scale === 2 ? PRICES.up2 : b.mpx === 24 ? PRICES.mpx24 : PRICES.mpx12;
      const r = createJob(user, "upscale", b, cost, `Upscale ${b.scale ? b.scale + "x" : b.mpx + "Mpx"}`);
      return send(res, r.status || 200, r);
    }

    let m;
    if ((m = path.match(/^\/api\/jobs\/([^/]+)\/cancel$/)) && req.method === "POST") {
      const j = jobs.get(m[1]);
      if (!j) return send(res, 404, { error: "Không tìm thấy job." });
      if (j.status === "pending" || j.status === "running") {
        j.status = "canceled";
        if (j.cost) {
          user.credits += j.cost;
          user.tx.unshift({ id: randomUUID(), created_at: new Date().toISOString(), amount: j.cost, description: "Hoàn điểm job đã hủy", balance: user.credits });
        }
      }
      return send(res, 200, { ok: true });
    }
    if ((m = path.match(/^\/api\/jobs\/([^/]+)$/)) && req.method === "GET") {
      const j = jobs.get(m[1]);
      if (!j) return send(res, 404, { error: "Không tìm thấy job." });
      const age = (Date.now() - j.createdAt) / 1000;
      if (j.status === "pending" || j.status === "running") {
        if (age < 1) j.status = "pending";
        else if (age < JOB_SECONDS) j.status = "running";
        else {
          try {
            j.result = runJob(j);
            j.status = "done";
          } catch (e) {
            j.status = "error";
            j.error = "Mock không xử lý được ảnh: " + e.message;
          }
        }
      }
      return send(res, 200, {
        id: j.id,
        status: j.status,
        progress: Math.min(1, age / JOB_SECONDS),
        error: j.error,
        credits_left: user.credits,
        result: j.status === "done" ? j.result : undefined,
      });
    }
    return send(res, 404, { error: "Không có đường dẫn " + path });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: "Lỗi máy chủ giả lập: " + e.message });
  }
});

const pub = (u) => ({ id: u.id, name: u.name, email: u.email, credits: u.credits });

server.listen(PORT, () => {
  console.log(`\n  Máy chủ giả lập PhaHa AI đang chạy: http://localhost:${PORT}`);
  console.log("  Trong panel: bấm 'Máy chủ ⚙' ở màn hình đăng nhập → điền địa chỉ trên → đăng nhập email/mật khẩu bất kỳ.\n");
});
