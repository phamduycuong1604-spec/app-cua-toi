import React, { useState } from "react";
import { login } from "../../api/auth";
import { getApiBase, setApiBase } from "../../api/client";
import { useStore } from "../../state/store";
import { Button } from "../common/Button";
import { openTopup } from "../../hooks/useCredits";

export function LoginScreen() {
  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem("phaha.lastEmail") || "";
    } catch {
      return "";
    }
  });
  const [password, setPassword] = useState("");
  const [server, setServer] = useState(getApiBase());
  const [showServer, setShowServer] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    if (!email.trim() || !password) {
      setError("Nhập email và mật khẩu.");
      return;
    }
    setApiBase(server);
    try {
      const user = await login(email.trim(), password);
      try {
        localStorage.setItem("phaha.lastEmail", email.trim());
      } catch {
        /* bỏ qua */
      }
      useStore.getState().setAuth("loggedIn", user);
      useStore.getState().toast("success", `Xin chào ${user.name || user.email}!`);
    } catch (e: any) {
      setError(e?.message || "Đăng nhập thất bại.");
    }
  };

  return (
    <div className="login">
      <img className="big-logo" src="icons/logo.png" />
      <h1>PhaHa AI</h1>
      <div className="muted">Sửa ảnh bằng AI ngay trong Photoshop. Một tài khoản, một ví điểm cho plugin, app và web.</div>

      <label className="field">Email</label>
      <input className="text" type="text" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ban@email.com" />
      <label className="field">Mật khẩu</label>
      <input
        className="text"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      {error && <div className="warn-box">{error}</div>}
      <Button variant="primary" big onClick={submit} loadingText="Đang đăng nhập">
        Đăng nhập
      </Button>

      <div className="row" style={{ marginTop: 12 }}>
        <span className="link" onClick={openTopup}>
          Chưa có tài khoản? Đăng ký trên web
        </span>
        <span className="spacer" />
        <span className="link small" onClick={() => setShowServer(!showServer)}>
          Máy chủ ⚙
        </span>
      </div>
      {showServer && (
        <div>
          <label className="field">Địa chỉ máy chủ PhaHa</label>
          <input className="text" type="text" value={server} onChange={(e) => setServer(e.target.value)} />
          <div className="muted small" style={{ marginTop: 4 }}>
            Thử nghiệm với máy chủ giả lập: http://localhost:8787 (chạy "npm run mock")
          </div>
        </div>
      )}
    </div>
  );
}
