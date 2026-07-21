// Skeleton shimmer — placeholder khi một vùng nội dung đang tải, thay cho
// text "Đang tải…" trơ (DESIGN §3.9). `role="status"` + `aria-label` giữ
// nguyên thông báo cho trình đọc màn hình dù không còn chữ hiện trên mặt.

interface Props {
  /** Số dòng shimmer xếp chồng (mặc định 1). Dòng sau ngắn dần cho tự nhiên. */
  lines?: number;
  className?: string;
}

export function Skeleton({ lines = 1, className }: Props) {
  return (
    <div className={`skeleton${className ? ` ${className}` : ""}`} role="status" aria-label="Đang tải…">
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="skeleton-line" />
      ))}
    </div>
  );
}
