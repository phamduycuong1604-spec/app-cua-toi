// Decode only audio, reading the same bounded disk ranges as the video download.
// No second CDN request, full-video ArrayBuffer or second video copy.
const MB='https://cdn.jsdelivr.net/npm/mediabunny@1.61.1/dist/bundles/mediabunny.min.mjs';
export async function readDownloadAudio(session,{signal,onInfo=()=>{},onSegment,segmentSeconds=90,sampleRate=16000,load=()=>import(MB)}={}){
 const local=new AbortController(),activeSignal=signal?AbortSignal.any([signal,session.signal,local.signal]):AbortSignal.any([session.signal,local.signal]);
 const check=()=>activeSignal.throwIfAborted();check();
 if(typeof onSegment!=='function')throw Error('Chưa có bộ nghe âm thanh.');
 const mb=await load();check();let disposed=false,input,iterator;
 const source=new mb.CustomSource({getSize:()=>session.data.size,maxCacheSize:2*1048576,prefetchProfile:'fileSystem',
  read(start,end){let at=start;return new ReadableStream({async pull(c){try{check();if(disposed)throw new DOMException('Đã đóng âm thanh.','AbortError');if(at>=end){c.close();return;}const to=Math.min(end,at+256*1024),bytes=await session.read(at,to,{signal:activeSignal});check();at=to;c.enqueue(bytes)}catch(e){c.error(e)}}})},dispose(){disposed=true}});
 input=new mb.Input({source,formats:mb.ALL_FORMATS});
 const abort=()=>input.dispose();signal?.addEventListener('abort',abort,{once:true});session.signal.addEventListener('abort',abort,{once:true});
 try{
  const [audio,video]=await Promise.all([input.getPrimaryAudioTrack(),input.getPrimaryVideoTrack()]);check();
  if(!audio)throw Error('Video không có tiếng.');
  const [duration,audioDuration]=await Promise.all([video?video.computeDuration():audio.computeDuration(),audio.computeDuration()]);
  if(!(duration>0&&Number.isFinite(duration))||!(audioDuration>0&&Number.isFinite(audioDuration)))throw Error('Không đọc được thời lượng âm thanh.');
  onInfo({duration,audioDuration,width:video?.displayWidth||0,height:video?.displayHeight||0});
  const block=Math.round(segmentSeconds*sampleRate),total=Math.ceil(Math.min(duration,audioDuration)*sampleRate);
  if(!Number.isSafeInteger(block)||block<=0)throw Error('Độ dài đoạn âm thanh không hợp lệ.');
  let offset=0,buffer=new Int16Array(Math.min(block,total)),decodedEnd=0;
  const emit=async()=>{if(!buffer.length)return;check();await onSegment(buffer,offset/sampleRate);check();offset+=buffer.length;buffer=new Int16Array(Math.min(block,total-offset));};
  iterator=new mb.AudioSampleSink(audio).samples()[Symbol.asyncIterator]();
  while(true){check();const next=await iterator.next();check();if(next.done)break;const sample=next.value;
   try{
    const planes=Array.from({length:sample.numberOfChannels},(_,i)=>{const p=new Float32Array(sample.numberOfFrames);sample.copyTo(p,{format:'f32-planar',planeIndex:i});return p});
    const start=Math.max(offset,0,Math.ceil(sample.timestamp*sampleRate-1e-7)),end=Math.min(total,Math.ceil((sample.timestamp+sample.numberOfFrames/sample.sampleRate)*sampleRate-1e-7));
    for(let frame=Math.max(offset,start);frame<end;frame++){
     while(buffer.length&&frame>=offset+buffer.length)await emit();if(!buffer.length)break;
     const x=Math.max(0,(frame/sampleRate-sample.timestamp)*sample.sampleRate),k=Math.min(sample.numberOfFrames-1,Math.floor(x)),fraction=x-k;let sum=0;
     for(const p of planes)sum+=p[k]*(1-fraction)+(p[Math.min(k+1,p.length-1)]||0)*fraction;
     buffer[frame-offset]=Math.round(Math.max(-1,Math.min(1,sum/planes.length))*32767);decodedEnd=Math.max(decodedEnd,frame+1);
    }
   }finally{sample.close()}
  }
  if(total-decodedEnd>sampleRate*.15)throw Error('Âm thanh chưa đủ mẫu ở cuối video.');
  // Include legitimate silence and a short last segment without shifting timestamps.
  while(offset<total&&buffer.length)await emit();
  return {duration,audioDuration,samples:total};
 }finally{local.abort();signal?.removeEventListener('abort',abort);session.signal.removeEventListener('abort',abort);disposed=true;input.dispose();if(iterator)void Promise.resolve().then(()=>iterator.return?.()).catch(()=>{});}
}
