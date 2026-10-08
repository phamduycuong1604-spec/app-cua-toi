import React from "react";
import type { SpecialPreset } from "../../api/types";

const COLORS = ["#5b4a8a", "#3f6b7a", "#7a4a5e", "#4a6b4f", "#7a6a3f", "#4a5a7a"];

export function PresetGrid(p: { presets: SpecialPreset[]; icon: string; onPick: (preset: SpecialPreset) => void }) {
  return (
    <div className="grid">
      {p.presets.map((pr, i) => (
        <div key={pr.id} className="tile" onClick={() => p.onPick(pr)} title={pr.name}>
          <div className="thumb" style={{ backgroundColor: COLORS[i % COLORS.length] }}>
            {pr.thumbnail ? <img src={pr.thumbnail} /> : p.icon}
          </div>
          <div className="name">{pr.name}</div>
        </div>
      ))}
    </div>
  );
}
