import {createSeparator} from 'web-audio-separation';
import * as ort from 'onnxruntime-web';
import {stereoWav} from '/dub/dub-core.js';
export async function separateMusic(audioUrl,mode,onProgress,signal){
 ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;
 const name=mode==='careful'?'UVR-MDX-NET-Voc_FT':'UVR_MDXNET_KARA_2';
 const separator=createSeparator(name,{common:{outputSingleStem:'instrumental',logLevel:'error',onProgress},mdx:{batchSize:1,executionProviders:navigator.gpu?['webgpu','wasm']:['wasm']}});
 try{signal?.throwIfAborted();await separator.loadModel();signal?.throwIfAborted();const context=new OfflineAudioContext(2,1,44100),decoded=await context.decodeAudioData(await (await fetch(audioUrl)).arrayBuffer()),step=44100*30,parts=[];let header,total=0;for(let p=0;p<decoded.length;p+=step){signal?.throwIfAborted();const left=decoded.getChannelData(0).subarray(p,p+step),right=decoded.getChannelData(Math.min(1,decoded.numberOfChannels-1)).subarray(p,p+step),url=URL.createObjectURL(new Blob([stereoWav(left,right)],{type:'audio/wav'}));try{separator.primarySource=null;separator.secondarySource=null;const urls=await separator.separate(url);signal?.throwIfAborted();const blob=await (await fetch(urls[0])).blob();const bytes=new Uint8Array(await blob.slice(0,44).arrayBuffer());if(String.fromCharCode(...bytes.subarray(0,4))!=='RIFF')throw Error('AI chưa trả nhạc WAV hợp lệ.');header=header||bytes;const data=blob.slice(44,44+left.length*4);parts.push(data);total+=data.size;urls.forEach(u=>URL.revokeObjectURL(u));onProgress?.({stage:'demixing',fraction:Math.min(1,(p+step)/decoded.length)});}finally{URL.revokeObjectURL(url);}}const v=new DataView(header.buffer,header.byteOffset);v.setUint32(4,total+36,true);v.setUint32(40,total,true);return new Blob([header,...parts],{type:'audio/wav'});}
 finally{await separator.model?.release?.();if(separator.modelPath?.startsWith('blob:'))URL.revokeObjectURL(separator.modelPath);}
}
