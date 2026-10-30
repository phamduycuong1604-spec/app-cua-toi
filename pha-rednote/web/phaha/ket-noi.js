// =====================================================
// NỐI VỚI MÁY CHỦ PHA REDNOTE: máy chủ của trang này nhận mã API của dịch vụ ở ô "X-Provider-Authorization"
// (ô "Authorization" để dành cho chính trang) → khi đi vòng qua /ai/chuyen thì chuyển mã sang ô đó.
// =====================================================
import {runSignal,assertRunning} from './nen.js';
const fetchGoc = globalThis.fetch.bind(globalThis);
let geminiQuaMayChu=0;
globalThis.fetch = async (dau, tuyChon = {}) => {
  const url = new URL(dau instanceof Request ? dau.url : String(dau), location.href);
  const service=url.origin!==location.origin||/^\/ai\//.test(url.pathname);
  if(service){
    assertRunning();const signal=runSignal(),given=tuyChon.signal||(dau instanceof Request?dau.signal:null);
    if(signal)tuyChon={...tuyChon,signal:given?AbortSignal.any([signal,given]):signal};
  }
  if(url.hostname==='generativelanguage.googleapis.com'){
    if(Date.now()>=geminiQuaMayChu)try{return await fetchGoc(dau,tuyChon);}catch(error){if(tuyChon.signal?.aborted||error.name==='AbortError')throw error;geminiQuaMayChu=Date.now()+30000;}
    const headers=new Headers(tuyChon.headers);headers.set('X-Dich-Den',url.href);headers.delete('X-Ve');
    return fetchGoc('/ai/chuyen',{...tuyChon,headers});
  }
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
