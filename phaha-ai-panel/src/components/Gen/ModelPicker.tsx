import React from "react";
import { PRICES, type GenModel } from "../../config";
import { Choice } from "../common/Toggle";

export function ModelPicker(p: { value: GenModel; onChange: (m: GenModel) => void }) {
  return (
    <div>
      <div className="section-title">Model</div>
      <Choice<GenModel>
        value={p.value}
        onChange={p.onChange}
        options={[
          { value: "gpt-image-2.5", title: "GPT Image 2.5", sub: `${PRICES.gen["gpt-image-2.5"]}đ · đẹp nhất` },
          { value: "gpt-image-2", title: "GPT Image 2", sub: `${PRICES.gen["gpt-image-2"]}đ · tiết kiệm` },
        ]}
      />
    </div>
  );
}
