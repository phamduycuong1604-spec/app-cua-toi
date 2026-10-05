import { docEdge } from "./edge-tts.js";
export default {
  async fetch(req) {
    const u = new URL(req.url);
    try {
      const mp3 = await docEdge(u.searchParams.get("t") || "Xin chào, đây là giọng đọc thử của PhaHa.", u.searchParams.get("v") || "vi-VN-HoaiMyNeural");
      return new Response(mp3, { headers: { "Content-Type": "audio/mpeg" } });
    } catch (e) { return new Response("LOI: " + e.message, { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } }); }
  },
};
