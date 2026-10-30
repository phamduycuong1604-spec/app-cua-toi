// Extract only known video containers. A field named origin/master_url/mediaV2 is
// a candidate location, never evidence that its pixels have no watermark.
const FLAG_NAMES = ['hasWatermark','has_watermark','watermark','waterMark'];
export function watermarkOf(node) {
  if (!node || typeof node !== 'object') return 'unknown';
  const flags = FLAG_NAMES.filter(k => Object.hasOwn(node, k)).map(k => node[k]);
  if (flags.some(v => v === true || v === 1 || v === '1' || v === 'true')) return 'present';
  return flags.length && flags.every(v => v === false || v === 0 || v === '0' || v === 'false') ? 'none' : 'unknown';
}
const effective = (node, inherited) => {
  if (!FLAG_NAMES.some(k => Object.hasOwn(node, k))) return inherited;
  const own = watermarkOf(node);
  return own === 'unknown' ? (inherited === 'present' ? 'present' : 'unknown') : combine([own, inherited]);
};
const combine = flags => flags.includes('present') ? 'present' : flags.includes('none') ? 'none' : 'unknown';
const codecName = value => {
  const c = String(value || '').replace(/[.\s_-]/g, '').toLowerCase();
  if (/^avc[13]/.test(c)) return 'h264'; if (/^(?:hvc1|hev1)/.test(c)) return 'h265';
  return { avc:'h264',h264:'h264',hevc:'h265',h265:'h265',av1:'av1' }[c] || 'unknown';
};
const list = value => Array.isArray(value) ? value : value == null ? [] : [value];
// Mobile share pages can serialize mediaV2 as JSON rather than an object.
// Decode only known containers, once; never evaluate page-supplied code.
function mediaContainer(value) {
  if (typeof value !== 'string') return value;
  if (value.length > 1_000_000) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch { return null; }
}
export function videoCandidates(video, validMedia) {
  video = video && typeof video === 'object' ? video : {};
  const originals = [], variants = [];
  const cleanUrl = value => {
    if (typeof value !== 'string') return null;
    try { return validMedia(value.replace(/^\/\//, 'https://').replace(/^http:/, 'https:')).href; } catch { return null; }
  };
  const add = (target, node, source, inherited = 'unknown', codec = 'unknown', direct) => {
    if (!node || typeof node !== 'object') node = {};
    const urls = [direct, node.masterUrl, node.master_url, node.url, ...list(node.backupUrls), ...list(node.backup_urls), ...list(node.urls)]
      .map(cleanUrl).filter((v, i, a) => v && a.indexOf(v) === i);
    if (!urls.length) return;
    const watermark = effective(node, inherited);
    target.push({ urls, source, watermark, codec: codecName(node.codec || node.videoCodec || node.video_codec || codec),
      width: Number(node.width) || 0, height: Number(node.height) || 0, bitrate: Number(node.avgBitrate || node.avg_bitrate || node.bitrate) || 0, size: Number(node.size) || null });
  };
  const consumer = video.consumer || {}, key = consumer.originVideoKey || consumer.origin_video_key;
  if (typeof key === 'string' && /^[a-zA-Z0-9/_-]+$/.test(key)) add(originals, consumer, 'consumer.originVideoKey', 'unknown', 'unknown', 'https://sns-video-bd.xhscdn.com/' + key);
  const directOrigin = (node, source) => {
    if (!node || typeof node !== 'object') return;
    for (const field of ['origin','original','originUrl','origin_url','originalUrl','original_url','originVideoUrl','origin_video_url']) {
      const value = node[field];
      if (typeof value === 'string') add(originals, {}, source + '.' + field, watermarkOf(node), 'unknown', value);
      else if (value && typeof value === 'object') add(originals, value, source + '.' + field, watermarkOf(node));
    }
  };
  directOrigin(video, 'video'); directOrigin(consumer, 'consumer');
  // A top-level master URL is the note's source; stream master URLs remain stream variants.
  if (video.masterUrl || video.master_url) add(originals, video, 'video.master_url');
  const seen = new WeakSet(); let visited = 0;
  const walk = (value, source, depth = 0, inherited = 'unknown', codec = 'unknown', isOriginal = false) => {
    value = mediaContainer(value);
    if (!value || typeof value !== 'object' || depth > 7 || visited++ > 256 || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) { for (const v of value.slice(0,64)) walk(v, source, depth + 1, inherited, codec, isOriginal); return; }
    const flags = effective(value, inherited);
    const original = isOriginal || value.isOriginal === true || value.is_original === true || /^(?:origin|original|source)$/i.test(String(value.quality || value.qualityType || ''));
    if (value.masterUrl || value.master_url || value.url || value.backupUrls || value.backup_urls) add(original ? originals : variants, value, source, inherited, codec);
    directOrigin(value, source);
    for (const field of ['media','mediaV2','media_v2','stream','streams','videos','videoList','video_list','video','h264','h265','avc','hevc','av1']) {
      if (value[field]) walk(value[field], source + '.' + field, depth + 1, flags, codecName(field) === 'unknown' ? codec : field, original);
    }
  };
  walk(video.media, 'media');
  for (const field of ['mediaV2','media_v2']) {
    const v = mediaContainer(video[field]);
    if (v && !Array.isArray(v) && (v.masterUrl || v.master_url || v.url)) add(originals, v, field);
    walk(v, field);
  }
  // An explicitly clean legacy video.url remains a source candidate. Size alone
  // cannot promote it from unknown to clean, including when it is <=400 MB.
  if (video.url) add(originals, video, 'video.url');
  const all = [...originals, ...variants];
  // Contradictory claims for the SAME exact URL always win over a clean flag.
  const marked = new Set(all.filter(v => v.watermark === 'present').flatMap(v => v.urls));
  for (const v of all) if (v.urls.some(u => marked.has(u))) v.watermark = 'present';
  // A matching stream flag may verify its original URL, never an unrelated original.
  const byUrl = new Map();
  for (const v of all) for (const u of v.urls) byUrl.set(u, combine([byUrl.get(u), v.watermark]));
  for (const v of all) v.watermark = combine([v.watermark, ...v.urls.map(u => byUrl.get(u) || 'unknown')]);
  const dedupe = items => {
    const result = [], keys = new Set();
    for (const v of items) {
      const key = v.urls.join('|'); if (keys.has(key)) continue; keys.add(key); result.push(v);
    }
    return result;
  };
  return { originals: dedupe(originals), variants: dedupe(variants).sort((a,b) => ((b.codec === 'h264') - (a.codec === 'h264')) || b.width*b.height - a.width*a.height || b.bitrate-a.bitrate) };
}
