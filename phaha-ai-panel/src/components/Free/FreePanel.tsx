import React, { useState } from "react";
import { MAX_SIDE } from "../../config";
import { createGenJob } from "../../api/gen";
import { captureSource, toTarget } from "../../jobs/capture";
import { jobErrorMessage, submitJob } from "../../jobs/manager";
import { useStore } from "../../state/store";
import { Button } from "../common/Button";
import { DocStatus } from "../common/DocStatus";
import { Toggle } from "../common/Toggle";
import { PromptInput } from "../Gen/PromptInput";
import { PromptPresets } from "../Gen/PromptPresets";
import { layerNameFromPrompt } from "../Gen/GenPanel";

export function FreePanel() {
  const toast = useStore((s) => s.toast);
  const [prompt, setPrompt] = useState("");
  const [onlySelection, setOnlySelection] = useState(false);

  const run = async () => {
    const text = prompt.trim();
    if (!text) return toast("warning", "Hãy nhập prompt.");
    try {
      const src = await captureSource({
        maxSide: MAX_SIDE.free,
        selection: onlySelection ? "require" : "none",
        uploadMask: onlySelection,
      });
      submitJob({
        kind: "free",
        label: "[Free] " + text,
        cost: 0,
        target: toTarget(src, "Free - " + layerNameFromPrompt(text)),
        create: () =>
          createGenJob({ prompt: text, model: "gpt-image-2", image: src.image, mask: src.uploadMask, free: true, max_side: MAX_SIDE.free }),
      });
      toast("info", "Đã đưa vào hàng đợi.");
    } catch (e) {
      toast("error", jobErrorMessage(e));
    }
  };

  return (
    <div>
      <div className="panel-title">Gen Free</div>
      <div className="panel-sub">Không tốn điểm. Ảnh xử lý tối đa {MAX_SIDE.free}px nên sẽ kém nét hơn Gen API.</div>
      <DocStatus />
      <PromptInput value={prompt} onChange={setPrompt} />
      <PromptPresets onPick={setPrompt} />
      <div className="section-title">Tùy chọn</div>
      <Toggle label="Chỉ sửa vùng chọn" on={onlySelection} onChange={setOnlySelection} />
      <Button variant="primary" big price={0} onClick={run} loadingText="Đang đọc ảnh">
        ▶ Chạy miễn phí
      </Button>
    </div>
  );
}
