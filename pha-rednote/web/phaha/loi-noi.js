// Non-speech captions are not narration. Keep real dialogue and technical
// parentheticals; recognize only bounded, known sound/music labels.
const nhac = /^(?:(?:nhạc|âm nhạc)(?:\s+(?:mở đầu|dạo đầu|nền|dạo|không lời|kết thúc|nhẹ nhàng|sôi động|vui nhộn|vang lên))*|(?:intro|opening|background|outro|instrumental|soft)\s+music|music(?:\s+playing)?|音乐|音樂|背景音乐|背景音樂|片头音乐|片頭音樂|片尾音乐|片尾音樂|轻音乐|輕音樂)$/iu;
const amThanh = /^(?:tiếng\s+(?:vỗ tay|cười|động|ồn|chuông|gió|mưa)|im lặng|không có lời(?: nói)?|applause|laughter|laughing|silence|no speech|sound effects?|sfx|鼓掌|笑声|笑聲|掌声|掌聲|无对白|無對白|无语音|無語音)$/iu;
function laNhan(text, wrapped = false) {
  const label = text.normalize('NFC').trim().replace(/^[\s♪♫*#"'“”‘’]+|[\s♪♫*#"'“”‘’.!,:;…]+$/gu, '').trim();
  return nhac.test(label) || wrapped && amThanh.test(label);
}
export function boChuThichAmThanh(value) {
  const text = String(value ?? '').normalize('NFC');
  const result = text
    .replace(/\[([^\[\]\n]{1,120})\]|\(([^()\n]{1,120})\)|【([^【】\n]{1,120})】|（([^（）\n]{1,120})）/gu,
      (all, a, b, c, d) => laNhan(a ?? b ?? c ?? d, true) ? ' ' : all)
    .split(/\r?\n/).filter(line => !laNhan(line)).join('\n')
    .replace(/[♪♫]+/gu, ' ').trim();
  return /[\p{L}\p{N}]/u.test(result) ? result : '';
}
