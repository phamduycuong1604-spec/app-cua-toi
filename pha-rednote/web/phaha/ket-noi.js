// =====================================================
// NỐI VỚI MÁY CHỦ PHA REDNOTE: máy chủ của trang này nhận mã API của dịch vụ ở ô "X-Provider-Authorization"
// (ô "Authorization" để dành cho chính trang) → khi đi vòng qua /ai/chuyen thì chuyển mã sang ô đó.
// =====================================================
const fetchGoc = globalThis.fetch.bind(globalThis);
globalThis.fetch = (dau, tuyChon = {}) => {
  const url = new URL(dau instanceof Request ? dau.url : String(dau), location.href);
  if (url.origin === location.origin && url.pathname === "/ai/chuyen") {
    const headers = new Headers(tuyChon.headers);
    if (headers.has("Authorization")) {
      headers.set("X-Provider-Authorization", headers.get("Authorization"));
      headers.delete("Authorization");
    }
    headers.delete("X-Ve");
    return fetchGoc(dau, { ...tuyChon, headers });
  }
  return fetchGoc(dau, tuyChon);
};
