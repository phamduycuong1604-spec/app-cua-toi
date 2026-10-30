// Cloudflare Workers cannot spawn Python. This private HTTPS bridge is optional;
// leaving it unconfigured always preserves the existing desktop/cookie resolver.
const MESSAGES = {
  NOT_CONFIGURED: 'yt-dlp chưa có máy chủ riêng, dùng cách lấy nguồn desktop dự phòng',
  MISCONFIGURED: 'Kết nối máy chủ yt-dlp chưa cấu hình đủ hoặc không hợp lệ',
  UNAUTHORIZED: 'Mã kết nối máy chủ yt-dlp không hợp lệ',
  LOGIN_REQUIRED: 'yt-dlp: Rednote yêu cầu đăng nhập; thử phiên Rednote của app qua cách dự phòng',
  ACCESS_DENIED: 'yt-dlp bị Rednote chặn truy cập hoặc yêu cầu xác minh',
  TIMEOUT: 'Máy chủ yt-dlp quá thời gian chờ',
  NO_VIDEO: 'yt-dlp không tìm được link MP4 trực tiếp phù hợp',
  UNVERIFIED: 'Link yt-dlp chưa có bằng chứng không watermark',
  BUSY: 'Máy chủ yt-dlp đang bận',
  EXTRACT_FAILED: 'yt-dlp chưa lấy được thông tin video',
  INVALID_RESPONSE: 'Máy chủ yt-dlp trả dữ liệu không hợp lệ',
  NETWORK_ERROR: 'Chưa kết nối được máy chủ yt-dlp',
};
export const ytMessage = code => MESSAGES[code] || MESSAGES.EXTRACT_FAILED;
export function configuredYtdlp(env) {
  if (!env?.YTDLP_SERVICE_URL && !env?.YTDLP_SERVICE_TOKEN) return { code: 'NOT_CONFIGURED' };
  if (!env?.YTDLP_SERVICE_URL || !env?.YTDLP_SERVICE_TOKEN || env.YTDLP_SERVICE_TOKEN.length < 32) return { code: 'MISCONFIGURED' };
  try {
    const url = new URL(env.YTDLP_SERVICE_URL);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search || !['', '/v1/rednote/resolve', '/'].includes(url.pathname)) return { code: 'MISCONFIGURED' };
    url.pathname = '/v1/rednote/resolve';
    return { url: url.href };
  } catch { return { code: 'MISCONFIGURED' }; }
}
const cleanText = (value, max) => typeof value === 'string' ? value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').slice(0, max) : '';
async function jsonBody(response, signal, wait) {
  if (Number(response.headers.get('content-length')) > 262144) throw Error('size');
  const reader = response.body?.getReader(); if (!reader) throw Error('empty');
  const chunks = []; let length = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); }; signal.addEventListener('abort', cancel, { once: true });
  try {
    for (;;) { const { value, done } = await wait(reader.read()); signal.throwIfAborted(); if (done) break;
      length += value.length; if (length > 262144) throw Error('size'); chunks.push(value); }
    const bytes = new Uint8Array(length); let offset = 0; for (const c of chunks) { bytes.set(c, offset); offset += c.length; }
    return JSON.parse(new TextDecoder().decode(bytes));
  } finally { signal.removeEventListener('abort', cancel); cancel(); reader.releaseLock(); }
}
export async function resolveWithYtdlp(source, env, { deadline = Date.now()+55000, timeoutMs = 18000 } = {}) {
  const started = Date.now(), config = configuredYtdlp(env);
  const fail = code => ({ ok: false, code, message: ytMessage(code), elapsedMs: Date.now()-started });
  if (config.code) return fail(config.code);
  const controller = new AbortController(), timeout = Math.max(1, Math.min(timeoutMs, deadline-Date.now()));
  const timer = setTimeout(() => controller.abort(), timeout);
  const wait = promise => new Promise((resolve, reject) => {
    const aborted = () => { cleanup(); reject(Error('timeout')); }, cleanup = () => controller.signal.removeEventListener('abort', aborted);
    controller.signal.addEventListener('abort', aborted, { once: true });
    Promise.resolve(promise).then(v => { cleanup(); resolve(v); }, e => { cleanup(); reject(e); });
    if (controller.signal.aborted) aborted();
  });
  try {
    if (deadline <= Date.now()) return fail('TIMEOUT');
    const pending = fetch(config.url, { method: 'POST', redirect: 'manual', signal: controller.signal,
      headers: { authorization: 'Bearer '+env.YTDLP_SERVICE_TOKEN, 'content-type': 'application/json' }, body: JSON.stringify({ url: source }) });
    Promise.resolve(pending).then(r => { if (controller.signal.aborted) void r.body?.cancel().catch(() => {}); }, () => {});
    const response = await wait(pending);
    // Never forward the service bearer to a redirect target, even another HTTPS origin.
    if (response.status >= 300 && response.status < 400) { void response.body?.cancel().catch(() => {}); return fail('NETWORK_ERROR'); }
    if (response.status === 401 || response.status === 403) { void response.body?.cancel().catch(() => {}); return fail('UNAUTHORIZED'); }
    let data; try { data = await jsonBody(response, controller.signal, wait); }
    catch { return fail(controller.signal.aborted ? 'TIMEOUT' : 'INVALID_RESPONSE'); }
    if (!response.ok) return fail(Object.hasOwn(MESSAGES, data?.error) ? data.error : 'EXTRACT_FAILED');
    if (data?.version !== 1 || data.engine !== 'yt-dlp' || !Array.isArray(data.candidates) || data.candidates.length > 12) return fail('INVALID_RESPONSE');
    const candidates = data.candidates.filter(v => v && v.ext === 'mp4' && v.watermark === 'none' && v.watermarkEvidence === 'explicit-rednote-metadata')
      .map(v => ({ url: cleanText(v.url,8193), formatId: cleanText(v.formatId,120),
        width: Number.isSafeInteger(v.width)&&v.width>0?v.width:null, height: Number.isSafeInteger(v.height)&&v.height>0?v.height:null, codec: cleanText(v.codec,80) }));
    if (!candidates.length) return fail('UNVERIFIED');
    return { ok: true, engine: 'yt-dlp', elapsedMs: Date.now()-started, candidates,
      note: { id: /^[a-zA-Z0-9_-]{1,80}$/.test(data.note?.id||'')?data.note.id:'rednote',
        title: cleanText(data.note?.title,500)||'Video Rednote', caption: cleanText(data.note?.caption,16000), author: cleanText(data.note?.author,200), sourceUrl: source } };
  } catch { return fail(controller.signal.aborted ? 'TIMEOUT' : 'NETWORK_ERROR'); }
  finally { clearTimeout(timer); controller.abort(); }
}
