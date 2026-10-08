import React, { useEffect, useState } from "react";

/** Ba chấm nhảy (thay cho spinner — UXP hỗ trợ animation CSS hạn chế). */
export function LoadingDots({ text = "Đang xử lý" }: { text?: string }) {
  const [n, setN] = useState(1);
  useEffect(() => {
    const t = setInterval(() => setN((v) => (v % 3) + 1), 350);
    return () => clearInterval(t);
  }, []);
  return <span>{text + ".".repeat(n)}</span>;
}

interface Props {
  children: React.ReactNode;
  onClick?: () => void | Promise<unknown>;
  variant?: "primary" | "ghost" | "danger" | "default";
  big?: boolean;
  small?: boolean;
  disabled?: boolean;
  loading?: boolean;
  loadingText?: string;
  /** Hiện giá điểm ở góc nút, vd 15 → "15đ" */
  price?: number;
  title?: string;
  style?: React.CSSProperties;
}

/** Nút bấm: tự hiện "Đang xử lý..." khi onClick trả về Promise chưa xong. */
export function Button(p: Props) {
  const [busy, setBusy] = useState(false);
  const loading = p.loading || busy;
  const disabled = p.disabled || loading;
  const cls = ["btn", p.variant && p.variant !== "default" ? p.variant : "", p.big ? "big" : "", p.small ? "small" : "", disabled ? "disabled" : ""]
    .filter(Boolean)
    .join(" ");
  const click = async () => {
    if (disabled || !p.onClick) return;
    const r = p.onClick();
    if (r && typeof (r as Promise<unknown>).then === "function") {
      setBusy(true);
      try {
        await r;
      } catch {
        /* lỗi đã được báo bằng toast */
      } finally {
        setBusy(false);
      }
    }
  };
  return (
    <div className={cls} onClick={click} title={p.title} style={p.style}>
      {loading ? <LoadingDots text={p.loadingText} /> : p.children}
      {!loading && p.price != null && <span className="price">{p.price === 0 ? "Miễn phí" : `${p.price}đ`}</span>}
    </div>
  );
}
