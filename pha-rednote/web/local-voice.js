import {TtsSession} from '@mintplex-labs/piper-tts-web';
let session;
export async function localVoice(text,progress){
 if(!session)session=await TtsSession.create({voiceId:'vi_VN-vais1000-medium',progress,wasmPaths:{onnxWasm:'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/',piperData:'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize.data',piperWasm:'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize.wasm'}});
 return session.predict(text);
}
