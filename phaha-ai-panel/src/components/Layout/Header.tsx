import React, { useState } from "react";
import { useStore } from "../../state/store";
import { CreditBadge } from "../common/CreditBadge";
import { logout } from "../../api/auth";
import { openTopup } from "../../hooks/useCredits";
import { refreshCredits } from "../../jobs/manager";
import { getApiBase } from "../../api/client";

export function Header() {
  const user = useStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const initial = (user?.name || user?.email || "?").trim().charAt(0).toUpperCase();
  const close = () => setOpen(false);
  return (
    <div className="header">
      <img className="logo" src="icons/logo.png" />
      <div className="brand">
        PhaHa <span>AI</span>
      </div>
      {user && <CreditBadge />}
      {user && (
        <div className="avatar" onClick={() => setOpen(!open)} title={user.email}>
          {user.avatar_url ? <img src={user.avatar_url} /> : initial}
        </div>
      )}
      {open && user && (
        <div className="menu">
          <div className="menu-info">
            {user.name}
            <br />
            <span className="small">{user.email}</span>
          </div>
          <div className="menu-sep" />
          <div className="menu-item" onClick={() => (refreshCredits(), close())}>
            🔄 Cập nhật số điểm
          </div>
          <div className="menu-item" onClick={() => (openTopup(), close())}>
            💳 Nạp điểm
          </div>
          <div className="menu-item" onClick={() => (useStore.getState().setShowHistory(true), close())}>
            🧾 Lịch sử giao dịch
          </div>
          <div className="menu-sep" />
          <div className="menu-info small">Máy chủ: {getApiBase()}</div>
          <div
            className="menu-item"
            onClick={() => {
              logout();
              useStore.getState().setAuth("loggedOut", null);
              close();
            }}
          >
            🚪 Đăng xuất
          </div>
        </div>
      )}
    </div>
  );
}
