import React from "react";
import { openTopup, useCredits } from "../../hooks/useCredits";

export function CreditBadge() {
  const credits = useCredits();
  return (
    <div className="credit-badge" title="Số điểm còn lại">
      <span className="num">{credits.toLocaleString("vi-VN")}đ</span>
      <span className="topup" onClick={openTopup}>
        + Nạp
      </span>
    </div>
  );
}
