// Form gửi góp ý về web (#244): chọn loại (báo lỗi / ý tưởng / khác) + nội dung.
// Cần đăng nhập — góp ý nặc danh mở đường cho spam và admin cần biết hỏi lại ai;
// khách thấy lời mời đăng nhập thay vì form (như Premium), không bị chặn bất ngờ
// sau khi đã gõ.

import { useState } from "react";
import { useDialog } from "@/shared/ui/useDialog";
import { CheckIcon, CloseIcon } from "@/shared/ui/icons";
import { FEEDBACK_KINDS, FEEDBACK_MAX, FeedbackKind, checkFeedback } from "../domain/feedback";
import { sendFeedback } from "../data/feedback";
import "./feedback.css";

interface Props {
  loggedIn: boolean;
  onRequestLogin: () => void;
  onClose: () => void;
}

export function FeedbackDialog({ loggedIn, onRequestLogin, onClose }: Props) {
  const [kind, setKind] = useState<FeedbackKind>("idea");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const dialogRef = useDialog<HTMLDivElement>(onClose);

  async function send() {
    const check = checkFeedback({ kind, message });
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await sendFeedback(check.value);
      setSent(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="theme-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="theme-card" role="dialog" aria-modal="true" aria-label="Gửi góp ý" tabIndex={-1} ref={dialogRef}>
        <header className="manager-head">
          <h2>Gửi góp ý</h2>
          <button className="auth-close" aria-label="Đóng" onClick={onClose}><CloseIcon size={18} /></button>
        </header>

        {!loggedIn ? (
          <section className="theme-section">
            <p className="yk-hint">
              Cần đăng nhập để gửi góp ý — để chúng tôi hỏi lại bạn được khi cần làm rõ.
            </p>
            <button type="button" className="primary" onClick={onRequestLogin}>Đăng nhập</button>
          </section>
        ) : sent ? (
          <section className="theme-section">
            <p className="fb-sent icon-label">
              <CheckIcon size={14} /> Đã gửi góp ý. Cảm ơn bạn!
            </p>
          </section>
        ) : (
          <section className="theme-section fb-form">
            <p className="yk-hint">
              Bạn muốn sửa gì, hay cần thêm tính năng nào? Góp ý gửi thẳng tới người
              phát triển.
            </p>

            <fieldset className="fb-kinds">
              <legend>Loại góp ý</legend>
              {/* Hàng chip là div riêng, không phải chính fieldset: legend nằm trong
                  một fieldset display:flex bị mỗi trình duyệt xếp một kiểu. */}
              <div className="fb-kind-row">
                {FEEDBACK_KINDS.map((k) => (
                  <label key={k.kind} className={`fb-kind${kind === k.kind ? " active" : ""}`}>
                    <input
                      type="radio"
                      name="feedback-kind"
                      value={k.kind}
                      checked={kind === k.kind}
                      disabled={busy}
                      onChange={() => setKind(k.kind)}
                    />
                    {k.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="fb-message">
              <span>Nội dung</span>
              <textarea
                rows={6}
                value={message}
                maxLength={FEEDBACK_MAX}
                disabled={busy}
                placeholder="VD: muốn lọc bản đồ từ theo tag, hoặc nút Thêm nhanh không ăn trên điện thoại…"
                onChange={(e) => setMessage(e.target.value)}
              />
            </label>
            <p className="fb-count">{message.trim().length}/{FEEDBACK_MAX} ký tự</p>

            {error && <p className="yk-error">{error}</p>}

            <button type="button" className="primary" disabled={busy || !message.trim()} onClick={send}>
              {busy ? "Đang gửi…" : "Gửi góp ý"}
            </button>
          </section>
        )}

        <footer className="theme-actions">
          <button type="button" className="primary" onClick={onClose}>Xong</button>
        </footer>
      </div>
    </div>
  );
}
