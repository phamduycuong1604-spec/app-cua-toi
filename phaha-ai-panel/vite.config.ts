import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { cpSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

// UXP không chạy được <script type="module">, nên build ra 1 file CommonJS (index.js).
// Các module của Photoshop/UXP được giữ nguyên dạng require("photoshop") để Photoshop tự cấp.
const UXP_MODULES = ["photoshop", "uxp", "fs", "os", "path"];

// Chép manifest, index.html, CSS, icon vào dist/ — dist/ chính là thư mục plugin.
function copyPluginFiles(): Plugin {
  return {
    name: "phaha-copy-plugin-files",
    writeBundle() {
      const out = resolve(__dirname, "dist");
      mkdirSync(out, { recursive: true });
      cpSync(resolve(__dirname, "manifest.json"), resolve(out, "manifest.json"));
      cpSync(resolve(__dirname, "index.html"), resolve(out, "index.html"));
      cpSync(resolve(__dirname, "src/styles/panel.css"), resolve(out, "panel.css"));
      cpSync(resolve(__dirname, "icons"), resolve(out, "icons"), { recursive: true });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), copyPluginFiles()],
  define: {
    "process.env.NODE_ENV": JSON.stringify(mode === "development" ? "development" : "production"),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2019",
    minify: mode !== "development",
    sourcemap: mode === "development" ? "inline" : false,
    lib: {
      entry: resolve(__dirname, "src/main.tsx"),
      formats: ["cjs"],
      fileName: () => "index.js",
    },
    rollupOptions: {
      external: UXP_MODULES,
    },
  },
}));
