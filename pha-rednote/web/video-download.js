// Large downloads stay in the origin's private disk storage, never in a chunks array.
(()=>{
 if(globalThis.PHAVideoDownload)return;
 const MEMORY_LIMIT=256*1048576,MAX_SIZE=2*1024*1048576,RANGE_SIZE=8*1048576,WRITE_SIZE=1048576,CONCURRENCY=6,STALL_MS=20000,HEADER_WAIT_MS=75000,leases=new WeakMap();// 6 luồng: mỗi luồng qua máy chủ tới CDN Rednote ở xa nên chậm, nhiều luồng cộng lại nhanh hơn.
 function failure(message){const e=new Error(message);e.permanent=true;return e;}
 const syncWorker=`let handle;onmessage=async({data:d})=>{try{if(d.op==='open'){const root=await navigator.storage.getDirectory();const dir=await root.getDirectoryHandle('pha-video-cache',{create:true});const file=await dir.getFileHandle(d.name,{create:true});handle=await file.createSyncAccessHandle();handle.truncate(0);}else if(d.op==='write'){const b=new Uint8Array(d.bytes);let n=0;while(n<b.length){const count=handle.write(b.subarray(n),{at:d.at+n});if(!count)throw Error('Không ghi được video');n+=count;}}else if(d.op==='truncate')handle.truncate(d.size);else if(d.op==='close'){handle.flush();handle.close();handle=null;}postMessage({id:d.id});}catch(e){postMessage({id:d.id,error:e.message,name:e.name});}};`;
 async function writerFor(handle,name){
  // Luôn đưa đúng số byte cần ghi: có trình duyệt ghi cả vùng đệm phía sau một đoạn cắt, làm file dài thừa.
  const exact=b=>b.byteOffset===0&&b.byteLength===b.buffer.byteLength?b:b.slice();
  if(handle.createWritable){const w=await handle.createWritable();return {kind:'writable',write:(bytes,at)=>w.write({type:'write',position:at,data:exact(bytes)}),truncate:size=>w.truncate(size),close:()=>w.close(),abort:()=>w.abort()};}
  if(!globalThis.Worker)throw failure('Trình duyệt chưa hỗ trợ lưu video lớn trong app. Hãy mở app bằng Safari đã cập nhật.');
  const url=URL.createObjectURL(new Blob([syncWorker],{type:'text/javascript'})),worker=new Worker(url),waiters=new Map();let next=0;
  function rejectAll(e){for(const p of waiters.values()){clearTimeout(p.timer);p.reject(e)}waiters.clear();}
  worker.onmessage=({data:d})=>{const p=waiters.get(d.id);if(!p)return;clearTimeout(p.timer);waiters.delete(d.id);if(d.error){const e=failure(d.error);e.name=d.name||'Error';p.reject(e)}else p.resolve();};
  worker.onerror=()=>rejectAll(failure('Không mở được bộ lưu video của trình duyệt.'));
  function send(op,data={},transfer=[]){return new Promise((resolve,reject)=>{const id=++next,timer=setTimeout(()=>{waiters.delete(id);reject(failure('Bộ lưu video không phản hồi.'));},30000);waiters.set(id,{resolve,reject,timer});worker.postMessage({id,op,...data},transfer);});}
  function stop(){rejectAll(failure('Đã đóng bộ lưu video.'));worker.terminate();URL.revokeObjectURL(url);}
  try{await send('open',{name});}catch(e){stop();throw e;}
  return {kind:'worker',write(bytes,at){const copy=bytes.slice();return send('write',{bytes:copy.buffer,at},[copy.buffer]);},truncate:size=>send('truncate',{size}),async close(){try{await send('close')}finally{stop()}},async abort(){try{await send('close')}catch{}finally{stop()}}};
 }
 // Đọc lại file đã lưu. Ngay sau khi đóng, có lúc trình duyệt còn báo kích thước cũ → mở lại và đọc thêm vài lần.
 async function savedFile(dir,name,handle,expected){
  let file;
  for(let i=0;i<6;i++){
   if(i)await new Promise(r=>setTimeout(r,150*i));
   file=await(i?await dir.getFileHandle(name):handle).getFile();
   if(file.size===expected)return file;
  }
  return file;
 }
 async function release(file){const lease=file&&leases.get(file);if(!lease)return;leases.delete(file);try{await lease.dir.removeEntry(lease.name)}catch{}}
 // Open a fresh OPFS snapshot for each bounded media read. Safari may invalidate an
 // earlier snapshot under memory pressure even though the stored file still exists.
 async function openFile(file){
  const lease=file&&leases.get(file);if(!lease)return file;
  const stored=await(await lease.dir.getFileHandle(lease.name)).getFile();
  if(stored.size<file.size)throw failure('File video trong app bị thiếu: '+stored.size+' / '+file.size+' byte.');
  return stored.size===file.size?stored:stored.slice(0,file.size);
 }
 function mediaSource(mb,file,{signal,onRetry=()=>{}}={}){
  if(!mb.CustomSource)return new mb.BlobSource(file,{useStreamReader:false,maxCacheSize:4*1048576});
  let disposed=false;
  const assertRead=()=>{signal?.throwIfAborted();if(disposed)throw new DOMException('Đã đóng nguồn video.','AbortError');};
  return new mb.CustomSource({getSize:()=>file.size,maxCacheSize:4*1048576,prefetchProfile:'fileSystem',dispose(){disposed=true;},
   read(start,end){let position=start,snapshot;
    return new ReadableStream({async pull(controller){
     try{
      assertRead();if(position>=end){controller.close();return;}
      const until=Math.min(end,position+256*1024);let bytes;
      for(let attempt=0;attempt<3;attempt++){
       try{snapshot??=await openFile(file);assertRead();bytes=new Uint8Array(await snapshot.slice(position,until).arrayBuffer());assertRead();if(bytes.length!==until-position)throw failure('Đọc video chưa đủ byte: '+bytes.length+' / '+(until-position)+'.');break;}
       catch(e){assertRead();if(attempt===2||!['NotFoundError','NotReadableError','UnknownError'].includes(e.name))throw e;snapshot=null;onRetry({name:e.name,start:position,end:until,attempt:attempt+1});}
      }
      position=until;controller.enqueue(bytes);
     }catch(e){controller.error(e);}
    },cancel(){snapshot=null;position=end;}});
   }
  });
 }
 // Dọn video còn sót từ những lần mở app trước (đóng tab, tải lại trang, Safari văng).
 // Chỉ xóa file tạo TRƯỚC lúc mở trang này; bỏ qua nếu app đang mở ở tab khác.
 const PAGE_START=Date.now();
 async function sweep(){
  if(!navigator.storage?.getDirectory)return 0;
  const root=await navigator.storage.getDirectory(),dir=await root.getDirectoryHandle('pha-video-cache',{create:true});
  if(typeof dir.keys!=='function')return 0;
  const old=[];for await(const name of dir.keys()){const m=/^video-(\d+)-/.exec(name);if(m&&Number(m[1])<PAGE_START)old.push(name);}
  let removed=0;for(const name of old){try{await dir.removeEntry(name);removed++;}catch{}}
  return removed;
 }
 function cleanup(){
  const locks=navigator.locks;
  if(!locks?.request)return sweep();
  // Tab nào đang mở app sẽ giữ khóa "dùng chung"; tab mới chỉ dọn khi không tab nào khác giữ khóa.
  return locks.request('pha-video-cache',{mode:'exclusive',ifAvailable:true},lock=>lock?sweep():0)
   .finally(()=>{locks.request('pha-video-cache',{mode:'shared'},()=>new Promise(()=>{})).catch(()=>{});});
 }
 const cleaned=cleanup().catch(()=>0);
 // Trình duyệt có cho ghi video xuống bộ nhớ app không? Có → mọi video (kể cả dưới 256 MB) ghi thẳng xuống đó, không giữ trong RAM.
 // Không (vd. chế độ riêng tư) → app quay về cách nhận cũ, tối đa 256 MB.
 let diskCheck=null;
 function canUseDisk(){
  diskCheck??=(async()=>{
   try{
    if(!navigator.storage?.getDirectory)return false;
    if(!globalThis.Worker&&!globalThis.FileSystemFileHandle?.prototype?.createWritable)return false;
    const root=await navigator.storage.getDirectory();await root.getDirectoryHandle('pha-video-cache',{create:true});
    return true;
   }catch{return false}
  })();
  return diskCheck;
 }
 // iPhone tự khóa màn hình thì Safari tạm dừng trang và việc tải đứng lại → xin giữ màn hình sáng trong lúc tải (trình duyệt không cho thì bỏ qua).
 async function holdScreen(){try{return await navigator.wakeLock?.request('screen')||null}catch{return null}}
 async function attachment(data,{signal,onProgress=()=>{},fetch:request=globalThis.fetch.bind(globalThis),concurrency=CONCURRENCY,stallMs=STALL_MS,headerWaitMs=HEADER_WAIT_MS}={}){
  const url=new URL(data.downloadUrl,location.origin);
  if(url.origin!==location.origin||url.pathname!=='/api/download')throw failure('Đường tải video không hợp lệ.');
  const total=Number(data.size);if(!Number.isSafeInteger(total)||total<=0||total>MAX_SIZE)throw failure('Video vượt giới hạn hai GB cho xử lý trên điện thoại.');
  if(!navigator.storage?.getDirectory)throw failure('Safari chưa cho lưu video lớn trong app. Hãy mở bằng Safari ngoài chế độ riêng tư.');
  await cleaned;// Dọn xong file cũ rồi mới đo dung lượng còn trống.
  const estimate=await navigator.storage.estimate?.().catch(()=>null);
  if(estimate?.quota&&estimate.quota-(estimate.usage||0)<total+16*1048576)throw failure('Bộ nhớ lưu trữ của app không đủ. Hãy giải phóng dung lượng rồi thử lại.');
  signal?.throwIfAborted();
  const root=await navigator.storage.getDirectory(),dir=await root.getDirectoryHandle('pha-video-cache',{create:true}),name='video-'+Date.now()+'-'+crypto.randomUUID()+'.mp4';
  const handle=await dir.getFileHandle(name,{create:true});let writer,type='video/mp4',complete=false;
  const stop=new AbortController(),activeSignal=signal?AbortSignal.any([signal,stop.signal]):stop.signal;
  const counts=new Float64Array(Math.ceil(total/RANGE_SIZE));let received=0,lastProgress=0,rangeMode,next=1,writeTail=Promise.resolve(),lanes=[],retries=0,storageRetries=0;
  const started=Date.now();
  const limit=Math.max(1,Math.min(CONCURRENCY,Math.floor(Number(concurrency))||CONCURRENCY));
  let resolveMode,rejectMode;const mode=new Promise((resolve,reject)=>{resolveMode=resolve;rejectMode=reject});
  function progress(force=false){const now=Date.now();if(force||now-lastProgress>=250){lastProgress=now;const elapsedSeconds=(now-started)/1000;onProgress(received,total,{concurrency:rangeMode===false?1:limit,elapsedSeconds,bytesPerSecond:elapsedSeconds>0?received/elapsedSeconds:0,retries,storageRetries})}}
  function reset(index){received-=counts[index];counts[index]=0;progress(true)}
  async function write(bytes,at,index){
   // One queued bounded buffer per lane; disk writes finish before that buffer is reused.
   const job=writeTail.then(async()=>{
    for(let attempt=0;attempt<3;attempt++){
     activeSignal.throwIfAborted();
     try{return await writer.write(bytes,at)}catch(e){
      activeSignal.throwIfAborted();
      if(e.name!=='UnknownError'||attempt===2){const detail=new Error(e.message+' (ghi video tại '+at+' byte · cách ghi: '+(writer.kind||'?')+').',{cause:e});detail.name=e.name;throw detail;}
      storageRetries++;progress(true);await new Promise(r=>setTimeout(r,150*(attempt+1)));
     }
    }
   });
   writeTail=job.catch(()=>{});
   try{await job}catch(e){if(!activeSignal.aborted)e.permanent=true;throw e}
   counts[index]+=bytes.length;received+=bytes.length;progress();
  }
  async function range(index){
   const start=index*RANGE_SIZE,end=Math.min(total-1,start+RANGE_SIZE-1);let last,stalls=0;
   for(let attempt=0;attempt<3;attempt++){
    activeSignal.throwIfAborted();let reader,cancel,idle;
    // Đứng hình: không nhận thêm byte nào trong stallMs → bỏ lượt này và tải lại riêng phần này ngay, thay vì chờ tới 90 giây.
    const watch=new AbortController(),arm=ms=>{clearTimeout(idle);idle=setTimeout(()=>watch.abort(Object.assign(new Error('Phần video đứng hình, đang tải lại.'),{name:'TimeoutError'})),ms)};
    try{
     arm(headerWaitMs);
     const response=await request(url.href,{headers:{range:'bytes='+start+'-'+end},signal:AbortSignal.any([activeSignal,watch.signal])});
     arm(stallMs);
     if(!response.ok){await response.body?.cancel();throw Error('Nguồn video trả lỗi '+response.status+'.');}
     const match=response.headers.get('content-range')?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
     const whole=response.status===200&&index===0&&!match;
     if(!whole&&(!match||+match[1]!==start||+match[2]!==end||+match[3]!==total)){await response.body?.cancel();throw failure('Nguồn trả sai phần video hoặc file đã thay đổi. Hãy lấy lại link.');}
     // Start other lanes as soon as the first response confirms byte-range support.
     if(index===0){if(rangeMode===true&&whole){await response.body?.cancel();throw failure('Nguồn ngừng hỗ trợ tải từng phần. Hãy lấy lại link.')}rangeMode=!whole;resolveMode(rangeMode);}
     const expected=whole?total:end+1;let position=start,first=new Uint8Array(),buffer=new Uint8Array(WRITE_SIZE),used=0;
     reader=response.body.getReader();cancel=()=>{reader.cancel().catch(()=>{})};activeSignal.addEventListener('abort',cancel,{once:true});
     while(true){activeSignal.throwIfAborted();const {done,value}=await reader.read();activeSignal.throwIfAborted();if(done)break;arm(stallMs);
      if(position+used+value.length>expected)throw failure('Nguồn trả video vượt số byte yêu cầu.');
      if(index===0&&first.length<12){const joined=new Uint8Array(Math.min(12,first.length+value.length));joined.set(first);joined.set(value.subarray(0,12-first.length),first.length);first=joined;if(first.length===12){if(String.fromCharCode(...first.slice(4,8))==='ftyp')type='video/mp4';else if(first[0]===26&&first[1]===69&&first[2]===223&&first[3]===163)type='video/webm';else throw failure('Nguồn trả về trang web, không phải video.');}}
      let offset=0;while(offset<value.length){const n=Math.min(WRITE_SIZE-used,value.length-offset);buffer.set(value.subarray(offset,offset+n),used);used+=n;offset+=n;if(used===WRITE_SIZE){await write(buffer,position,index);position+=used;used=0;arm(stallMs)}}
     }
     if(used){await write(buffer.subarray(0,used),position,index);position+=used}
     if(position!==expected||index===0&&first.length<12)throw Error('Video tải chưa đủ; đang tải lại phần bị thiếu.');
     return whole;
    }catch(e){last=e;activeSignal.throwIfAborted();if(e.permanent||e.name==='QuotaExceededError')throw e;
     if(watch.signal.aborted&&stalls<3){stalls++;attempt--;}// Đứng hình không tính vào 3 lần thử do lỗi.
     retries++;
     // Retry overwrites this range only. Truncation would destroy other lanes' completed bytes.
     reset(index);
    }finally{clearTimeout(idle);activeSignal.removeEventListener('abort',cancel);try{await reader?.cancel()}catch{}reader?.releaseLock();}
   }
   throw last;
  }
  async function lane(first=false){try{if(first&&await range(0))return;while(next<counts.length){activeSignal.throwIfAborted();await range(next++)}}catch(e){rejectMode(e);stop.abort(e);throw e}}
  // Giữ màn hình sáng trong lúc tải; mở lại app thì xin lại.
  let screen=await holdScreen();const relock=()=>{if(globalThis.document?.visibilityState==='visible'&&(!screen||screen.released))holdScreen().then(l=>{screen=l})};globalThis.document?.addEventListener?.('visibilitychange',relock);
  try{
   writer=await writerFor(handle,name);progress(true);
   lanes.push(lane(true));
   // Attach rejection handlers immediately, then drain every lane before closing or deleting disk storage.
   const firstDone=Promise.allSettled(lanes);
   try{if(await mode)for(let i=1;i<Math.min(limit,counts.length);i++)lanes.push(lane())}catch(e){await firstDone;throw e}
   const results=await Promise.allSettled(lanes),failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;
   activeSignal.throwIfAborted();if(received!==total)throw failure('Video tải chưa đủ các phần.');progress(true);
   const kind=writer.kind||'?';await writer.close();writer=null;signal?.throwIfAborted();
   let stored=await savedFile(dir,name,handle,total);
   if(stored.size<total)throw failure('Video lưu chưa đủ dung lượng (đã lưu '+stored.size+' / '+total+' byte · cách ghi: '+kind+'). Hãy thử lại hoặc tải video gốc về Tệp.');
   // Mọi byte đã nhận đủ; phần dư sau cuối là rác do trình duyệt ghi thừa → cắt bỏ.
   const trimmed=stored.size-total;if(trimmed)stored=stored.slice(0,total);
   const title=String(data.title||'PHA-Rednote').replace(/[\x00-\x1f/\\:*?"<>|]/g,' ').trim().slice(0,100);
   const file=new File([stored],title+(type==='video/webm'?'.webm':'.mp4'),{type});file.phaStorage={kind,trimmed};leases.set(file,{dir,name});complete=true;return file;
  }catch(e){if(e.name==='QuotaExceededError')throw failure('Bộ nhớ lưu video của app đã đầy. Hãy giải phóng dung lượng rồi thử lại.');throw e;}finally{globalThis.document?.removeEventListener?.('visibilitychange',relock);screen?.release?.()?.catch?.(()=>{});if(writer)await writer.abort().catch(()=>{});if(!complete)await dir.removeEntry(name).catch(()=>{});}
 }
 async function outputFile(title='PHA-1080p.mp4'){
  if(!navigator.storage?.getDirectory)throw failure('Safari chưa hỗ trợ lưu video 1080p trong app.');
  await cleaned;
  const root=await navigator.storage.getDirectory(),dir=await root.getDirectoryHandle('pha-video-cache',{create:true}),name='video-'+Date.now()+'-'+crypto.randomUUID()+'.mp4';
  const handle=await dir.getFileHandle(name,{create:true});let writer,closed=false,max=0;
  try{writer=await writerFor(handle,name)}catch(e){await dir.removeEntry(name).catch(()=>{});throw e}
  return {
   async write(bytes,at){if(closed)throw failure('Bộ lưu video đã đóng.');if(at+bytes.length>MAX_SIZE)throw failure('Video 1080p vượt hai GB.');await writer.write(bytes,at);max=Math.max(max,at+bytes.length)},
   async finish(){const kind=writer.kind||'?';await writer.close();closed=true;let stored=await savedFile(dir,name,handle,max);if(!max||stored.size<max)throw failure('Video 1080p chưa lưu đủ (đã lưu '+stored.size+' / '+max+' byte · cách ghi: '+kind+').');if(stored.size>max)stored=stored.slice(0,max);const file=new File([stored],title,{type:'video/mp4'});leases.set(file,{dir,name});return file;},
   async abort(){if(!closed){await writer.abort().catch(()=>{});closed=true}await dir.removeEntry(name).catch(()=>{});}
  };
 }
 globalThis.PHAVideoDownload={attachment,release,openFile,mediaSource,outputFile,cleaned,canUseDisk,MEMORY_LIMIT,MAX_SIZE,CONCURRENCY};
})();
