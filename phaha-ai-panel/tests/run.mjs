// Gói các file test TypeScript bằng esbuild (có sẵn trong Vite) rồi chạy bằng node --test.
import { build } from "esbuild";
import { readdirSync, mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, ".out");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const entries = readdirSync(here).filter((f) => f.endsWith(".test.ts")).map((f) => join(here, f));
await build({ entryPoints: entries, bundle: true, platform: "node", format: "esm", outdir: out, outExtension: { ".js": ".mjs" }, logLevel: "warning",
  // Thay Photoshop/UXP thật bằng bản giả để chạy được trên Node.
  alias: { photoshop: join(here, "fakes/photoshop.ts"), uxp: join(here, "fakes/uxp.ts") },
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
const files = readdirSync(out).map((f) => join(out, f));
const r = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
process.exit(r.status ?? 1);
