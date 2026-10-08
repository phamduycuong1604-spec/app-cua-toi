import React, { useState } from "react";
import { MAX_SIDE, PRICES } from "../../config";
import { createUpscaleJob } from "../../api/upscale";
import { captureSource, toTarget } from "../../jobs/capture";
import { checkCredits, jobErrorMessage, submitJob } from "../../jobs/manager";
import { useActiveDoc } from "../../hooks/usePhotoshop";
import { useStore } from "../../state/store";
import { Button } from "../common/Button";
import { DocStatus } from "../common/DocStatus";
import { Choice } from "../common/Toggle";

type Mode = "2x" | "4x" | "12mpx" | "24mpx";

/** Kích thước đầu ra dự kiến. */
export function outputSize(mode: Mode, w: number, h: number) {
  if (mode === "2x") return { width: w * 2, height: h * 2 };
  if (mode === "4x") return { width: w * 4, height: h * 4 };
  const target = (mode === "12mpx" ? 12 : 24) * 1_000_000;
  const k = Math.sqrt(target / (w * h));
  return { width: Math.round(w * k), height: Math.round(h * k) };
}

export function UpscalePanel() {
  const toast = useStore((s) => s.toast);
  const doc = useActiveDoc();
  const [mode, setMode] = useState<Mode>("2x");
  const cost = PRICES.upscale[mode];
  const out = doc ? outputSize(mode, doc.width, doc.height) : null;
  const notBigger = !!doc && !!out && out.width <= doc.width;

  const run = async () => {
    if (notBigger) return toast("warning", "Ảnh đã lớn hơn mức đích, không cần phóng to.");
    if (!checkCredits(cost)) return;
    try {
      const src = await captureSource({ maxSide: MAX_SIDE.upscale, selection: "none" });
      const name = `Upscale ${mode}`;
      submitJob({
        kind: "upscale",
        label: `${name} – ${src.doc.title}`,
        cost,
        target: toTarget(src, name, { mode: "upscale" }),
        create: () =>
          createUpscaleJob({
            image: src.image,
            target_width: outputSize(mode, src.doc.width, src.doc.height).width,
            target_height: outputSize(mode, src.doc.width, src.doc.height).height,
            ...(mode === "2x" ? { scale: 2 as const } : mode === "4x" ? { scale: 4 as const } : { mpx: mode === "12mpx" ? (12 as const) : (24 as const) }),
          }),
      });
      toast("info", "Đã đưa vào hàng đợi. Xong sẽ phóng to ảnh và thêm layer AI phía trên.");
    } catch (e) {
      toast("error", jobErrorMessage(e));
    }
  };

  return (
    <div>
      <div className="panel-title">Upscale</div>
      <div className="panel-sub">Phóng to giữ chi tiết. Layer gốc giữ nguyên, kết quả AI thành layer mới bên trên.</div>
      <DocStatus />
      <div className="section-title">Theo tỉ lệ</div>
      <Choice<Mode>
        value={mode}
        onChange={setMode}
        options={[
          { value: "2x", title: "2x", sub: `${PRICES.upscale["2x"]}đ` },
          { value: "4x", title: "4x", sub: `${PRICES.upscale["4x"]}đ` },
        ]}
      />
      <div className="section-title">Theo số điểm ảnh</div>
      <Choice<Mode>
        value={mode}
        onChange={setMode}
        options={[
          { value: "12mpx", title: "12 Mpx", sub: `${PRICES.upscale["12mpx"]}đ` },
          { value: "24mpx", title: "24 Mpx", sub: `${PRICES.upscale["24mpx"]}đ` },
        ]}
      />
      {doc && out && (
        <div className={notBigger ? "warn-box" : "info-box"}>
          {doc.width}×{doc.height} → <b>{out.width}×{out.height}px</b>
          {notBigger && " (không lớn hơn ảnh hiện tại)"}
        </div>
      )}
      <Button variant="primary" big price={cost} onClick={run} loadingText="Đang đọc ảnh">
        🔍 Phóng to
      </Button>
    </div>
  );
}
