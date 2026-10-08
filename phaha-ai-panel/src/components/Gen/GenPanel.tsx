import React, { useState } from "react";
import { MAX_SIDE, PRICES, type GenModel } from "../../config";
import { createGenJob } from "../../api/gen";
import { captureSource, toTarget } from "../../jobs/capture";
import { checkCredits, jobErrorMessage, submitJob } from "../../jobs/manager";
import { useStore } from "../../state/store";
import { Button } from "../common/Button";
import { DocStatus } from "../common/DocStatus";
import { PromptInput } from "./PromptInput";
import { PromptPresets } from "./PromptPresets";
import { ModelPicker } from "./ModelPicker";
import { OptionsRow, type GenOptions } from "./OptionsRow";

/** Tên layer = 30 ký tự đầu của prompt. */
export function layerNameFromPrompt(prompt: string) {
  const s = prompt.trim().replace(/\s+/g, " ");
  return s.length > 30 ? s.slice(0, 30).trim() + "…" : s;
}

export function GenPanel() {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<GenModel>("gpt-image-2.5");
  const [opts, setOpts] = useState<GenOptions>({ faceLock: false, onlySelection: false, useRef: false, ref: null });
  const toast = useStore((s) => s.toast);

  const cost = PRICES.gen[model] + (opts.faceLock ? PRICES.faceLock : 0);

  const run = async () => {
    const text = prompt.trim();
    if (!text) return toast("warning", "Hãy nhập prompt hoặc chọn một prompt mẫu.");
    if (!checkCredits(cost)) return;
    try {
      const src = await captureSource({
        maxSide: MAX_SIDE.gen,
        selection: opts.onlySelection ? "require" : "none",
        uploadMask: opts.onlySelection,
      });
      const ref = opts.useRef && opts.ref ? opts.ref.dataUrl : undefined;
      submitJob({
        kind: "gen",
        label: text,
        cost,
        target: toTarget(src, layerNameFromPrompt(text)),
        create: () =>
          createGenJob({
            prompt: text,
            model,
            image: src.image,
            mask: src.uploadMask,
            ref,
            face_lock: opts.faceLock,
            max_side: MAX_SIDE.gen,
          }),
      });
      toast("info", "Đã đưa vào hàng đợi. Bạn có thể chạy tiếp job khác.");
    } catch (e) {
      toast("error", jobErrorMessage(e));
    }
  };

  return (
    <div>
      <div className="panel-title">Gen API</div>
      <div className="panel-sub">Sinh / sửa ảnh bằng GPT Image. Kết quả thành layer mới, ảnh gốc giữ nguyên.</div>
      <DocStatus />
      <PromptInput value={prompt} onChange={setPrompt} />
      <PromptPresets onPick={setPrompt} />
      <ModelPicker value={model} onChange={setModel} />
      <OptionsRow value={opts} onChange={setOpts} />
      <Button variant="primary" big price={cost} onClick={run} loadingText="Đang đọc ảnh">
        ▶ Chạy
      </Button>
    </div>
  );
}
