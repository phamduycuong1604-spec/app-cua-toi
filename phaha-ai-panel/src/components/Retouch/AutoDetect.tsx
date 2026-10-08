import React from "react";
import { Button } from "../common/Button";

export const REGION_NAMES: Record<string, string> = {
  head: "Đầu",
  neck_shoulder: "Cổ vai",
  arms: "Tay",
  legs: "Chân",
};

export function AutoDetect(p: { onRun: () => Promise<void>; pricePerRegion: number }) {
  return (
    <div>
      <div className="section-title">Chạy tự động</div>
      <div className="muted small" style={{ marginBottom: 4 }}>
        AI tự tìm Đầu / Cổ vai / Tay / Chân rồi làm da từng vùng — mỗi vùng 1 layer ({p.pricePerRegion}đ/vùng).
      </div>
      <Button onClick={p.onRun} loadingText="Đang nhận diện">
        🤖 Chạy tự động
      </Button>
    </div>
  );
}
