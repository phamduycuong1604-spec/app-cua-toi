import React from "react";
import { PRICES } from "../../config";
import { Toggle } from "../common/Toggle";
import { pickImageAsDataUrl } from "../../photoshop/files";
import { useStore } from "../../state/store";

export interface GenOptions {
  faceLock: boolean;
  onlySelection: boolean;
  useRef: boolean;
  ref: { name: string; dataUrl: string } | null;
}

export function OptionsRow(p: { value: GenOptions; onChange: (v: GenOptions) => void; hideFaceLock?: boolean }) {
  const v = p.value;
  const set = (patch: Partial<GenOptions>) => p.onChange({ ...v, ...patch });

  const pickRef = async () => {
    try {
      const f = await pickImageAsDataUrl();
      if (f) set({ useRef: true, ref: f });
      else if (!v.ref) set({ useRef: false });
    } catch (e: any) {
      useStore.getState().toast("error", "Không đọc được ảnh: " + (e?.message || e));
    }
  };

  return (
    <div>
      <div className="section-title">Tùy chọn</div>
      {!p.hideFaceLock && (
        <Toggle label="Giữ mặt gốc" tag={`+${PRICES.faceLock}đ`} on={v.faceLock} onChange={(on) => set({ faceLock: on })} />
      )}
      <Toggle label="Chỉ sửa vùng chọn" on={v.onlySelection} onChange={(on) => set({ onlySelection: on })} />
      <Toggle
        label="Ảnh tham chiếu"
        on={v.useRef}
        onChange={(on) => {
          if (on && !v.ref) pickRef();
          else set({ useRef: on });
        }}
      />
      {v.useRef && v.ref && (
        <div className="ref-box">
          <img src={v.ref.dataUrl} />
          <div style={{ flex: 1, minWidth: 0 }} className="small">
            {v.ref.name}
          </div>
          <span className="link small" onClick={pickRef}>
            Đổi
          </span>
        </div>
      )}
    </div>
  );
}
