import React, { useEffect, useState } from "react";
import { MAX_SIDE, PRICES } from "../../config";
import { createSpecialJob, getSpecialPresets } from "../../api/special";
import type { SpecialPreset } from "../../api/types";
import { DEFAULT_SPECIAL_PRESETS, SPECIAL_GROUPS } from "../../data/specialPresets";
import { captureSource, toTarget } from "../../jobs/capture";
import { checkCredits, jobErrorMessage, submitJob } from "../../jobs/manager";
import { pickImageAsDataUrl } from "../../photoshop/files";
import { useStore } from "../../state/store";
import { DocStatus } from "../common/DocStatus";
import { Toggle } from "../common/Toggle";
import { PresetGrid } from "./PresetGrid";

let cache: SpecialPreset[] | null = null;

export function SpecialPanel() {
  const toast = useStore((s) => s.toast);
  const [group, setGroup] = useState<SpecialPreset["group"]>("hair");
  const [presets, setPresets] = useState<SpecialPreset[]>(cache ?? DEFAULT_SPECIAL_PRESETS);
  const [useRef, setUseRef] = useState(false);
  const [ref, setRef] = useState<{ name: string; dataUrl: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (cache) return;
    getSpecialPresets()
      .then((list) => {
        if (list.length) {
          cache = list;
          setPresets(list);
        }
      })
      .catch(() => undefined);
  }, []);

  const g = SPECIAL_GROUPS.find((x) => x.id === group)!;
  const refAllowed = g.supportsRef;

  const pickRef = async () => {
    const f = await pickImageAsDataUrl().catch(() => null);
    if (f) {
      setRef(f);
      setUseRef(true);
    }
  };

  const run = async (preset: SpecialPreset) => {
    if (busy) return;
    if (!checkCredits(PRICES.special)) return;
    if (refAllowed && useRef && !ref) return toast("warning", "Hãy chọn ảnh mẫu trước.");
    setBusy(true);
    try {
      const src = await captureSource({ maxSide: MAX_SIDE.special, selection: "optional", padding: 0.1 });
      const name = `${g.name} - ${preset.name}`;
      submitJob({
        kind: "special",
        label: name,
        cost: PRICES.special,
        target: toTarget(src, name),
        create: () =>
          createSpecialJob({ image: src.image, preset: preset.id, ref: refAllowed && useRef && ref ? ref.dataUrl : undefined }),
      });
      toast("info", `Đã gửi "${name}" vào hàng đợi.`);
    } catch (e) {
      toast("error", jobErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="panel-title">Special</div>
      <div className="panel-sub">
        Preset sẵn, bấm là chạy. Giá cố định <b style={{ color: "#ffd166" }}>{PRICES.special}đ/ảnh</b>.
      </div>
      <DocStatus />
      <div className="chips">
        {SPECIAL_GROUPS.map((x) => (
          <div key={x.id} className={"chip" + (group === x.id ? " on" : "")} onClick={() => setGroup(x.id)}>
            {x.ico} {x.name}
          </div>
        ))}
      </div>
      {refAllowed && (
        <div>
          <Toggle label="Theo ảnh mẫu" on={useRef} onChange={(on) => (on && !ref ? pickRef() : setUseRef(on))} />
          {useRef && ref && (
            <div className="ref-box">
              <img src={ref.dataUrl} />
              <div style={{ flex: 1 }} className="small">
                {ref.name}
              </div>
              <span className="link small" onClick={pickRef}>
                Đổi
              </span>
            </div>
          )}
        </div>
      )}
      {busy && <div className="info-box">Đang đọc ảnh từ Photoshop...</div>}
      <div style={{ marginTop: 6 }}>
        <PresetGrid presets={presets.filter((p) => p.group === group)} icon={g.ico} onPick={run} />
      </div>
    </div>
  );
}
