// Gemini Free Tier: one global queue, quota per key/project + model, bounded retries.
export const TTS_MODELS = ['gemini-3.8-flash-tts', 'gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts'];
export function retrySeconds(error, response, now = Date.now()) {
  const duration = value => [...String(value || '').matchAll(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)/gi)]
    .reduce((n, m) => n + Number(m[1]) * (/^h/i.test(m[2]) ? 3600 : /^m/i.test(m[2]) ? 60 : 1), 0);
  const header = response?.headers?.get('retry-after');
  if (header !== null && header !== undefined) {
    const seconds = Number(header), date = Date.parse(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds);
    if (Number.isFinite(date)) return Math.max(0, (date - now) / 1000);
  }
  const details = error?.error?.details || [], delay = details.find(d => d.retryDelay)?.retryDelay;
  if (delay) return duration(delay);
  return duration(/(?:retry|try again)\s+(?:in|after)\s+((?:\d+(?:\.\d+)?\s*(?:hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\s*)+)/i.exec(error?.error?.message || '')?.[1]);
}
export function createTtsScheduler({keys, models = () => TTS_MODELS, fetch: send, read = () => ({}), write = () => {},
  now = () => Date.now(), day, fingerprint, wait, signal = () => null, log = () => {}, usage = () => {}, api}) {
  const saved = read();
  const state = {pairs: saved?.pairs || {}, projects: saved?.projects || {}};
  let preferred = null, queue = Promise.resolve(), rejected = new Set();
  const save = () => { try { write(state); } catch {} };
  const scope = key => state.projects[fingerprint(key)] || fingerprint(key);
  const pair = (key, model) => {
    const id = scope(key) + ':' + model;
    let p = state.pairs[id];
    if (!p || p.day !== day()) p = state.pairs[id] = {day: day(), used: 0, limit: 10, exhausted: false, blockedUntil: 0};
    return p;
  };
  const left = p => p.exhausted ? 0 : Math.max(0, (p.limit || 10) - (p.used || 0));
  const listKeys = () => [...new Set(keys().filter(Boolean))];
  const listModels = () => [...new Set(models().filter(m => /^[\w.-]+tts[\w.-]*$/.test(m)))];
  const check = active => active?.throwIfAborted();
  function bindProject(key, body) {
    const detail = (body?.error?.details || []).find(d => /^projects\/[\w-]+$/.test(d.metadata?.consumer || d.metadata?.project || ''));
    const project = detail?.metadata?.consumer || detail?.metadata?.project;
    if (!project || state.projects[fingerprint(key)] === project) return;
    const old = scope(key); state.projects[fingerprint(key)] = project;
    for (const model of listModels()) {
      const from = state.pairs[old + ':' + model], target = pair(key, model);
      if (from?.day === day()) {
        target.used = Math.max(target.used, from.used || 0); target.exhausted ||= from.exhausted;
        target.blockedUntil = Math.max(target.blockedUntil || 0, from.blockedUntil || 0);
      }
    }
    save();
  }
  const modelRemaining=model=>{
    const seen=new Set();let total=0;
    for(const key of listKeys()){const project=scope(key);if(!seen.has(project)){seen.add(project);total+=left(pair(key,model));}}
    return total;
  };
  const candidates = () => listModels().map((model, order) => ({model, order,left:modelRemaining(model)}))
    .sort((a, b) => Number(b.model === preferred) - Number(a.model === preferred) || b.left - a.left || a.order - b.order);
  async function perform(payload, active) {
    check(active);
    const began = now(), seen = new Set(); let waited = 0, lastError;
    for (const {model} of candidates()) {
      for (const key of listKeys().sort((a, b) => left(pair(b, model)) - left(pair(a, model)))) {
        check(active);
        const keyIndex = listKeys().indexOf(key) + 1, label = `GEMINI-TTS · ${model} · mã ${keyIndex}`;
        let p = pair(key, model);
        if (rejected.has(fingerprint(key)) || !left(p) || (p.missingUntil || 0) > now()) continue;
        const id = scope(key) + ':' + model;
        if (seen.has(id)) continue;
        seen.add(id);
        let shortRetry = false;
        for (;;) {
          check(active);
          const cooling = Math.max(0, ((p.blockedUntil || 0) - now()) / 1000);
          if (cooling > 15 || waited + Math.ceil(cooling) > 15) break;
          if (cooling > 0) { log(`${label} · chờ ${Math.ceil(cooling)}s, giữ audio đã xong`); await wait(Math.ceil(cooling)); waited += Math.ceil(cooling); check(active); }
          const remaining = 90000 - (now() - began);
          if (remaining <= 0) throw Object.assign(Error('Gemini TTS đã hết thời gian thử cho gói này.'), {code: 'TTS_TEMPORARY'});
          const controller = new AbortController(), timeout = Math.min(60000, remaining);
          const timer = setTimeout(() => controller.abort(new DOMException('Gemini TTS quá thời gian.', 'TimeoutError')), timeout);
          let response, body;
          try {
            log(`${label} · gửi tuần tự · còn khoảng ${left(p)} lượt/ngày (ước tính)`);
            const interaction = model.startsWith('gemini-3.8-');
            const text = payload.contents?.[0]?.parts?.[0]?.text || '';
            const data = interaction ? {model, input: [{type: 'user_input', content: [{type: 'text', text, annotations: [{type: 'speech_metadata', style: 'Natural, clear Vietnamese narration'}]}]}], response_format: {type: 'audio'}, generation_config: {speech_config: [{voice: payload.generationConfig?.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName || 'Kore'}]}, store: false} : payload;
            response = await send(interaction ? `${api}/interactions` : `${api}/models/${model}:generateContent`, {
              method: 'POST', headers: {'Content-Type': 'application/json', 'x-goog-api-key': key}, body: JSON.stringify(data),
              signal: active ? AbortSignal.any([active, controller.signal]) : controller.signal,
            });
            body = await response.json();
            check(active);
            if (response.ok) {
              p.used++; save(); usage(key, model);
              if (interaction) { const audio = (body.steps || []).flatMap(s => s.type === 'model_output' ? s.content || [] : []).filter(c => c.type === 'audio').at(-1); body = {candidates: [{content: {parts: audio ? [{inlineData: {data: audio.data, mimeType: audio.mime_type || audio.mimeType || 'audio/wav'}}] : []}}]}; }
              if (!body?.candidates?.some(c => c.content?.parts?.some(part => part.inlineData?.data))) {
                p.blockedUntil = now() + 60000; save(); log(`${label} · không có audio, thử cặp khác`); break;
              }
              preferred = model; body.moHinh = model;
              log(`${label} · xong ${(now() - began) / 1000}s · giữ audio, ưu tiên model này cho gói sau`);
              return body;
            }
          } catch (error) {
            check(active);
            lastError = error;
            p.blockedUntil = now() + 60000; save();
            log(`${label} · ${controller.signal.aborted ? 'quá 60s' : 'lỗi kết nối/đọc phản hồi'} · thử cặp khác, giữ audio đã xong`);
            break;
          } finally { clearTimeout(timer); }
          bindProject(key, body); p = pair(key, model);
          const text = String(body?.error?.message || ''), details = JSON.stringify(body?.error?.details || []);
          const seconds = retrySeconds(body, response, now());
          const hasDelay=response.headers.has('retry-after')||(body?.error?.details||[]).some(d=>d.retryDelay)||/(?:retry|try again)\s+(?:in|after)\s+\d/i.test(text);
          lastError = Object.assign(Error(`Gemini TTS báo HTTP ${response.status}.`), {status: response.status});
          if (/location is not supported/i.test(text)) throw Object.assign(Error('Google chặn Gemini theo vị trí mạng. Mã có thể vẫn đúng.'), {status: response.status, viTri: true});
          if (response.status === 429) {
            if (/requestsperday|per[ _-]?day|daily/i.test(text + details)) {
              const reported=(body?.error?.details||[]).flatMap(d=>d.violations||[]).find(v=>/requestsperday|per[ _-]?day/i.test(v.quotaId||v.quotaMetric||''));
              if(Number(reported?.quotaValue)>0)p.limit=Number(reported.quotaValue);
              p.exhausted = true; save(); log(`${label} · hết lượt ngày của key/project + model, bỏ qua đến ngày mai`); break;
            }
            p.blockedUntil = now() + (hasDelay?seconds:60) * 1000; save();
            if (hasDelay && seconds <= 15 && !shortRetry && waited + Math.ceil(seconds) <= 15) {
              shortRetry = true; log(`${label} · HTTP 429, Google yêu cầu ${Math.ceil(seconds)}s → thử lại cùng mã một lần`); continue;
            }
            log(`${label} · HTTP 429, khóa tạm ${Math.ceil(hasDelay?seconds:60)}s → đổi mã/model, không chờ dài`); break;
          }
          if ([401, 403].includes(response.status) || response.status === 400 && /API_KEY_INVALID|API key (?:not valid|expired)/i.test(text + details)) {
            rejected.add(fingerprint(key)); lastError.reason = 'key-rejected'; log(`${label} · mã bị từ chối → thử mã khác`); break;
          }
          if (response.status === 404) {
            p.missingUntil = now() + 86400000; save(); log(`${label} · model không có/quyền chưa cho phép → thử model tiếp`); break;
          }
          if (response.status >= 500) { p.blockedUntil = now() + 60000; save(); log(`${label} · HTTP ${response.status}, dịch vụ quá tải → thử cặp khác`); break; }
          throw lastError;
        }
      }
    }
    const allDay = listKeys().length && listModels().every(model => listKeys().every(key => !left(pair(key, model))));
    if (allDay) throw Object.assign(Error('Mọi cặp key/project + model Gemini TTS đã hết lượt ngày. Chuyển giọng kế tiếp cho các gói chưa có audio.'), {code: 'TTS_DAY_EXHAUSTED', hetLuot: true});
    throw Object.assign(lastError || Error('Gemini TTS đang khóa tạm hoặc không có model dùng được.'), {code: 'TTS_TEMPORARY'});
  }
  return {
    request(payload) { const active = signal(); const job = queue.catch(() => {}).then(() => perform(payload, active)); queue = job.catch(() => {}); return job; },
    reset() { preferred = null; rejected = new Set(); },
    prefer(model) { if (model) preferred = model; },
    snapshot(key, model) { return {...pair(key, model), remaining: left(pair(key, model))}; },
    remaining() { const seen = new Set(); let total = 0; for (const key of listKeys()) for (const model of listModels()) { const id = scope(key) + ':' + model; if (!seen.has(id)) { seen.add(id); total += left(pair(key, model)); } } return total; },
  };
}
