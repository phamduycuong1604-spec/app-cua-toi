import "./polyfills";
import React from "react";
import { createRoot } from "react-dom/client";
import { entrypoints } from "uxp";
import { App } from "./App";

// Điểm khởi động panel. Photoshop nạp index.html → index.js (file này sau khi build).
// Plugin chỉ có 1 panel nên nội dung panel chính là <body>.
try {
  entrypoints.setup({
    panels: {
      phahaPanel: {
        show() {
          /* panel đã được dựng sẵn trong body */
        },
      },
    },
  });
} catch {
  /* setup chỉ được gọi 1 lần — bỏ qua khi nạp lại */
}

const el = document.getElementById("root");
if (el) createRoot(el).render(<App />);
