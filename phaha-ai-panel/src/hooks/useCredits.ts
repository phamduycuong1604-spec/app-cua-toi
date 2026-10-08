import { useEffect } from "react";
import { shell } from "uxp";
import { CREDITS_REFRESH_MS, TOPUP_URL } from "../config";
import { refreshCredits } from "../jobs/manager";
import { useStore } from "../state/store";

/** Số điểm hiện tại + tự cập nhật định kỳ. */
export function useCredits() {
  const credits = useStore((s) => s.user?.credits ?? 0);
  const loggedIn = useStore((s) => s.authStatus === "loggedIn");
  useEffect(() => {
    if (!loggedIn) return;
    const t = setInterval(refreshCredits, CREDITS_REFRESH_MS);
    return () => clearInterval(t);
  }, [loggedIn]);
  return credits;
}

export function openTopup() {
  shell.openExternal(TOPUP_URL, "Mở trang nạp điểm PhaHa AI").catch(() => {
    useStore.getState().toast("error", "Không mở được trình duyệt. Hãy vào " + TOPUP_URL);
  });
}
