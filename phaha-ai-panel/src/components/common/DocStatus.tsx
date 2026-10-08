import React from "react";
import { useActiveDoc } from "../../hooks/usePhotoshop";

/** Dòng nhỏ báo đang làm việc với ảnh nào. */
export function DocStatus() {
  const doc = useActiveDoc();
  if (!doc) return <div className="warn-box">Chưa mở ảnh nào trong Photoshop. Hãy mở ảnh trước khi chạy.</div>;
  return (
    <div className="muted small" style={{ marginBottom: 6 }}>
      Ảnh: <b>{doc.title}</b> · {doc.width}×{doc.height}px
    </div>
  );
}
