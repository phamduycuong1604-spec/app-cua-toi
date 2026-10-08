import React from "react";
import { SliderRow } from "../common/SliderRow";

export function OpacitySlider(p: { value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <SliderRow label="Độ mờ layer" value={p.value} onChange={p.onChange} />
      <div className="muted small">Kéo sau khi chạy xong sẽ đổi luôn độ mờ các layer vừa tạo.</div>
    </div>
  );
}
