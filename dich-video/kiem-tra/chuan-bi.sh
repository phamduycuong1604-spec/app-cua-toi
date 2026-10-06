#!/usr/bin/env bash
# Chuẩn bị dữ liệu cho bộ kiểm tra (chạy 1 lần): thư viện giả lập CDN + video/âm thanh mẫu.
# Cần: node/npm, ffmpeg. Kết quả nằm trong kiem-tra/du-lieu (không đưa lên git).
set -euo pipefail
cd "$(dirname "$0")"
D=du-lieu; mkdir -p "$D" && cd "$D"

# Thư viện mà app tải từ CDN (bộ kiểm tra trả bản trên máy thay cho CDN)
[ -d mdx/node_modules/onnxruntime-web ] || { mkdir -p mdx && (cd mdx && npm init -y >/dev/null && npm i --no-audit --no-fund onnxruntime-web@1.22.0 mediabunny@1.61.1 >/dev/null); }
[ -d core/package ] || { mkdir -p core && (cd core && npm pack @ffmpeg/core@0.12.10 >/dev/null && tar xzf ffmpeg-core-0.12.10.tgz); }
[ -d piper/pw/package ] || { mkdir -p piper/pw && (cd piper/pw && npm pack @diffusionstudio/piper-wasm@1.0.0 >/dev/null && tar xzf diffusionstudio-piper-wasm-1.0.0.tgz); }

# Video / âm thanh mẫu
taoVideo() { # ten, giay, kichthuoc, kenh(0=không tiếng), them
  local am=(); [ "$4" != 0 ] && am=(-f lavfi -i "sine=f=440:d=$2" -ac "$4" -c:a aac)
  ffmpeg -v error -y -f lavfi -i "testsrc=d=$2:s=$3:r=25" "${am[@]}" -c:v libvpx-vp9 -b:v 300k -deadline realtime "$1"
}
[ -f thu-vp9.mp4 ] || taoVideo thu-vp9.mp4 9.12 640x360 2
[ -f mono.mp4 ] || taoVideo mono.mp4 9.12 640x360 1
[ -f khongtieng.mp4 ] || taoVideo khongtieng.mp4 9 640x360 0
[ -f thu-xoay.mp4 ] || { taoVideo tmp-xoay.mp4 9.12 640x360 2 && ffmpeg -v error -y -display_rotation 90 -i tmp-xoay.mp4 -c copy thu-xoay.mp4 && rm tmp-xoay.mp4; }
[ -f dai.mp4 ] || taoVideo dai.mp4 266 320x180 2
[ -f thu.mp4 ] || ffmpeg -v error -y -f lavfi -i "testsrc=d=12:s=320x240:r=25" -f lavfi -i "sine=f=440:d=12" -ac 1 -c:v libx264 -c:a aac thu.mp4
[ -f logo.png ] || ffmpeg -v error -y -f lavfi -i "color=c=red:s=64x64,format=rgba" -frames:v 1 logo.png
[ -f sine.mp3 ] || ffmpeg -v error -y -f lavfi -i "sine=f=330:d=1.5" -ar 24000 -ac 1 -b:a 48k sine.mp3
echo "Xong: $(pwd)"
