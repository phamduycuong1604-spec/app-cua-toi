import React from "react";
import { useStore, type TabId } from "../../state/store";

const TABS: { id: TabId; ico: string; lbl: string }[] = [
  { id: "gen", ico: "✨", lbl: "Gen" },
  { id: "retouch", ico: "🖌️", lbl: "Retouch" },
  { id: "special", ico: "💇", lbl: "Special" },
  { id: "free", ico: "🎁", lbl: "Free" },
  { id: "upscale", ico: "🔍", lbl: "Upscale" },
];

export function Sidebar() {
  const tab = useStore((s) => s.tab);
  const setTab = useStore((s) => s.setTab);
  return (
    <div className="sidebar">
      {TABS.map((t) => (
        <div key={t.id} className={"tab" + (tab === t.id ? " active" : "")} onClick={() => setTab(t.id)}>
          <div className="ico">{t.ico}</div>
          <div className="lbl">{t.lbl}</div>
        </div>
      ))}
    </div>
  );
}
