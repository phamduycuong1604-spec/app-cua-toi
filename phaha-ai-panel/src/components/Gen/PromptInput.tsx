import React from "react";

export function PromptInput(p: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <textarea
        className="prompt"
        value={p.value}
        placeholder={p.placeholder ?? "Mô tả bạn muốn AI sửa gì, vd: thay bầu trời thành hoàng hôn..."}
        onChange={(e) => p.onChange(e.target.value)}
        onInput={(e: any) => p.onChange(e.target.value)}
      />
      <div className="row small muted">
        <span>{p.value.length} ký tự</span>
        <span className="spacer" />
        {p.value && (
          <span className="link" onClick={() => p.onChange("")}>
            Xóa
          </span>
        )}
      </div>
    </div>
  );
}
