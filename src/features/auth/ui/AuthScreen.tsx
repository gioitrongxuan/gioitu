// Sign-in screen (Google only). Shown when the user chooses to sign in; the app
// itself stays usable as a guest, so this is optional.

import { useEffect, useState } from "react";
import { getAuthConfig } from "../data/auth";
import { useDialog } from "@/shared/ui/useDialog";
import { CloseIcon } from "@/shared/ui/icons";
import { GoogleSignInButton } from "./GoogleSignInButton";

interface Props {
  onCredential: (credential: string) => Promise<void>;
  /** Dev-only sign-in (no Google); the button appears only when the server enables it. */
  onDevLogin?: () => Promise<void>;
  /** When provided, the screen renders as a dismissible modal (guest flow). */
  onClose?: () => void;
  /** Lý do mở màn đăng nhập (vd phiên hết hạn) — hiện như banner nhắc nhở. */
  notice?: string | null;
}

export function AuthScreen({ onCredential, onDevLogin, onClose, notice }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [devEnabled, setDevEnabled] = useState(false);
  const isModal = onClose != null;
  // Chỉ gắn ref (bên dưới) khi isModal — màn toàn trang không cần bẫy focus.
  const dialogRef = useDialog<HTMLDivElement>(onClose ?? (() => {}));

  useEffect(() => {
    let alive = true;
    getAuthConfig().then((c) => alive && setDevEnabled(c.dev_login));
    return () => {
      alive = false;
    };
  }, []);

  async function handleCredential(credential: string) {
    setError(null);
    try {
      await onCredential(credential);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleDevLogin() {
    setError(null);
    try {
      await onDevLogin?.();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div
      className={isModal ? "auth-overlay" : "auth-screen"}
      onClick={isModal ? (e) => e.target === e.currentTarget && onClose!() : undefined}
    >
      <div className="auth-card" {...(isModal ? { role: "dialog", "aria-modal": true, tabIndex: -1, ref: dialogRef } : {})}>
        {isModal && (
          <button type="button" className="auth-close" aria-label="Đóng" onClick={onClose}>
            <CloseIcon size={18} />
          </button>
        )}
        <h1>Gioitu</h1>
        <p className="muted">Từ điển cá nhân hóa + ôn tập lặp lại ngắt quãng</p>

        {notice && <p className="auth-notice">{notice}</p>}

        <div className="auth-google-wrap">
          <GoogleSignInButton onCredential={handleCredential} />
        </div>

        {devEnabled && onDevLogin && (
          <button type="button" className="auth-dev-login" onClick={handleDevLogin}>
            Đăng nhập dev (admin)
          </button>
        )}

        {error && <p className="auth-error">{error}</p>}

        <p className="muted small">
          Đăng nhập bằng Google để đồng bộ tiến trình học của bạn trên mọi thiết bị.
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
