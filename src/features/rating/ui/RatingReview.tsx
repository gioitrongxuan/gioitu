// Màn đọc đánh giá của người dùng (#245), chỉ admin: điểm trung bình + phân bố
// theo mức sao (tính trên toàn bộ phiếu), rồi danh sách phiếu mới sửa gần nhất
// trước — chỉ những phiếu có nhận xét mới đáng đọc từng dòng, nhưng vẫn hiện cả
// phiếu chấm suông để con số khớp thứ nhìn thấy.

import { useEffect, useState } from "react";
import { Skeleton } from "@/shared/ui/Skeleton";
import { useDialog } from "@/shared/ui/useDialog";
import { CloseIcon, StarIcon } from "@/shared/ui/icons";
import { formatTimeAgo } from "@/shared/format";
import { RatingSummary, distributionRows, formatAverage, starLabel } from "../domain/rating";
import { Rating, listRatings } from "../data/rating";
import "./rating.css";

export function RatingReview({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<{ summary: RatingSummary; items: Rating[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useDialog<HTMLDivElement>(onClose);

  useEffect(() => {
    let alive = true;
    listRatings()
      .then((d) => alive && setData(d))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="theme-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="theme-card" role="dialog" aria-modal="true" aria-label="Đánh giá của người dùng" tabIndex={-1} ref={dialogRef}>
        <header className="manager-head">
          <h2>Đánh giá của người dùng</h2>
          <button className="auth-close" aria-label="Đóng" onClick={onClose}><CloseIcon size={18} /></button>
        </header>

        <section className="theme-section">
          {error && <p className="yk-error">{error}</p>}
          {!data && !error && <Skeleton lines={4} />}
          {data && (
            <>
              <div className="rt-summary">
                <span className="rt-average">{formatAverage(data.summary)}</span>
                <span className="rt-total">
                  {data.summary.count > 0 ? `${data.summary.count} đánh giá` : "Chưa có đánh giá nào"}
                </span>
              </div>

              <ul className="rt-dist">
                {distributionRows(data.summary).map((row) => (
                  <li key={row.stars}>
                    <span className="rt-dist-label icon-label">
                      {row.stars} <StarIcon size={14} filled />
                    </span>
                    <span className="rt-dist-bar">
                      <span style={{ width: `${row.percent}%` }} />
                    </span>
                    <span className="rt-dist-count">{row.count}</span>
                  </li>
                ))}
              </ul>

              {data.items.length > 0 && (
                <ul className="rt-list">
                  {data.items.map((r) => (
                    <li key={r.user_id} className="rt-item">
                      <div className="rt-item-meta">
                        <span className="rt-chip">{r.stars}/5 · {starLabel(r.stars)}</span>
                        <span className="rt-author">{r.email ?? r.user_id}</span>
                        <span className="rt-time">{formatTimeAgo(r.updated_at)}</span>
                      </div>
                      {r.note && <p className="rt-item-body">{r.note}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>

        <footer className="rt-actions">
          <button type="button" className="primary" onClick={onClose}>Xong</button>
        </footer>
      </div>
    </div>
  );
}
