// Chạy module thật trong Chromium; giả lập Gemini để không tốn lượt/key thật.
// PLAYWRIGHT=/path/to/playwright/index.mjs CHROMIUM=/usr/bin/chromium node giong-khoa-test.mjs
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { chromium } = await import(process.env.PLAYWRIGHT || '/opt/node-tools/node_modules/playwright/index.mjs');
const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html');
    return res.end('<pre id="o-nhat-ky"></pre><li data-buoc="long"><em></em></li>');
  }
  const file = path.join(root, req.url.split('?')[0]);
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', 'text/javascript');
  fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}), args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const result = await page.evaluate(async () => {
    const { caiDat, S, vanTayMa, ngayMy } = await import('/dich-video/nen.js');
    const { longTieng, docCau, DICH_VU } = await import('/dich-video/giong-doc.js');
    const { quenLuotDoc } = await import('/dich-video/doc-gemini.js');
    const model = 'gemini-3.8-flash-tts';
    const calls = [], fallback = [];
    for (const dv of Object.keys(DICH_VU).filter(dv => dv !== 'gemini')) {
      DICH_VU[dv].doc = async () => { fallback.push(dv); throw new Error('Unexpected fallback: ' + dv); };
    }
    let handle;
    globalThis.fetch = async (url, options) => {
      const body = JSON.parse(options.body);
      const call = {
        model: /models\/([^:]+)/.exec(url)[1], key: options.headers['x-goog-api-key'],
        voice: body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName,
        text: body.contents[0].parts[0].text,
      };
      calls.push(call);
      return handle(call);
    };
    const ok = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: {
      data: btoa(String.fromCharCode(...new Uint8Array(new Int16Array(2400).fill(8000).buffer))), mimeType: 'audio/L16;rate=24000',
    } }] } }] }), { status: 200 });
    const quota = () => new Response(JSON.stringify({ error: { message: 'Quota per day exhausted', details: [{ violations: [{ quotaId: 'GenerateRequestsPerDay' }] }] } }), { status: 429 });
    const missing = () => new Response(JSON.stringify({ error: { message: 'model not found' } }), { status: 404 });
    const pause = async () => { try { await longTieng(); return null; } catch (e) { return { message: e.message, giuGiong: e.giuGiong }; } };
    function setup() {
      calls.length = fallback.length = 0;
      localStorage.removeItem('phaha-dv-tts');
      caiDat.khoa = 'A'; caiDat.khoaDoc = 'A B'; caiDat.giong = 'Kore'; caiDat.mhDoc = '';
      for (const dv of Object.keys(caiDat.bat)) caiDat.bat[dv] = dv === 'gemini';
      S.tepVideo = new File(['video'], 'test.mp4'); S.thoiLuong = 24;
      S.cacCau = ['Gói một', 'Gói hai', 'Gói ba', 'Gói bốn'].map((vi, i) => ({ vi, start: i * 5, end: i * 5 + 1 }));
    }
    const checks = [];
    const check = (ok, name) => { if (!ok) throw new Error(name + ': ' + JSON.stringify({ calls, fallback })); checks.push(name); };
    setup();
    handle = c => {
      if (c.text === 'Gói một') { caiDat.giong = 'Puck'; caiDat.mhDoc = 'other-model'; return ok(); }
      return c.key === 'A' ? quota() : ok();
    };
    await longTieng();
    check(calls.every(c => c.model === model && c.voice === 'Kore') && calls.some(c => c.key === 'B'), 'Đổi key giữ model + giọng, kể cả khi đổi cài đặt giữa chừng');
    check(!fallback.length, 'Không gọi dịch vụ dự phòng sau thành công');

    setup();
    handle = c => c.text === 'Gói một' ? ok() : quota();
    const stopped = await pause();
    check(stopped?.giuGiong && stopped.message.includes(model) && stopped.message.includes('Kore') && !fallback.length && calls.every(c => c.model === model), 'Hết mọi key: tạm dừng, báo đúng model/giọng, không đổi model hay Giọng máy');
    const before = calls.length;
    caiDat.khoaDoc = 'A B C'; caiDat.giong = 'Puck'; caiDat.mhDoc = 'other-model'; caiDat.bat.gemini = false;
    // Nghe thử giọng khác không được làm mất khóa/audio video.
    handle = () => ok();
    await docCau('Nghe thử', 'gemini');
    const resumedAt = calls.length;
    handle = c => c.key === 'C' ? ok() : quota();
    const wav = await longTieng();
    const resumed = calls.slice(resumedAt);
    check(wav.length > 44 && calls.length > before && resumed.every(c => c.text !== 'Gói một' && c.model === model && c.voice === 'Kore') && resumed.some(c => c.key === 'C'), 'Làm lại sau thêm key: bỏ gói đã xong, giữ khóa dù đổi cài đặt/tắt Gemini/nghe thử');
    const completed = calls.length;
    await longTieng();
    check(calls.length === completed, 'Làm lại khi đã đủ audio: không gọi API');

    setup();
    let success = false;
    handle = c => {
      if (c.model === model) return missing();
      if (!success) { success = true; return ok(); }
      return quota();
    };
    const stopped2 = await pause();
    check(stopped2?.giuGiong && calls.filter(c => c.text !== 'Gói một').every(c => c.model === 'gemini-3.1-flash-tts-preview'), 'Được chọn model khác trước thành công đầu tiên; sau đó khóa');

    setup();
    handle = c => c.text === 'Gói một' ? ok() : quota();
    await pause();
    // Giả lập key trả phí để có các gói đang bay khi một gói thất bại.
    const state = JSON.parse(localStorage.getItem('phaha-dv-tts'));
    state.cap = {}; state.traPhi = { [vanTayMa('A')]: true }; state.ngay = ngayMy();
    localStorage.setItem('phaha-dv-tts', JSON.stringify(state));
    let delayedDone = false;
    handle = async c => {
      if (c.text === 'Gói hai') return quota();
      await new Promise(r => setTimeout(r, 100)); delayedDone = true; return ok();
    };
    await pause();
    check(delayedDone, 'Tạm dừng đợi các gói đang đọc lưu audio xong');
    quenLuotDoc();
    const retryAt = calls.length;
    handle = () => ok();
    await longTieng();
    check(calls.slice(retryAt).every(c => c.text === 'Gói hai'), 'Giữ cả audio hoàn thành muộn, chỉ gọi lại gói thất bại');

    setup();
    handle = () => ok();
    caiDat.mhDoc = 'new-video-model'; caiDat.giong = 'Puck';
    await longTieng();
    check(calls.every(c => c.model === 'new-video-model' && c.voice === 'Puck'), 'Video mới có khóa riêng');
    return checks;
  });
  assert.equal(result.length, 9);
  result.forEach(name => console.log('PASS', name));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
