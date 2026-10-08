import React, { useEffect, useState } from "react";
import { getTransactions } from "../../api/auth";
import type { Transaction } from "../../api/types";
import { useStore } from "../../state/store";
import { Button, LoadingDots } from "../common/Button";

export function HistoryOverlay() {
  const [items, setItems] = useState<Transaction[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    getTransactions()
      .then(setItems)
      .catch((e) => setError(e?.message || "Không tải được lịch sử."));
  }, []);
  return (
    <div className="overlay">
      <div className="row">
        <div className="panel-title">Lịch sử giao dịch</div>
        <span className="spacer" />
        <Button small onClick={() => useStore.getState().setShowHistory(false)}>
          Đóng
        </Button>
      </div>
      {error && <div className="warn-box">{error}</div>}
      {!items && !error && (
        <div className="muted" style={{ marginTop: 10 }}>
          <LoadingDots text="Đang tải" />
        </div>
      )}
      {items && items.length === 0 && <div className="muted">Chưa có giao dịch.</div>}
      {items?.map((t) => (
        <div className="tx" key={t.id}>
          <div style={{ flex: 1 }}>
            <div>{t.description}</div>
            <div className="muted small">{new Date(t.created_at).toLocaleString("vi-VN")}</div>
          </div>
          <div className={"amt " + (t.amount >= 0 ? "plus" : "minus")}>
            {t.amount >= 0 ? "+" : ""}
            {t.amount}đ
          </div>
        </div>
      ))}
    </div>
  );
}
