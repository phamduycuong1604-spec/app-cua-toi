# Hộp cài sẵn mọi thứ để chạy TransKeep trên máy chủ
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg curl libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /srv
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Tải sẵn mô hình đọc chữ (PaddleOCR) và mô hình xóa chữ (LaMa) để lần đầu chạy không phải chờ
RUN python -c "from rapidocr import RapidOCR; RapidOCR()" \
 && mkdir -p /models \
 && (curl -fL --retry 3 -o /models/lama_fp32.onnx \
      https://huggingface.co/Carve/LaMa-ONNX/resolve/main/lama_fp32.onnx \
     || echo "Không tải được LaMa — app sẽ dùng OpenCV để xóa chữ")

COPY backend backend
COPY frontend frontend

ENV DATA_DIR=/data LAMA_MODEL=/models/lama_fp32.onnx
VOLUME /data
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--app-dir", "backend", "--host", "0.0.0.0", "--port", "8000"]
