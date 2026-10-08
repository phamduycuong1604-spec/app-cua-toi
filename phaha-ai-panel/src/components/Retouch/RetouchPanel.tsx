import React, { useEffect, useRef, useState } from "react";
import { MAX_SIDE, PRICES } from "../../config";
import { createRetouchJob, detectRegions } from "../../api/retouch";
import type { RetouchType } from "../../api/types";
import { captureSource, toTarget } from "../../jobs/capture";
import { checkCredits, jobErrorMessage, submitJob } from "../../jobs/manager";
import { useStore } from "../../state/store";
import { runModal } from "../../photoshop/modal";
import { setLayerOpacity } from "../../photoshop/layers";
import { requireActiveDoc } from "../../photoshop/document";
import { ensureSubfolder, openFile, pickImageFolder, saveJpgAndClose } from "../../photoshop/files";
import { Button } from "../common/Button";
import { Toggle } from "../common/Toggle";
import { DocStatus } from "../common/DocStatus";
import { OpacitySlider } from "./OpacitySlider";
import { AutoDetect, REGION_NAMES } from "./AutoDetect";
import { BatchMode, type BatchProgress } from "./BatchMode";

const CUSTOM_KEY = "phaha.retouchCustomName";

function loadCustomName() {
  try {
    return localStorage.getItem(CUSTOM_KEY) || "Nút của tôi";
  } catch {
    return "Nút của tôi";
  }
}

