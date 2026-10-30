import {xuatHinh,veLop,RENDER_DIAG_VERSION} from './lop-phu.js';

// Set this before importing storage: a new worker must NOT sweep active page
// files or compete for the page's storage lifetime lock.
globalThis.PHA_STORAGE_WORKER=true;
await import('./video-download.js');
const storage=globalThis.PHAVideoDownload;
globalThis.postMessage({type:'ready',version:RENDER_DIAG_VERSION,decoder:typeof VideoDecoder!=='undefined',encoder:typeof VideoEncoder!=='undefined',canvas:typeof OffscreenCanvas!=='undefined',storage:!!globalThis.navigator?.storage?.getDirectory});
let running=false;
globalThis.onmessage=async({data:d})=>{
  if(d?.type!=='render'||running)return;
  running=true;const id=d.id,send=(type,extra)=>globalThis.postMessage({id,type,...extra});
  const open=storage.outputFile;
  storage.outputFile=async(...args)=>{const output=await open(...args);send('created',{reference:output.reference});return output;};
  const controller=new AbortController();
  try{
    send('log',{message:'Worker bắt đầu · '+RENDER_DIAG_VERSION+' · '+(d.compatible?'tuần tự':'nhanh')});
    const file=d.reference?await storage.restore(d.reference):d.file;
    send('log',{message:'Worker đã mở nguồn · '+file.size+' byte · logo '+(d.logo?d.logo.width+'×'+d.logo.height:'tắt')});
    const result=await xuatHinh(file,(ctx,w,h,t,trace)=>veLop(ctx,w,h,t,d.lop,d.cau,d.logo,undefined,trace),p=>send('progress',{value:p}),controller.signal,message=>send('log',{message}),trace=>send('trace',{trace}),{compatible:!!d.compatible});
    const reference=storage.reference(result.blob);
    send('result',{reference,blob:reference?null:result.blob,codec:result.codec,W:result.W,H:result.H});
  }catch(error){send('error',{name:error.name,message:error.message,stack:error.stack,khongHoTro:error.khongHoTro});}
  finally{d.logo?.close?.();storage.outputFile=open;}
};
