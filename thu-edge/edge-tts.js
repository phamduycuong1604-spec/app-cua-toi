// =====================================================
// GIỌNG ĐỌC "Đọc to" của trình duyệt Microsoft Edge (không chính thức)
// Mở WebSocket tới máy chủ đọc của Edge, gửi SSML, nhận về MP3.
// Microsoft có thể đổi/chặn bất cứ lúc nào → app tự chuyển giọng khác.
// =====================================================
const TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
export const PHIEN_BAN_EDGE = "143.0.3650.75"; // cập nhật khi Microsoft đổi
const WSS = "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";

async function maGec() {
  // số "tick" Windows (100ns từ 1601), làm tròn xuống 5 phút
  let giay = Math.floor(Date.now() / 1000) + 11644473600;
  giay -= giay % 300;
  const chu = (BigInt(giay) * 10000000n).toString() + TOKEN;
  const bam = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(chu));
  return [...new Uint8Array(bam)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

const maNgauNhien = () => crypto.randomUUID().replace(/-/g, "");
// Kiểu ngày giờ giống JavaScript của trình duyệt: "Mon Oct 05 2026 03:12:53 GMT+0000 (Coordinated Universal Time)"
const gioGmt = () => {
  const d = new Date(), h = (n) => String(n).padStart(2, "0");
  const thu = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
  const thang = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
  return `${thu} ${thang} ${h(d.getUTCDate())} ${d.getUTCFullYear()} ${h(d.getUTCHours())}:${h(d.getUTCMinutes())}:${h(d.getUTCSeconds())} GMT+0000 (Coordinated Universal Time)`;
};
const thoat = (s) => s.replace(/[<>&'"]/g, (k) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[k]);

export async function docEdge(chu, giong = "vi-VN-HoaiMyNeural", toc = "+0%") {
  const ten = /\(/.test(giong) ? giong : `Microsoft Server Speech Text to Speech Voice (${giong.replace(/^(\w+-\w+)-(.+)$/, "$1, $2")})`;
  const url = `${WSS}?TrustedClientToken=${TOKEN}&Sec-MS-GEC=${await maGec()}&Sec-MS-GEC-Version=1-${PHIEN_BAN_EDGE}&ConnectionId=${maNgauNhien()}`;
  const chinh = PHIEN_BAN_EDGE.split(".")[0];
  const tl = await fetch(url, {
    headers: {
      Upgrade: "websocket",
      Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
      "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chinh}.0.0.0 Safari/537.36 Edg/${chinh}.0.0.0`,
      Pragma: "no-cache",
      "Cache-Control": "no-cache",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br, zstd",
      Cookie: `muid=${maNgauNhien().toUpperCase()};`,
    },
  });
  const ws = tl.webSocket;
  if (!ws) throw new Error(`Edge từ chối kết nối (mã ${tl.status})`);
  ws.accept();
  return await new Promise((xong, hong) => {
    const manh = [], daNhan = [];
    const hen = setTimeout(() => { try { ws.close(); } catch {} hong(new Error("Edge trả lời quá lâu")); }, 30000);
    ws.addEventListener("message", (e) => {
      if (typeof e.data === "string") {
        daNhan.push(/Path:([\w.]+)/.exec(e.data)?.[1] || "?");
        if (e.data.includes("Path:turn.end")) {
          clearTimeout(hen);
          try { ws.close(); } catch {}
          const tong = manh.reduce((n, m) => n + m.length, 0);
          if (!tong) return hong(new Error("Edge không trả về âm thanh (nhận: " + daNhan.join(",") + ")"));
          const ra = new Uint8Array(tong);
          let o = 0;
          for (const m of manh) { ra.set(m, o); o += m.length; }
          xong(ra);
        }
        return;
      }
      const du = new Uint8Array(e.data instanceof ArrayBuffer ? e.data : e.data.buffer || e.data);
      daNhan.push("bin" + du.length);
      const daiDau = (du[0] << 8) | du[1];
      const dau = new TextDecoder().decode(du.subarray(2, 2 + daiDau));
      if (dau.includes("Path:audio")) manh.push(du.slice(2 + daiDau));
    });
    ws.addEventListener("close", (e) => { clearTimeout(hen); if (!manh.length) hong(new Error(`Edge đóng kết nối (mã ${e.code} ${e.reason || ""}; nhận: ${daNhan.join(",")})`)); });
    ws.addEventListener("error", () => { clearTimeout(hen); hong(new Error("Lỗi kết nối Edge")); });
    ws.send(`X-Timestamp:${gioGmt()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
      '{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n');
    ws.send(`X-RequestId:${maNgauNhien()}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${gioGmt()}Z\r\nPath:ssml\r\n\r\n` +
      `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='${ten}'><prosody pitch='+0Hz' rate='${toc}' volume='+0%'>${thoat(chu)}</prosody></voice></speak>`);
  });
}
