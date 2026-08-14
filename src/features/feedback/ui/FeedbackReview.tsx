// Màn đọc góp ý của người dùng (#244), chỉ admin. Mới nhất trước; mặc định chỉ
// phần đang chờ (việc còn phải làm), bật ô "Hiện cả đã xử lý" để xem lại quá khứ.

import { useEffect, useState } from "react";
import { Skeleton } from "@/shared/ui/Skeleton";
import { useDialog } from "@/shared/ui/useDialog";
import { CheckIcon, CloseIcon } from "@/shared/ui/icons";
import { formatTimeAgo } from "@/shared/format";
import { kindLabel } from "../domain/feedback";
import { Feedback, listFeedback, markFeedbackHandled } from "../data/feedback";
import "./feedback.css";

export function FeedbackReview({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<Feedback[] | null>(null);
  const [showHandled, setShowHandled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const dialogRef = useDialog<HTMLDivElement>(onClose);

  useEffect(() => {
    let alive = true;
    setItems(null);
    setError(null);
    listFeedback(showHandled)
      .then((f) => alive && setItems(f))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [showHandled]);

  async function handle(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await markFeedbackHandled(id);
      // Đang ẩn phần đã xử lý thì gỡ khỏi danh sách; đang hiện thì chỉ đổi trạng
      // thái tại chỗ — danh sách không nhảy khi admin vừa đánh dấu vừa đọc lại.
      setItems((list) =>
        (list ?? []).flatMap((f) =>
          f.id !== id ? [f] : showHandled ? [{ ...f, status: "handled" }] : [],
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="theme-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="theme-card" role="dialog" aria-modal="true" aria-label="Góp ý người dùng" tabIndex={-1} ref={dialogRef}>
        <header className="manager-head">
          <h2>Góp ý người dùng</h2>
          <button className="auth-close" aria-label="Đóng" onClick={onClose}><CloseIcon size={18} /></button>
        </header>

        <section className="theme-section">
          <label className="fb-toggle">
            <input
              type="checkbox"
              checked={showHandled}
              onChange={(e) => setShowHandled(e.target.checked)}
            />
            Hiện cả đã xử lý
          </label>

          {error && <p className="yk-error">{error}</p>}
          {!items && !error && <Skeleton lines={3} />}
          {items && items.length === 0 && (
            <p className="yk-hint">
              {showHandled ? "Chưa có góp ý nào." : "Không có góp ý nào đang chờ."}
            </p>
          )}
          {items && items.length > 0 && (
            <ul className="fb-list">
              {items.map((f) => (
                <li key={f.id} className="fb-item">
                  <div className="fb-item-meta">
                    <span className="fb-chip">{kindLabel(f.kind)}</span>
                    <span className="fb-author">{f.email ?? f.user_id}</span>
                    <span className="fb-time">{formatTimeAgo(f.created_at)}</span>
                  </div>
                  <p className="fb-item-body">{f.message}</p>
                  {f.status === "new" ? (
                    <button className="link" disabled={busyId === f.id} onClick={() => handle(f.id)}>
                      Đánh dấu đã xử lý
                    </button>
                  ) : (
                    <span className="fb-done icon-label"><CheckIcon size={14} /> Đã xử lý</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="theme-actions">
          <button type="button" className="primary" onClick={onClose}>Xong</button>
        </footer>
      </div>
    </div>
  );
}
