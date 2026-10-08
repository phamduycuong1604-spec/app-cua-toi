import React, { useEffect } from "react";
import { useStore } from "./state/store";
import { getMe } from "./api/auth";
import { hasToken, setSessionExpiredHandler } from "./api/client";
import { Header } from "./components/Layout/Header";
import { Sidebar } from "./components/Layout/Sidebar";
import { Toasts } from "./components/common/Toast";
import { JobQueue } from "./components/common/JobQueue";
import { LoginScreen } from "./components/Auth/LoginScreen";
import { HistoryOverlay } from "./components/Wallet/HistoryOverlay";
import { GenPanel } from "./components/Gen/GenPanel";
import { RetouchPanel } from "./components/Retouch/RetouchPanel";
import { SpecialPanel } from "./components/Special/SpecialPanel";
import { FreePanel } from "./components/Free/FreePanel";
import { UpscalePanel } from "./components/Upscale/UpscalePanel";
import { LoadingDots } from "./components/common/Button";

export function App() {
  const authStatus = useStore((s) => s.authStatus);
  const tab = useStore((s) => s.tab);
  const showHistory = useStore((s) => s.showHistory);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      const s = useStore.getState();
      if (s.authStatus === "loggedIn") s.toast("warning", "Phiên đăng nhập đã hết, hãy đăng nhập lại.");
      s.setAuth("loggedOut", null);
    });
    if (!hasToken()) {
      useStore.getState().setAuth("loggedOut", null);
      return;
    }
    getMe()
      .then((u) => useStore.getState().setAuth("loggedIn", u))
      .catch((e) => {
        useStore.getState().setAuth("loggedOut", null);
        if (e?.status !== 401) useStore.getState().toast("error", e?.message || "Không kết nối được máy chủ.");
      });
  }, []);

  return (
    <div className="app">
      <Header />
      {authStatus === "checking" && (
        <div className="content muted">
          <LoadingDots text="Đang kết nối PhaHa AI" />
        </div>
      )}
      {authStatus === "loggedOut" && <LoginScreen />}
      {authStatus === "loggedIn" && (
        <>
          <div className="app-body">
            <Sidebar />
            <div className="content">
              {tab === "gen" && <GenPanel />}
              {tab === "retouch" && <RetouchPanel />}
              {tab === "special" && <SpecialPanel />}
              {tab === "free" && <FreePanel />}
              {tab === "upscale" && <UpscalePanel />}
            </div>
          </div>
          <JobQueue />
        </>
      )}
      {showHistory && authStatus === "loggedIn" && <HistoryOverlay />}
      <Toasts />
    </div>
  );
}
