// Modal "Premium" (#70): người dùng nhập mã để mở khoá đồng bộ từ điển cá nhân;
// admin sinh + xem danh sách mã. Yêu cầu đăng nhập — Premium gắn với tài khoản.

import { useEffect, useState } from "react";
import { useDialog } from "@/shared/ui/useDialog";
import { CloseIcon } from "@/shared/ui/icons";
import {
  redeemPremiumCode,
  generatePremiumCodes,
  listPremiumCodes,
  PremiumCode,
} from "../data/premium";

interface Props {
  loggedIn: boolean;
  isAdmin: boolean;
  isPremium: boolean;
  /** Gọi sau khi kích hoạt thành công để phiên/UI phản ánh trạng thái Premium. */
  onActivated: () => void;
  onRequestLogin: () => void;
  onClose: () => void;
}

export function PremiumModal({ loggedIn, isAdmin, isPremium, onActivated, onRequestLogin, onClose }: Props) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(isPremium);
  const dialogRef = useDialog<HTMLDivElement>(onClose);

  async function redeem() {
    const value = code.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    try {
      await redeemPremiumCode(value);
      setDone(true);
      setCode("");
      onActivated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="theme-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="theme-card" role="dialog" aria-modal="true" aria-label="Premium" tabIndex={-1} ref={dialogRef}>
        <header className="manager-head">
          <h2>Premium</h2>
          <button className="auth-close" aria-label="Đóng" onClick={onClose}><CloseIcon size={18} /></button>
        </header>

        {!loggedIn ? (
          <section className="theme-section">
            <p className="yk-hint">Cần đăng nhập để kích hoạt Premium cho tài khoản của bạn.</p>
            <button type="button" className="primary" onClick={onRequestLogin}>Đăng nhập</button>
          </section>
        ) : (
          <>
            <p className="yk-hint">
              Premium mở khoá <strong>đồng bộ từ điển cá nhân giữa các thiết bị</strong>. Tiến độ
              học (SRS) vẫn đồng bộ miễn phí như thường.
            </p>

            {done ? (
              <section className="theme-section">
                <p className="premium-status">✓ Tài khoản đã kích hoạt Premium.</p>
              </section>
            ) : (
              <section className="theme-section">
                <h3>Nhập mã kích hoạt</h3>
                <div className="url-row">
                  <input
                    className="url-input"
                    placeholder="VD: ABCD-EFGH-JKMN"
                    value={code}
                    disabled={busy}
                    onChange={(e) => setCode(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && redeem()}
                  />
                  <button className="primary" disabled={busy || !code.trim()} onClick={redeem}>
                    Kích hoạt
                  </button>
                </div>
                {error && <p className="yk-error">{error}</p>}
              </section>
            )}

            {isAdmin && <AdminCodes />}
          </>
        )}

        <footer className="theme-actions">
          <button type="button" className="primary" onClick={onClose}>Xong</button>
        </footer>
      </div>
    </div>
  );
}

/** Khu admin: sinh mã mới và xem trạng thái các mã đã cấp. */
function AdminCodes() {
  const [codes, setCodes] = useState<PremiumCode[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listPremiumCodes()
      .then((c) => alive && setCodes(c))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      await generatePremiumCodes(5);
      setCodes(await listPremiumCodes());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="theme-section">
      <h3>Mã kích hoạt (admin)</h3>
      <button type="button" className="link" onClick={generate} disabled={busy}>
        {busy ? "Đang tạo…" : "Tạo 5 mã mới"}
      </button>
      {error && <p className="yk-error">{error}</p>}
      {codes && codes.length > 0 && (
        <ul className="premium-code-list">
          {codes.map((c) => (
            <li key={c.code}>
              <code className={c.redeemed_by ? "used" : ""}>{c.code}</code>
              <span className="ld-meta">{c.redeemed_by ? "đã dùng" : "chưa dùng"}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
