import React from "react";

export function Toggle(p: { on: boolean; onChange: (v: boolean) => void; label: string; tag?: string; disabled?: boolean }) {
  return (
    <div
      className={"toggle" + (p.on ? " on" : "")}
      style={p.disabled ? { opacity: 0.45 } : undefined}
      onClick={() => !p.disabled && p.onChange(!p.on)}
    >
      <div className="sw">
        <div className="knob" />
      </div>
      <div className="tl">{p.label}</div>
      {p.tag && <div className="tag">{p.tag}</div>}
    </div>
  );
}

export function Choice<T extends string>(p: {
  options: { value: T; title: string; sub?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="row">
      {p.options.map((o) => (
        <div key={o.value} className={"choice" + (o.value === p.value ? " on" : "")} onClick={() => p.onChange(o.value)}>
          <div className="t">{o.title}</div>
          {o.sub && <div className="s">{o.sub}</div>}
        </div>
      ))}
    </div>
  );
}
