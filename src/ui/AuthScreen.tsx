// Login / Register screen (email + password). Shown when not authenticated.

import { useState } from "react";

interface Props {
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (email: string, password: string) => Promise<void>;
  /** When provided, the screen renders as a dismissible modal (guest flow). */
  onClose?: () => void;
}

export function AuthScreen({ onLogin, onRegister, onClose }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") await onLogin(email.trim(), password);
      else await onRegister(email.trim(), password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const isModal = onClose != null;

  return (
    <div
      className={isModal ? "auth-overlay" : "auth-screen"}
      onClick={isModal ? (e) => e.target === e.currentTarget && onClose!() : undefined}
    >
      <div className="auth-card">
        {isModal && (
          <button type="button" className="auth-close" aria-label="Đóng" onClick={onClose}>
            ×
          </button>
        )}
        <h1>Gioitu</h1>
        <p className="muted">Từ điển cá nhân hóa + ôn tập lặp lại ngắt quãng</p>

        <div className="auth-tabs">
          <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>
            Đăng nhập
          </button>
          <button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>
            Đăng ký
          </button>
        </div>

        <form onSubmit={submit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Mật khẩu
            <input
              type="password"
              value={password}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
            />
          </label>

          {error && <p className="auth-error">{error}</p>}

          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Đang xử lý…" : mode === "login" ? "Đăng nhập" : "Tạo tài khoản"}
          </button>
        </form>

        <p className="muted small">
          Đăng nhập để đồng bộ tiến trình học của bạn trên mọi thiết bị.
          {isModal && " Tiến trình bạn đã học khi dùng thử sẽ được giữ lại."}
        </p>

        {isModal && (
          <button type="button" className="link auth-guest" onClick={onClose}>
            Tiếp tục với tư cách khách
          </button>
        )}
      </div>
    </div>
  );
}
