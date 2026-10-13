export const AUDIO_ARGS = input => ['-hide_banner','-y','-threads','1','-i',input,'-t','30','-map','0:a:0','-vn','-sn','-dn','-filter_threads','1','-ac','1','-ar','16000','-c:a','pcm_s16le','-f','s16le','/test.pcm'];
export function pcmInfo(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 3200 || bytes.length % 2) throw Error('PCM thiếu dữ liệu hoặc sai định dạng.');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let peak=0;
  for(let i=0;i<bytes.length;i+=2)peak=Math.max(peak,Math.abs(view.getInt16(i,true)));
  return {samples:bytes.length/2,seconds:bytes.length/32000,peak};
}
export function isMp4(bytes) { return bytes instanceof Uint8Array && bytes.length>=12 && String.fromCharCode(...bytes.subarray(4,8))==='ftyp'; }
export function parseProbe(code, output) {
  // Core 0.12.10 leaves ret at -1 on successful ffprobe. Require complete
  // structured metadata rather than mistaking that core quirk for failure.
  if(code!==0&&code!==-1)throw Error('Không đọc được thông tin MP4 (mã '+code+').');
  let p;try{p=JSON.parse(output);}catch{throw Error('FFprobe không trả thông tin video hợp lệ.');}
  if(!Array.isArray(p?.streams)||!p.streams.length||!(Number(p?.format?.duration)>0))throw Error('FFprobe thiếu luồng hoặc thời lượng.');
  return p;
}
// A deadline cancels only the current run. It never reports success for an
// operation that has timed out or been cancelled while resolving.
export async function bounded(operation, signal, ms, onTimeout=()=>{}) {
  signal.throwIfAborted();let timer,abort;
  const stopped=new Promise((_,reject)=>{
    abort=()=>reject(signal.reason||new DOMException('Đã dừng','AbortError'));
    signal.addEventListener('abort',abort,{once:true});
    timer=setTimeout(()=>{try{onTimeout();}finally{reject(Error('Quá thời gian chờ ('+Math.round(ms/1000)+' giây).'));}},ms);
  });
  try { const value=await Promise.race([Promise.resolve().then(()=>{signal.throwIfAborted();return operation();}),stopped]);signal.throwIfAborted();return value; }
  finally {clearTimeout(timer);signal.removeEventListener('abort',abort);}
}