export function RetouchPanel() {
  const toast = useStore((s) => s.toast);
  const [hq, setHq] = useState(false);
  const [opacity, setOpacity] = useState(100);
  const [customName, setCustomName] = useState(loadCustomName);
  const [editing, setEditing] = useState(false);
  const [batch, setBatch] = useState<BatchProgress>({ running: false, done: 0, total: 0, failed: 0 });
  const stopRef = useRef(false);
  /** Job của lần chạy gần nhất — để kéo thanh độ mờ đổi luôn layer của chúng. */
  const lastRun = useRef<string[]>([]);

  const price = hq ? PRICES.retouch4k : PRICES.retouch;
  const maxSide = hq ? MAX_SIDE.retouch4k : MAX_SIDE.retouch;
  const quality = hq ? "4k" : "standard";

  // Kéo thanh độ mờ → cập nhật layer vừa tạo (chờ 300ms sau lần kéo cuối).
  useEffect(() => {
    const t = setTimeout(() => {
      const jobs = useStore.getState().jobs.filter((j) => lastRun.current.includes(j.localId) && j.inserted && j.layerIds);
      if (!jobs.length) return;
      runModal("PhaHa AI: độ mờ", async () => {
        for (const j of jobs) setLayerOpacity(j.target.docId, j.layerIds!, opacity);
      }).catch(() => undefined);
    }, 300);
    return () => clearTimeout(t);
  }, [opacity]);

  const runOne = async (type: RetouchType, name: string) => {
    if (!checkCredits(price)) return;
    try {
      const src = await captureSource({ maxSide, selection: "optional", padding: 0.1, uploadMask: true });
      if (!src.usedSelection) toast("info", "Chưa có vùng chọn → xử lý cả ảnh.");
      const { localId } = submitJob({
        kind: "retouch",
        label: name,
        cost: price,
        target: toTarget(src, name, { opacity }),
        create: () => createRetouchJob({ image: src.image, region: src.bounds, mask: src.uploadMask, type, name, quality }),
      });
      lastRun.current = [localId];
    } catch (e) {
      toast("error", jobErrorMessage(e));
    }
  };

  const runAuto = async () => {
    try {
      const doc = requireActiveDoc();
      const preview = await captureSource({ maxSide: 1024, selection: "none" });
      const regions = await detectRegions(preview.image);
      if (!regions.length) return toast("warning", "AI không tìm thấy vùng cơ thể nào trong ảnh.");
      const total = regions.length * price;
      if (!checkCredits(total)) return;
      const kx = doc.width / preview.sentWidth;
      const ky = doc.height / preview.sentHeight;
      const ids: string[] = [];
      for (const r of regions) {
        const bounds = {
          left: Math.max(0, Math.floor(r.bounds.left * kx)),
          top: Math.max(0, Math.floor(r.bounds.top * ky)),
          right: Math.min(doc.width, Math.ceil(r.bounds.right * kx)),
          bottom: Math.min(doc.height, Math.ceil(r.bounds.bottom * ky)),
        };
        if (bounds.right - bounds.left < 4 || bounds.bottom - bounds.top < 4) continue;
        const regionName = r.name || REGION_NAMES[r.label] || r.label;
        const layerName = `Làm da - ${regionName}`;
        const src = await captureSource({ maxSide, selection: "none", bounds });
        const { localId } = submitJob({
          kind: "retouch",
          label: layerName,
          cost: price,
          target: toTarget(src, layerName, { opacity }),
          create: () => createRetouchJob({ image: src.image, region: bounds, type: "skin", name: layerName, quality }),
        });
        ids.push(localId);
      }
      lastRun.current = ids;
      toast("info", `Đã tìm thấy ${ids.length} vùng, đang làm da từng vùng.`);
    } catch (e) {
      toast("error", jobErrorMessage(e));
    }
  };

  const runBatch = async () => {
    let picked;
    try {
      picked = await pickImageFolder();
    } catch (e) {
      return toast("error", jobErrorMessage(e));
    }
    if (!picked) return;
    if (!picked.files.length) return toast("warning", "Thư mục không có ảnh JPG/PNG/TIFF/PSD nào.");
    if (!checkCredits(picked.files.length * price)) return;
    const out = await ensureSubfolder(picked.folder, "Pixelius");
    stopRef.current = false;
    let failed = 0;
    for (let i = 0; i < picked.files.length; i++) {
      if (stopRef.current) break;
      const f = picked.files[i];
      setBatch({ running: true, done: i, total: picked.files.length, current: f.name, failed });
      let doc: any = null;
      try {
        doc = await runModal("PhaHa AI: mở ảnh", () => openFile(f));
        const src = await captureSource({ maxSide, selection: "none" });
        await submitJob({
          kind: "retouch",
          label: `${f.name} – Làm da`,
          cost: price,
          quiet: true,
          target: toTarget(src, "Làm da", { opacity }),
          create: () => createRetouchJob({ image: src.image, region: src.bounds, type: "skin", name: "Làm da", quality }),
        }).done;
        await runModal("PhaHa AI: lưu JPG", () => saveJpgAndClose(doc, out, f.name));
      } catch (e) {
        failed++;
        toast("error", `${f.name}: ${jobErrorMessage(e)}`);
        if (doc) await runModal("PhaHa AI: đóng ảnh", async () => doc.closeWithoutSaving()).catch(() => undefined);
      }
    }
    setBatch({ running: false, done: 0, total: 0, failed: 0 });
    toast(failed ? "warning" : "success", `Chạy hàng loạt xong. Lỗi: ${failed}. Ảnh lưu trong thư mục "Pixelius".`);
  };

  return (
    <div>
      <div className="panel-title">Retouch</div>
      <div className="panel-sub">Khoanh vùng (Lasso/Marquee) rồi bấm nút. Không chọn vùng = xử lý cả ảnh.</div>
      <DocStatus />

      <div className="section-title">Xử lý vùng chọn</div>
      <div className="row">
        <Button variant="primary" onClick={() => runOne("skin", "Làm da")} style={{ flex: 1, marginRight: 6 }} loadingText="Đang đọc">
          Làm da
        </Button>
        <Button variant="primary" onClick={() => runOne("clothes", "Quần áo")} style={{ flex: 1 }} loadingText="Đang đọc">
          Quần áo
        </Button>
      </div>
      <div className="row" style={{ marginTop: 6 }}>
        {editing ? (
          <>
            <input
              className="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              style={{ flex: 1, marginRight: 6 }}
            />
            <Button
              small
              onClick={() => {
                const n = customName.trim() || "Nút của tôi";
                setCustomName(n);
                try {
                  localStorage.setItem(CUSTOM_KEY, n);
                } catch {
                  /* bỏ qua */
                }
                setEditing(false);
              }}
            >
              Lưu
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => runOne("custom", customName)} style={{ flex: 1, marginRight: 6 }} loadingText="Đang đọc">
              {customName}
            </Button>
            <Button small variant="ghost" onClick={() => setEditing(true)} title="Đổi tên nút">
              ✎
            </Button>
          </>
        )}
      </div>
      <div className="muted small" style={{ marginTop: 4 }}>
        Giá: {price}đ / lần · tên layer = tên nút
      </div>

      <div className="section-title">Chất lượng</div>
      <Toggle label="Chất lượng cao 4K" tag={`${PRICES.retouch4k}đ`} on={hq} onChange={setHq} />
      <OpacitySlider value={opacity} onChange={setOpacity} />

      <AutoDetect onRun={runAuto} pricePerRegion={price} />
      <BatchMode progress={batch} onStart={runBatch} onStop={() => (stopRef.current = true)} pricePerImage={price} />
    </div>
  );
}
