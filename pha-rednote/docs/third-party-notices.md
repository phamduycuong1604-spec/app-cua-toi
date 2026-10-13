# Video studio third-party notices

- @ffmpeg/ffmpeg 0.12.15: MIT; https://github.com/ffmpegwasm/ffmpeg.wasm
- @ffmpeg/core 0.12.10 includes FFmpeg and codecs; GPL-2.0-or-later / GPL-3.0
  conditions apply to the compiled core. Sources/build instructions:
  https://github.com/ffmpegwasm/ffmpeg.wasm/tree/main/packages/core
  The core is downloaded from jsDelivr, rather than embedded in the Worker.
- web-audio-separation 0.3.1: MIT;
  https://github.com/incidentist/web-audio-separation
  Model URLs and available model notes come from its registry. UVR_MDXNET_KARA_2
  host card declares MIT: https://huggingface.co/AI4future/RVC
- onnxruntime-web 1.30.0: MIT; https://github.com/microsoft/onnxruntime
- @mintplex-labs/piper-tts-web 1.0.5: MIT;
  https://github.com/Mintplex-Labs/piper-tts-web
- Silero V5 voice activity detection: MIT; https://github.com/snakers4/silero-vad
  Served through @ricky0123/vad-web 0.0.30:
  https://github.com/ricky0123/vad
- Piper vi_VN-vais1000-medium: voice from rhasspy Piper voices, mirrored by
  diffusionstudio; training corpus VAIS-1000 Vietnamese speech synthesis corpus,
  CC BY 4.0. Model card:
  https://huggingface.co/rhasspy/piper-voices/blob/main/vi/vi_VN/vais1000/medium/MODEL_CARD
- Noto Sans Regular: Copyright 2018 The Noto Project Authors,
  SIL Open Font License 1.1. Font and full license are in `worker/vendor/`.

The downloadable source ZIP includes build/source files; dependencies can be
restored using the pinned package lock. No user API keys or runtime secrets are
included in the distribution.

## Supplied PHAHA source (current video branch)

- Source supplied by the owner: phamduycuong1604-spec/app-cua-toi, snapshot
  10be28d6936da7f7b2cd9a48f149aed1871b4ae5. See video-source-integration.md.
- Mediabunny 1.61.1 (MPL-2.0), https://github.com/Vanilagy/mediabunny
- ONNX Runtime Web 1.22.0 (MIT), https://github.com/microsoft/onnxruntime
- @diffusionstudio/piper-wasm 1.0.0 (MIT), https://github.com/diffusionstudio/piper-wasm
- MDX-Net/Ultimate Vocal Remover models UVR_MDXNET_9482 and Inst_HQ_4,
  mirrored in the owner's mo-hinh directory; attribution NGUON.txt is exposed
  at /dub/mo-hinh/NGUON.txt. Preserve model notices when redistributing weights.
- Be Vietnam Pro (SIL Open Font License), loaded from Google Fonts.
