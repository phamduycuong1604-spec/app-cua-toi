const MB='https://cdn.jsdelivr.net/npm/mediabunny@1.61.1/dist/bundles/mediabunny.min.mjs';
export function fit1080(width,height){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<2||height<2)throw Error('Không đọc được độ phân giải video gốc.');
 const ratio=Math.min(1,1080/Math.min(width,height),1920/Math.max(width,height));
 return {width:Math.max(2,Math.floor(width*ratio/2)*2),height:Math.max(2,Math.floor(height*ratio/2)*2),resize:ratio<1};
}
export async function normalise(file,{signal,onProgress=()=>{},loadMedia=()=>import(MB),storage=globalThis.PHAVideoDownload}={}){
 signal?.throwIfAborted();const mb=await loadMedia();signal?.throwIfAborted();
 const mediaSource=f=>storage?.mediaSource?.(mb,f,{signal})||new mb.BlobSource(f,{useStreamReader:false,maxCacheSize:4*1048576});
 const input=new mb.Input({source:mediaSource(file),formats:mb.ALL_FORMATS});let disk,conv,result,keep=false;
 try{
  const track=await input.getPrimaryVideoTrack();if(!track)throw Error('Video gốc không có hình.');
  const sourceWidth=track.displayWidth,sourceHeight=track.displayHeight,size=fit1080(sourceWidth,sourceHeight),audio=await input.getAudioTracks();
  signal?.throwIfAborted();
  if(!size.resize){onProgress(1);return {file,width:sourceWidth,height:sourceHeight,sourceWidth,sourceHeight,converted:false};}
  if(typeof VideoEncoder==='undefined'||typeof VideoDecoder==='undefined'||!await track.canDecode())throw Error('Safari chưa hỗ trợ hạ video này xuống 1080p. Video gốc chưa được đưa ra để lưu.');
  if(!await mb.getFirstEncodableVideoCodec(['avc'],size))throw Error('Thiết bị chưa mã hóa được video 1080p H.264.');
  if(!storage?.outputFile)throw Error('Chưa tải được bộ lưu video 1080p. Hãy mở lại app.');
  const duration=await input.computeDuration();signal?.throwIfAborted();
  const name=file.name.replace(/\.[^.]+$/,'')+'-1080p.mp4';disk=await storage.outputFile(name);
  const stream=new WritableStream({write:chunk=>{signal?.throwIfAborted();return disk.write(chunk.data,chunk.position);}});
  const output=new mb.Output({format:new mb.Mp4OutputFormat({fastStart:false}),target:new mb.StreamTarget(stream,{chunked:true,chunkSize:1048576})});
  conv=await mb.Conversion.init({input,output,showWarnings:false,video:{width:size.width,height:size.height,fit:'contain',codec:'avc',forceTranscode:true,allowTransformationMetadata:false,quality:mb.QUALITY_HIGH},audio:{}});
  if(!conv.isValid||conv.discardedTracks?.some(d=>audio.includes(d.track)))throw Error('Không thể tạo video 1080p đủ hình và tiếng gốc trên máy này.');
  conv.onProgress=onProgress;const abort=()=>{Promise.resolve(conv.cancel()).catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
  try{signal?.throwIfAborted();await conv.execute();signal?.throwIfAborted()}finally{signal?.removeEventListener('abort',abort)}
  result=await disk.finish();signal?.throwIfAborted();
  // Verify the result rather than labelling an unconverted source as 1080p.
  const check=new mb.Input({source:mediaSource(result),formats:mb.ALL_FORMATS});
  try{const video=await check.getPrimaryVideoTrack(),outputAudio=await check.getAudioTracks();const durationOut=await check.computeDuration();if(Math.abs(duration-durationOut)>Math.max(.15,duration*.0001))throw Error('Video 1080p chưa giữ đủ thời lượng nguồn.');if(!video||video.displayWidth!==size.width||video.displayHeight!==size.height||outputAudio.length<audio.length)throw Error('Video 1080p xuất chưa đủ hình/tiếng hoặc sai độ phân giải.');}finally{check.dispose()}
  signal?.throwIfAborted();keep=true;onProgress(1);return {file:result,...size,sourceWidth,sourceHeight,converted:true};
 }finally{input.dispose();if(disk&&!keep){try{await conv?.cancel()}catch{}await disk.abort().catch(()=>{});if(result)await storage.release(result);}}
}

globalThis.PHAVideo1080={normalise,fit1080};
