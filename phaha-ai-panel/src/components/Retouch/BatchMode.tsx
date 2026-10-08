import React from "react";
import { Button } from "../common/Button";

export interface BatchProgress {
  running: boolean;
  done: number;
  total: number;
  current?: string;
  failed: number;
}

export function BatchMode(p: { progress: BatchProgress; onStart: () => Promise<void>; onStop: () => void; pricePerImage: number }) {
  const pr = p.progress;
  return (
    <div>
      <div className="section-title">Chạy hàng loạt</div>
      <div className="muted small" style={{ marginBottom: 4 }}>
        Chọn thư mục ảnh → xử lý từng ảnh → lưu JPG vào thư mục "Pixelius" bên trong ({p.pricePerImage}đ/ảnh).
      </div>
      {pr.running ? (
        <div className="info-box">
          Đang xử lý {pr.done + 1}/{pr.total}: {pr.current}
          {pr.failed > 0 && ` · lỗi ${pr.failed}`}
          <div className="progress" style={{ marginTop: 6 }}>
            <div className="bar" style={{ width: `${Math.round((pr.done / Math.max(1, pr.total)) * 100)}%` }} />
          </div>
          <Button small variant="danger" onClick={p.onStop} style={{ marginTop: 6 }}>
            Dừng sau ảnh này
          </Button>
        </div>
      ) : (
        <Button onClick={p.onStart} loadingText="Đang chọn thư mục">
          📁 Chọn thư mục &amp; chạy
        </Button>
      )}
    </div>
  );
}
