// Form đánh giá ứng dụng (#245): chấm 1-5 sao + nhận xét ngắn tuỳ chọn.
// Cần đăng nhập — mỗi người một phiếu (gửi lại là sửa phiếu cũ), mà nặc danh
// thì không giữ được điều đó; khách thấy lời mời đăng nhập thay vì form (như
// Premium), không bị chặn bất ngờ sau khi đã gõ.

import { useEffect, useState } from "react";
import { Skeleton } from "@/shared/ui/Skeleton";
import { useDialog } from "@/shared/ui/useDialog";
import { CheckIcon, CloseIcon, StarIcon } from "@/shared/ui/icons";
import { RATING_NOTE_MAX, RATING_STARS, checkRating, starLabel } from "../domain/rating";
import { myRating, sendRating } from "../data/rating";
import "./rating.css";

interface Props {
  loggedIn: boolean;
  onRequestLogin: () => void;
  onClose: () => void;
}

export function RatingDialog({ loggedIn, onRequestLogin, onClose }: Props) {
  const [stars, setStars] = useState<number | null>(null);
  const [note, setNote] = useState("");
  // null = đang tải đánh giá cũ; false = chưa từng đánh giá (hoặc chưa đăng nhập).
  const [rated, setRated] = useState<boolean | null>(loggedIn ? null : false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const dialogRef = useDialog<HTMLDivElement>(onClose);

  // Mở form ra là thấy sẵn thứ mình từng gửi — đánh giá là một phiếu sửa được,
  // không phải sổ ghi thêm mỗi lần một dòng.
  useEffect(() => {
    if (!loggedIn) return;
    let alive = true;
    myRating()
      .then((r) => {
        if (!alive) return;
        setRated(r != null);
        if (r) {
          setStars(r.stars);
          setNote(r.note ?? "");
        }
      })
      .catch((e: Error) => {
        if (!alive) return;
        // Không đọc được phiếu cũ thì vẫn cho đánh giá (gửi lên là upsert, không
        // mất gì) — chỉ nói rõ vì sao form trống.
        setRated(false);
        setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [loggedIn]);

  async function send() {
    const check = checkRating({ stars, note });
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await sendRating(check.value);
      setSaved(true);
      setRated(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="theme-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="theme-card" role="dialog" aria-modal="true" aria-label="Đánh giá ứng dụng" tabIndex={-1} ref={dialogRef}>
        <header className="manager-head">
          <h2>Đánh giá ứng dụng</h2>
          <button className="auth-close" aria-label="Đóng" onClick={onClose}><CloseIcon size={18} /></button>
        </header>

        {!loggedIn ? (
          <section className="theme-section">
            <p className="yk-hint">
              Cần đăng nhập để đánh giá — mỗi tài khoản một phiếu, và bạn sửa lại
              được bất cứ lúc nào.
            </p>
            <button type="button" className="primary" onClick={onRequestLogin}>Đăng nhập</button>
          </section>
        ) : rated == null ? (
          <section className="theme-section"><Skeleton lines={3} /></section>
        ) : (
          <section className="theme-section rt-form">
            <p className="yk-hint">
              {rated && !saved
                ? "Bạn đã đánh giá trước đó — gửi lại sẽ thay cho phiếu cũ."
                : "Bạn thấy ứng dụng thế nào? Đánh giá gửi thẳng tới người phát triển."}
            </p>

            <fieldset className="rt-stars">
              <legend>Mức đánh giá</legend>
              {/* Hàng sao là div riêng, không phải chính fieldset: legend nằm trong
                  một fieldset display:flex bị mỗi trình duyệt xếp một kiểu. */}
              <div className="rt-star-row">
                {RATING_STARS.map((s) => (
                  <label key={s.stars} className={`rt-star${stars != null && s.stars <= stars ? " on" : ""}`}>
                    <input
                      type="radio"
                      name="app-rating"
                      value={s.stars}
                      checked={stars === s.stars}
                      disabled={busy}
                      onChange={() => {
                        setStars(s.stars);
                        setSaved(false);
                      }}
                    />
                    <StarIcon size={28} filled={stars != null && s.stars <= stars} />
                    <span className="rt-star-text">{s.stars} sao — {s.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            {stars != null && <p className="rt-caption">{stars}/5 · {starLabel(stars)}</p>}

            <label className="rt-note">
              <span>Nhận xét (không bắt buộc)</span>
              <textarea
                rows={4}
                value={note}
                maxLength={RATING_NOTE_MAX}
                disabled={busy}
                placeholder="VD: bản đồ từ dễ nhìn, nhưng muốn ôn được theo chủ đề…"
                onChange={(e) => {
                  setNote(e.target.value);
                  setSaved(false);
                }}
              />
            </label>
            <p className="rt-count">{note.trim().length}/{RATING_NOTE_MAX} ký tự</p>

            {error && <p className="yk-error">{error}</p>}
            {saved && (
              <p className="rt-saved icon-label"><CheckIcon size={14} /> Đã lưu đánh giá. Cảm ơn bạn!</p>
            )}

            <button type="button" className="primary" disabled={busy || stars == null} onClick={send}>
              {busy ? "Đang gửi…" : rated ? "Cập nhật đánh giá" : "Gửi đánh giá"}
            </button>
          </section>
        )}

        <footer className="rt-actions">
          <button type="button" className="primary" onClick={onClose}>Xong</button>
        </footer>
      </div>
    </div>
  );
}
