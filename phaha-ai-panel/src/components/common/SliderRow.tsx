import React from "react";

export function SliderRow(p: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; unit?: string }) {
  const handle = (e: any) => p.onChange(Number(e.target.value));
  return (
    <div className="slider-row">
      <span>{p.label}</span>
      <input type="range" min={p.min ?? 0} max={p.max ?? 100} step={1} value={p.value} onChange={handle} onInput={handle} />
      <span className="val">
        {p.value}
        {p.unit ?? "%"}
      </span>
    </div>
  );
}
