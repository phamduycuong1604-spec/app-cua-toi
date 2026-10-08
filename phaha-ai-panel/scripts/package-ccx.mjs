// Đóng gói thư mục dist/ thành file .ccx (thực chất là file zip) để cài vào Photoshop.
// Chạy: npm run package   →   release/PhaHa-AI-<phiên bản>.ccx
import AdmZip from "adm-zip";
import { readFileSync, mkdirSync, existsSync } from "node:fs";

if (!existsSync("dist/manifest.json")) {
  console.error("Chưa có dist/. Chạy 'npm run build' trước.");
  process.exit(1);
}
const { version } = JSON.parse(readFileSync("dist/manifest.json", "utf8"));
mkdirSync("release", { recursive: true });
const out = `release/PhaHa-AI-${version}.ccx`;
const zip = new AdmZip();
zip.addLocalFolder("dist");
zip.writeZip(out);
console.log("Đã tạo " + out);
