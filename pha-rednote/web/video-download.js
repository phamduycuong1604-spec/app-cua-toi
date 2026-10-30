// Large downloads stay in the origin's private disk storage, never in a chunks array.
(()=>{
 if(globalThis.PHAVideoDownload)return;
 const ua=globalThis.navigator?.userAgent||'',ios=/iPad|iPhone|iPod/.test(ua)||/Macintosh/.test(ua)&&globalThis.navigator?.maxTouchPoints>1;
 const MEMORY_LIMIT=256*1048576,MAX_SIZE=2*1024*1048576,RANGE_SIZE=8*1048576,WRITE_SIZE=1048576,CONCURRENCY=!ios&&/Windows|Macintosh|X11|Linux/.test(ua)?6:4,STALL_MS=35000,HEADER_WAIT_MS=60000,MAX_RETRIES=3,leases=new WeakMap();// Chế độ tự động bắt đầu 4, thử tối đa 6 luồng khi nhanh hơn; giảm còn 2 khi lỗi. Bộ đệm ghi 1 MB/luồng; tối đa 3 lần thử lại từ byte đã lưu.
 function failure(message){const e=new Error(message);e.permanent=true;return e;}
 const syncWorker=`let handle;onmessage=async({data:d})=>{try{if(d.op==='open'){const root=await navigator.storage.getDirectory();const dir=await root.getDirectoryHandle('pha-video-cache',{create:true});const file=await dir.getFileHandle(d.name,{create:true});handle=await file.createSyncAccessHandle();handle.truncate(0);}else if(d.op==='write'){const b=new Uint8Array(d.bytes);let n=0;while(n<b.length){const count=handle.write(b.subarray(n),{at:d.at+n});if(!count)throw Error('Không ghi được video');n+=count;}}else if(d.op==='read'){const b=new Uint8Array(d.size);const n=handle.read(b,{at:d.at});if(n!==b.length)throw Error('Đọc video đang tải chưa đủ byte');postMessage({id:d.id,bytes:b.buffer},[b.buffer]);return;}else if(d.op==='truncate')handle.truncate(d.size);else if(d.op==='close'){handle.flush();handle.close();handle=null;}postMessage({id:d.id});}catch(e){postMessage({id:d.id,error:e.message,name:e.name});}};`;
 async function writerFor(handle,name,{readable=false}={}){
  // Luôn đưa đúng số byte cần ghi: có trình duyệt ghi cả vùng đệm phía sau một đoạn cắt, làm file dài thừa.
  const exact=b=>b.byteOffset===0&&b.byteLength===b.buffer.byteLength?b:b.slice();
  if(handle.createWritable&&!readable){const w=await handle.createWritable();return {kind:'writable',write:(bytes,at)=>w.write({type:'write',position:at,data:exact(bytes)}),truncate:size=>w.truncate(size),close:()=>w.close(),abort:()=>w.abort()};}
  if(globalThis.PHA_STORAGE_WORKER&&handle.createSyncAccessHandle){
   const w=await handle.createSyncAccessHandle();w.truncate(0);let closed=false;
   const close=()=>{if(!closed){closed=true;w.close()}};
   return {kind:'sync',async write(bytes,at){let n=0;while(n<bytes.length){const count=w.write(bytes.subarray(n),{at:at+n});if(!count)throw failure('Không ghi được video');n+=count}},truncate:async size=>w.truncate(size),async close(){try{w.flush()}finally{close()}},async abort(){close()}};
  }
  if(!globalThis.Worker)throw failure('Trình duyệt chưa hỗ trợ lưu video lớn trong app. Hãy mở app bằng Safari đã cập nhật.');
  const url=URL.createObjectURL(new Blob([syncWorker],{type:'text/javascript'})),worker=new Worker(url),waiters=new Map();let next=0;
  function rejectAll(e){for(const p of waiters.values()){clearTimeout(p.timer);p.reject(e)}waiters.clear();}
  worker.onmessage=({data:d})=>{const p=waiters.get(d.id);if(!p)return;clearTimeout(p.timer);waiters.delete(d.id);if(d.error){const e=failure(d.error);e.name=d.name||'Error';p.reject(e)}else p.resolve(d.bytes?new Uint8Array(d.bytes):undefined);};
  worker.onerror=()=>rejectAll(failure('Không mở được bộ lưu video của trình duyệt.'));
  function send(op,data={},transfer=[]){return new Promise((resolve,reject)=>{const id=++next,timer=setTimeout(()=>{waiters.delete(id);reject(failure('Bộ lưu video không phản hồi.'));},30000);waiters.set(id,{resolve,reject,timer});worker.postMessage({id,op,...data},transfer);});}
  function stop(){rejectAll(failure('Đã đóng bộ lưu video.'));worker.terminate();URL.revokeObjectURL(url);}
  try{await send('open',{name});}catch(e){stop();throw e;}
  return {kind:'worker',read:(at,size)=>send('read',{at,size}),write(bytes,at){const copy=bytes.slice();return send('write',{bytes:copy.buffer,at},[copy.buffer]);},truncate:size=>send('truncate',{size}),async close(){try{await send('close')}finally{stop()}},async abort(){try{await send('close')}catch{}finally{stop()}}};
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
 // Pass only an OPFS reference between rendering workers and the page, not a
 // copy of the entire video. A worker must never sweep the page's active files.
 function reference(file){const lease=file&&leases.get(file);return lease?{cacheName:lease.name,title:file.name,type:file.type,size:file.size}:null;}
 function validReference(ref){if(!ref||!/^video-\d+-[a-zA-Z0-9-]+\.mp4$/.test(ref.cacheName))throw failure('Tham chiếu video trong app không hợp lệ.');}
 async function restore(ref){
  validReference(ref);if(!Number.isSafeInteger(ref.size)||ref.size<=0||ref.size>MAX_SIZE)throw failure('Dung lượng tham chiếu video không hợp lệ.');
  const root=await navigator.storage.getDirectory(),dir=await root.getDirectoryHandle('pha-video-cache'),handle=await dir.getFileHandle(ref.cacheName),stored=await handle.getFile();
  if(stored.size<ref.size)throw failure('Video trong app thiếu '+(ref.size-stored.size)+' byte.');
  const file=new File([stored.slice(0,ref.size)],String(ref.title||'PHA-video.mp4'),{type:ref.type||'video/mp4'});leases.set(file,{dir,name:ref.cacheName});return file;
 }
 async function discard(ref){validReference(ref);try{const root=await navigator.storage.getDirectory(),dir=await root.getDirectoryHandle('pha-video-cache');await dir.removeEntry(ref.cacheName)}catch{}}
 // Open a fresh OPFS snapshot for each bounded media read. Safari may invalidate an
 // earlier snapshot under memory pressure even though the stored file still exists.
 async function openFile(file){
  const lease=file&&leases.get(file);if(!lease)return file;
  const stored=await(await lease.dir.getFileHandle(lease.name)).getFile();
  if(stored.size<file.size)throw failure('File video trong app bị thiếu: '+stored.size+' / '+file.size+' byte.');
  return stored.size===file.size?stored:stored.slice(0,file.size);
 }
 function mediaSource(mb,file,{signal,onRetry=()=>{},onRead=()=>{}}={}){
  if(!mb.CustomSource)return new mb.BlobSource(file,{useStreamReader:false,maxCacheSize:4*1048576});
  let disposed=false;
  const assertRead=()=>{signal?.throwIfAborted();if(disposed)throw new DOMException('Đã đóng nguồn video.','AbortError');};
  return new mb.CustomSource({getSize:()=>file.size,maxCacheSize:4*1048576,prefetchProfile:'fileSystem',dispose(){disposed=true;},
   read(start,end){let position=start,snapshot;
    return new ReadableStream({async pull(controller){
     try{
      assertRead();if(position>=end){controller.close();return;}
      const until=Math.min(end,position+256*1024);let bytes;onRead({event:'begin',start:position,end:until});
      for(let attempt=0;attempt<3;attempt++){
       try{snapshot??=await openFile(file);assertRead();bytes=new Uint8Array(await snapshot.slice(position,until).arrayBuffer());assertRead();if(bytes.length!==until-position)throw failure('Đọc video chưa đủ byte: '+bytes.length+' / '+(until-position)+'.');break;}
       catch(e){assertRead();if(attempt===2||!['NotFoundError','NotReadableError','UnknownError'].includes(e.name))throw e;snapshot=null;onRetry({name:e.name,start:position,end:until,attempt:attempt+1});}
      }
      onRead({event:'end',start:position,end:until,bytes:bytes.length});position=until;controller.enqueue(bytes);
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
 const cleaned=globalThis.PHA_STORAGE_WORKER?Promise.resolve(0):cleanup().catch(()=>0);
 // Trình duyệt có cho ghi video xuống bộ nhớ app không? Có → mọi video (kể cả dưới 256 MB) ghi thẳng xuống đó, không giữ trong RAM.
 // Không (vd. chế độ riêng tư) → app quay về cách nhận cũ, tối đa 256 MB.
 let diskCheck=null;
 function canUseDisk(){
  diskCheck??=(async()=>{
   try{
    if(!navigator.storage?.getDirectory)return false;
    if(!globalThis.Worker&&!globalThis.FileSystemFileHandle?.prototype?.createWritable&&!(globalThis.PHA_STORAGE_WORKER&&globalThis.FileSystemFileHandle?.prototype?.createSyncAccessHandle))return false;
    const root=await navigator.storage.getDirectory();await root.getDirectoryHandle('pha-video-cache',{create:true});
    return true;
   }catch{return false}
  })();
  return diskCheck;
 }
 const downloadListeners=new Set();
 function onDownload(listener){downloadListeners.add(listener);return ()=>downloadListeners.delete(listener);}
 // Read only bytes already written. Consumers can prioritize an upcoming range,
 // but never start a second CDN download or keep whole video chunks in memory.
 // iPhone tự khóa màn hình thì Safari tạm dừng trang và việc tải đứng lại → xin giữ màn hình sáng trong lúc tải (trình duyệt không cho thì bỏ qua).
 async function holdScreen(){try{return await navigator.wakeLock?.request('screen')||null}catch{return null}}
 async function attachment(data,{signal,onProgress=()=>{},onRetry=()=>{},onTune=()=>{},fetch:request=globalThis.fetch.bind(globalThis),concurrency,stallMs=STALL_MS,headerWaitMs=HEADER_WAIT_MS,tuningMs=6000,tailWaitMs=8000}={}){
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
  const counts=new Float64Array(Math.ceil(total/RANGE_SIZE));let received=0,lastProgress=0,rangeMode,next=1,writeTail=Promise.resolve(),retries=0,storageRetries=0;
  const running=new Set(),waitingRanges=new Map(),tailRetried=new Set();let firstError,tuneTimer,completedRanges=0;
  const representation={etag:null,lastModified:null};
  const pendingReads=new Set(),priority=[],claimed=new Set([0]);let closing=false,finishedFile;
  let resolveFile,rejectFile;const fileReady=new Promise((resolve,reject)=>{resolveFile=resolve;rejectFile=reject});fileReady.catch(()=>{});
  const wake=()=>{for(const fn of [...pendingReads])fn()};activeSignal.addEventListener('abort',wake);
  const session={data,signal:activeSignal,done:fileReady,cancel:reason=>stop.abort(reason),
   async read(start,end,{signal:consumerSignal}={}){
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<=start||end>total||end-start>256*1024)throw failure('Phần đọc âm thanh không hợp lệ.');
    const check=()=>{activeSignal.throwIfAborted();consumerSignal?.throwIfAborted()};check();
    const first=Math.floor(start/RANGE_SIZE),last=Math.floor((end-1)/RANGE_SIZE);
    for(let i=first;i<=last;i++)if(!claimed.has(i)&&!priority.includes(i))priority.push(i);
    const available=()=>{for(let i=first;i<=last;i++)if(counts[i]<Math.min(end,(i+1)*RANGE_SIZE)-i*RANGE_SIZE)return false;return true;};
    if(!available())await new Promise((resolve,reject)=>{
     let timer;const cleanup=()=>{pendingReads.delete(tick);clearTimeout(timer);consumerSignal?.removeEventListener('abort',tick)};
     const tick=()=>{try{check();if(available()){cleanup();resolve()}}catch(e){cleanup();reject(e)}};
     pendingReads.add(tick);consumerSignal?.addEventListener('abort',tick,{once:true});timer=setTimeout(()=>{cleanup();reject(new DOMException('Đọc âm thanh đang tải chờ quá lâu.','TimeoutError'))},60000);tick();
    });
    check();
    if(!closing&&writer?.read)return writer.read(start,end-start);
    const file=finishedFile||await fileReady;check();return new Uint8Array(await(await openFile(file)).slice(start,end).arrayBuffer());
   }};
  const started=Date.now();
  // Explicit concurrency remains available for callers/tests. Automatic mode
  // starts at four on every device and measures useful bytes committed to disk.
  const automatic=concurrency===undefined;
  const limit=automatic?6:Math.max(1,Math.min(CONCURRENCY,Math.floor(Number(concurrency))||CONCURRENCY));
  let target=automatic?4:limit,tunePhase='baseline',sampleAt=started,sampleBytes=0,sampleRetries=0,baselineRate=0,currentRate=0;
  const sampleMs=Math.max(250,tuningMs);
  let resolveMode,rejectMode;const mode=new Promise((resolve,reject)=>{resolveMode=resolve;rejectMode=reject});
  function progress(force=false){const now=Date.now();if(force||now-lastProgress>=250){lastProgress=now;const elapsedSeconds=(now-started)/1000;onProgress(received,total,{concurrency:rangeMode===false?1:Math.min(target,running.size||1),targetConcurrency:target,automatic,elapsedSeconds,bytesPerSecond:elapsedSeconds>0?received/elapsedSeconds:0,currentBytesPerSecond:currentRate,retries,storageRetries})}}
  function tune(to,reason){const from=target;target=to;onTune({from,to,reason,bytesPerSecond:currentRate,baselineBytesPerSecond:baselineRate});progress(true)}
  const hasWork=()=>claimed.size<counts.length;
  function startLane(first=false){
   let job;job=lane(first).catch(e=>{firstError??=e;rejectMode(e);stop.abort(e)}).finally(()=>running.delete(job));running.add(job);
  }
  function fillLanes(){while(!activeSignal.aborted&&hasWork()&&running.size<target)startLane()}
  function monitor(){
   if(activeSignal.aborted||!running.size)return;
   const now=Date.now(),elapsed=now-sampleAt;
   if(automatic&&rangeMode&&elapsed>=sampleMs){
    currentRate=Math.max(0,received-sampleBytes)*1000/elapsed;
    // Retire excess lanes only between ranges; never throw away healthy data.
    if(retries>sampleRetries){if(target>2)tune(Math.max(2,target-2),'Có lỗi tải; giảm luồng để ổn định');tunePhase='settled';}
    else if(tunePhase==='baseline'&&target===4&&currentRate>0&&counts.length-claimed.size>=6){baselineRate=currentRate;tunePhase='trial';tune(6,'Thử 6 luồng và đo tốc độ thực tế');}
    else if(tunePhase==='trial'&&hasWork()){
     tunePhase='settled';if(currentRate>=baselineRate*1.1)tune(6,'Giữ 6 luồng: tốc độ tăng ít nhất 10%');else tune(4,'Trở về 4 luồng: thêm luồng không nhanh hơn đủ');
    }
    sampleAt=now;sampleBytes=received;sampleRetries=retries;fillLanes();
   }
   // Once other parts have finished, retry a stalled tail early, at most once
   // per range and within its existing three-retry budget. No duplicate writer.
   if(rangeMode&&!hasWork()&&completedRanges>0&&running.size<target){
    for(const [index,state] of waitingRanges)if(state.waitingSince&&now-state.waitingSince>=tailWaitMs&&!tailRetried.has(index)&&!state.watch.signal.aborted){
     tailRetried.add(index);state.watch.abort(Object.assign(new Error('Phần cuối bị đứng trong khi các luồng khác đã xong; tải tiếp từ byte đã lưu.'),{name:'TimeoutError'}));
    }
   }
   tuneTimer=setTimeout(monitor,Math.min(1000,sampleMs));
  }
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
   counts[index]+=bytes.length;received+=bytes.length;progress();wake();
  }
  async function range(index){
   const base=index*RANGE_SIZE,end=Math.min(total-1,base+RANGE_SIZE-1);let last;
   // One shared retry budget: initial request + at most three retries, including stalls.
   for(let attempt=0;attempt<=MAX_RETRIES;attempt++){
    activeSignal.throwIfAborted();if(counts[index]===end-base+1)return false;
    if(rangeMode===false&&counts[index])reset(index);
    const start=base+counts[index];let reader,cancel,idle,phase='header';
    const watch=new AbortController(),combined=AbortSignal.any([activeSignal,watch.signal]);
    const waiting={watch,waitingSince:Date.now()};waitingRanges.set(index,waiting);
    const arm=ms=>{clearTimeout(idle);idle=setTimeout(()=>watch.abort(Object.assign(new Error(phase==='header'?'Nguồn chưa trả phản hồi đầu sau '+Math.round((phase==='header'?headerWaitMs:stallMs)/1000)+' giây.':'Không nhận thêm dữ liệu sau '+Math.round((phase==='header'?headerWaitMs:stallMs)/1000)+' giây.'),{name:'TimeoutError'})),ms)};
    // Abort even when a browser/polyfill fails to reject a pending fetch or body read.
    const wait=p=>new Promise((resolve,reject)=>{
     const aborted=()=>{cleanup();reject(combined.reason)},cleanup=()=>combined.removeEventListener('abort',aborted);
     combined.addEventListener('abort',aborted,{once:true});
     Promise.resolve(p).then(v=>{cleanup();resolve(v)},e=>{cleanup();reject(e)});
     if(combined.aborted)aborted();
    });
    try{
     arm(headerWaitMs);
     const pending=request(url.href,{headers:{range:'bytes='+start+'-'+end},signal:combined});
     Promise.resolve(pending).then(r=>{if(combined.aborted)void r.body?.cancel().catch(()=>{})},()=>{});
     const response=await wait(pending);combined.throwIfAborted();clearTimeout(idle);phase='body';waiting.waitingSince=0;
     if(!response.ok){void response.body?.cancel().catch(()=>{});throw Error('Nguồn video trả lỗi '+response.status+'.');}
     for(const [key,header] of [['etag','etag'],['lastModified','last-modified']]){
      const value=response.headers.get(header);if(!value)continue;
      if(representation[key]&&representation[key]!==value){void response.body?.cancel().catch(()=>{});throw failure('Nguồn video đã thay đổi giữa các phần tải. Hãy lấy lại link để tránh ghép sai file.');}
      representation[key]=value;
     }
     const match=response.headers.get('content-range')?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
     const whole=response.status===200&&index===0&&start===0&&!match;
     if(!whole&&(!match||+match[1]!==start||+match[2]!==end||+match[3]!==total)){void response.body?.cancel().catch(()=>{});throw failure('Nguồn trả sai phần video hoặc file đã thay đổi. Hãy lấy lại link.');}
     if(index===0){if(rangeMode===true&&whole){void response.body?.cancel().catch(()=>{});throw failure('Nguồn ngừng hỗ trợ tải từng phần. Hãy lấy lại link.')}rangeMode=!whole;resolveMode(rangeMode);}
     const expected=whole?total:end+1;let position=start,first=new Uint8Array(),buffer=new Uint8Array(WRITE_SIZE),used=0;
     let lastDataAt=Date.now();reader=response.body.getReader();cancel=()=>{void reader.cancel().catch(()=>{})};combined.addEventListener('abort',cancel,{once:true});
     while(true){
      combined.throwIfAborted();waiting.waitingSince=lastDataAt;arm(Math.max(1,stallMs-(Date.now()-lastDataAt)));const {done,value}=await wait(reader.read());combined.throwIfAborted();clearTimeout(idle);waiting.waitingSince=0;if(done)break;if(!value?.length)continue;
      if(position+used+value.length>expected)throw failure('Nguồn trả video vượt số byte yêu cầu.');
      if(index===0&&start===0&&first.length<12){const joined=new Uint8Array(Math.min(12,first.length+value.length));joined.set(first);joined.set(value.subarray(0,12-first.length),first.length);first=joined;if(first.length===12){if(String.fromCharCode(...first.slice(4,8))==='ftyp')type='video/mp4';else if(first[0]===26&&first[1]===69&&first[2]===223&&first[3]===163)type='video/webm';else throw failure('Nguồn trả về trang web, không phải video.');}}
      // The network stall clock is paused during OPFS writes; storage has its own failure handling.
      let offset=0;while(offset<value.length){const n=Math.min(WRITE_SIZE-used,value.length-offset);buffer.set(value.subarray(offset,offset+n),used);used+=n;offset+=n;if(used===WRITE_SIZE){await write(buffer,position,index);position+=used;used=0;}}lastDataAt=Date.now();
     }
     // Never persist an incomplete MP4 signature: a retry must validate it again.
     if(index===0&&start===0&&first.length<12)throw Error('Video tải chưa đủ dữ liệu đầu; đang tải lại.');
     if(used){await write(buffer.subarray(0,used),position,index);position+=used}
     if(position!==expected||index===0&&start===0&&first.length<12)throw Error('Video tải chưa đủ; đang tải lại phần bị thiếu.');
     return whole;
    }catch(e){
     last=watch.signal.aborted?watch.signal.reason:e;activeSignal.throwIfAborted();
     if(e.permanent||e.name==='QuotaExceededError')throw e;
     if(attempt===MAX_RETRIES)break;
     retries++;if(rangeMode===false)reset(index);
     onRetry({index,start:base,end,resumeFrom:base+counts[index],resumedBytes:counts[index],retry:attempt+1,maxRetries:MAX_RETRIES,phase,reason:last.message,name:last.name});
    }finally{waitingRanges.delete(index);clearTimeout(idle);combined.removeEventListener('abort',cancel);if(!watch.signal.aborted)watch.abort();try{void reader?.cancel().catch(()=>{})}catch{}try{reader?.releaseLock()}catch{}}
   }
   const detail=new Error('Tải phần byte '+base+'–'+end+' thất bại sau '+(MAX_RETRIES+1)+' lượt: '+(last?.message||'lỗi mạng'),{cause:last});detail.name=last?.name||'Error';throw detail;
  }
  async function lane(first=false){if(first){if(await range(0))return;completedRanges++}while(true){activeSignal.throwIfAborted();if(running.size>target)return;let index;while(priority.length&&index===undefined){const n=priority.shift();if(!claimed.has(n))index=n;}while(index===undefined&&next<counts.length){const n=next++;if(!claimed.has(n))index=n;}if(index===undefined)return;claimed.add(index);await range(index);completedRanges++}}
  // Giữ màn hình sáng trong lúc tải; mở lại app thì xin lại.
  let screen=await holdScreen();const relock=()=>{if(globalThis.document?.visibilityState==='visible'&&(!screen||screen.released))holdScreen().then(l=>{screen=l})};globalThis.document?.addEventListener?.('visibilitychange',relock);
  try{
   const readable=downloadListeners.size>0&&!!globalThis.Worker;
   try{writer=await writerFor(handle,name,{readable})}catch(error){if(!readable)throw error;session.streamingReason='Trình duyệt không mở được bộ đọc khi đang ghi ('+(error.name||'Error')+').';writer=await writerFor(handle,name)}progress(true);
   startLane(true);
   // Attach rejection handlers immediately, then drain every lane before closing or deleting disk storage.
   const firstDone=Promise.allSettled([...running]);
   try{const ranges=await mode;if(ranges){fillLanes();sampleAt=Date.now();sampleBytes=received;tuneTimer=setTimeout(monitor,Math.min(1000,sampleMs));}session.streaming=!!(ranges&&writer.read);if(!ranges)session.streamingReason='Nguồn video không hỗ trợ đọc từng phần.';else if(!writer.read&&!session.streamingReason)session.streamingReason='Trình duyệt chưa hỗ trợ đọc video trước khi ghi xong.';for(const listener of downloadListeners){try{listener(session)}catch{}}}catch(e){await firstDone;throw e}
   while(running.size){await Promise.race([...running]);if(rangeMode)fillLanes()}if(firstError)throw firstError;
   activeSignal.throwIfAborted();if(received!==total)throw failure('Video tải chưa đủ các phần.');progress(true);
   const kind=writer.kind||'?';closing=true;await writer.close();writer=null;signal?.throwIfAborted();
   let stored=await savedFile(dir,name,handle,total);
   if(stored.size<total)throw failure('Video lưu chưa đủ dung lượng (đã lưu '+stored.size+' / '+total+' byte · cách ghi: '+kind+'). Hãy thử lại hoặc tải video gốc về Tệp.');
   // Mọi byte đã nhận đủ; phần dư sau cuối là rác do trình duyệt ghi thừa → cắt bỏ.
   const trimmed=stored.size-total;if(trimmed)stored=stored.slice(0,total);
   const title=String(data.title||'PHA-Rednote').replace(/[\x00-\x1f/\\:*?"<>|]/g,' ').trim().slice(0,100);
   const file=new File([stored],title+(type==='video/webm'?'.webm':'.mp4'),{type});file.phaStorage={kind,trimmed};leases.set(file,{dir,name});complete=true;finishedFile=file;resolveFile(file);wake();return file;
  }catch(e){rejectFile(e);if(!activeSignal.aborted)stop.abort(e);await Promise.allSettled([...running]);if(e.name==='QuotaExceededError')throw failure('Bộ nhớ lưu video của app đã đầy. Hãy giải phóng dung lượng rồi thử lại.');throw e;}finally{clearTimeout(tuneTimer);activeSignal.removeEventListener('abort',wake);wake();globalThis.document?.removeEventListener?.('visibilitychange',relock);screen?.release?.()?.catch?.(()=>{});if(writer)await writer.abort().catch(()=>{});if(!complete)await dir.removeEntry(name).catch(()=>{});}
 }
 async function outputFile(title='PHA-1080p.mp4'){
  if(!navigator.storage?.getDirectory)throw failure('Safari chưa hỗ trợ lưu video 1080p trong app.');
  await cleaned;
  const root=await navigator.storage.getDirectory(),dir=await root.getDirectoryHandle('pha-video-cache',{create:true}),name='video-'+Date.now()+'-'+crypto.randomUUID()+'.mp4';
  const handle=await dir.getFileHandle(name,{create:true});let writer,closed=false,max=0;
  try{writer=await writerFor(handle,name)}catch(e){await dir.removeEntry(name).catch(()=>{});throw e}
  return {
   reference:{cacheName:name,title,type:'video/mp4'},
   async write(bytes,at){if(closed)throw failure('Bộ lưu video đã đóng.');if(at+bytes.length>MAX_SIZE)throw failure('Video 1080p vượt hai GB.');await writer.write(bytes,at);max=Math.max(max,at+bytes.length)},
   async finish(){const kind=writer.kind||'?';await writer.close();closed=true;let stored=await savedFile(dir,name,handle,max);if(!max||stored.size<max)throw failure('Video 1080p chưa lưu đủ (đã lưu '+stored.size+' / '+max+' byte · cách ghi: '+kind+').');if(stored.size>max)stored=stored.slice(0,max);const file=new File([stored],title,{type:'video/mp4'});leases.set(file,{dir,name});return file;},
   async abort(){if(!closed){await writer.abort().catch(()=>{});closed=true}await dir.removeEntry(name).catch(()=>{});}
  };
 }
 globalThis.PHAVideoDownload={attachment,onDownload,release,reference,restore,discard,openFile,mediaSource,outputFile,cleaned,canUseDisk,MEMORY_LIMIT,MAX_SIZE,CONCURRENCY,HEADER_WAIT_MS,STALL_MS,MAX_RETRIES};
})();
