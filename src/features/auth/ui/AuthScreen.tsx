// Sign-in screen (Google only). Shown when the user chooses to sign in; the app
// itself stays usable as a guest, so this is optional.

import { useState } from "react";
import { GoogleSignInButton } from "./GoogleSignInButton";

interface Props {
  onCredential: (credential: string) => Promise<void>;
  /** When provided, the screen renders as a dismissible modal (guest flow). */
  onClose?: () => void;
}

export function AuthScreen({ onCredential, onClose }: Props) {
  const [error, setError] = useState<string | null>(null);
  const isModal = onClose != null;

  async function handleCredential(credential: string) {
    setError(null);
    try {
      await onCredential(credential);
    } catch (err) {
      setError((err as Error).message);
    }
  }

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

        <div className="auth-google-wrap">
          <GoogleSignInButton onCredential={handleCredential} />
        </div>

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
