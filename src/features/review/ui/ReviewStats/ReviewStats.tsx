// Thống kê ôn tập (#163): overlay đọc `review_log` (IndexedDB, cục bộ) + danh
// sách entry rồi vẽ ba biểu đồ SVG thuần — tỉ lệ nhớ theo ngày, dự báo đến hạn
// 7 ngày, đường luỹ kế từ đã thuộc. Mọi phép tính nằm ở domain/reviewStats.ts;
// ở đây chỉ đọc dữ liệu (một lần lúc mở) và dựng hình.
// Mục "Nâng cao" (#165) gate Premium: retention theo khoảng ôn + tải CSV lịch
// sử — người thường thấy khối mờ (dữ liệu thật, không tương tác) + lời mời.

import { useEffect, useMemo, useState } from "react";
import { useDialog } from "@/shared/ui/useDialog";
import { CloseIcon, LockIcon } from "@/shared/ui/icons";
import { Skeleton } from "@/shared/ui/Skeleton";
import { ReviewLogEntry, VocabEntry } from "@/shared/types";
import { getReviewLog } from "../../data/reviewLog";
import { reviewLogToCsv } from "../../domain/reviewLog";
import {
  RetentionDay,
  ForecastDay,
  LearnedDay,
  IntervalRetention,
  retentionByDay,
  retentionByInterval,
  retentionRate,
  summarizeRetention,
  countReviewsSince,
  forecastDueByDay,
  learnedOverTime,
  contiguousRuns,
  shortDate,
  forecastDayLabel,
  STATS_WINDOW_DAYS,
} from "../../domain/reviewStats";
import "./reviewstats.css";

interface Props {
  userId: string;
  entries: VocabEntry[];
  /** Mở khoá mục "Nâng cao" (retention theo khoảng ôn + tải CSV lịch sử). */
  isPremium: boolean;
  /** Mở trang giá trị Premium khi người chưa kích hoạt bấm "Tìm hiểu Premium". */
  onOpenPremium: () => void;
  onClose: () => void;
}

// Hệ toạ độ CHUNG cho cả ba biểu đồ (đơn vị viewBox, svg co giãn theo card).
const VIEW_W = 560;
const VIEW_H = 170;
const PAD = { left: 36, right: 8, top: 14, bottom: 24 };
const PLOT_W = VIEW_W - PAD.left - PAD.right;
const PLOT_H = VIEW_H - PAD.top - PAD.bottom;
const BASELINE_Y = PAD.top + PLOT_H;

/** Tâm cột/điểm của ngày thứ `i` trong `n` ngày. */
const xOf = (i: number, n: number) => PAD.left + ((i + 0.5) * PLOT_W) / n;

/** Toạ độ y của một giá trị trên thang [0, max]. */
const yOf = (value: number, max: number) => BASELINE_Y - (value / max) * PLOT_H;

/** Cột chữ nhật bo tròn hai góc TRÊN, chân neo vào baseline (DESIGN dataviz). */
function roundedTopBar(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, h, w / 2);
  return [
    `M${x},${y + h}`,
    `V${y + rr}`,
    `Q${x},${y} ${x + rr},${y}`,
    `H${x + w - rr}`,
    `Q${x + w},${y} ${x + w},${y + rr}`,
    `V${y + h}`,
    "Z",
  ].join(" ");
}

const pct = (rate: number) => Math.round(rate * 100);

/** Tên file CSV theo ngày, cùng quy ước với tệp sao lưu JSON. */
function csvFilename(now: number): string {
  return `gioitu-review-log-${new Date(now).toISOString().slice(0, 10)}.csv`;
}

/** Đẩy CSV xuống trình duyệt; BOM đầu file để Excel nhận UTF-8 (từ vựng JA/VI). */
function downloadCsv(log: ReviewLogEntry[], now: number): void {
  const blob = new Blob(["\uFEFF" + reviewLogToCsv(log)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = csvFilename(now);
  a.click();
  URL.revokeObjectURL(url);
}

export function ReviewStats({ userId, entries, isPremium, onOpenPremium, onClose }: Props) {
  const dialogRef = useDialog<HTMLDivElement>(onClose);
  // Chụp "bây giờ" một lần lúc mở: mọi biểu đồ cùng một mốc, không trôi giữa render.
  const [now] = useState(() => Date.now());
  const [log, setLog] = useState<ReviewLogEntry[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    getReviewLog(userId)
      .then(setLog)
      .catch((e) => {
        console.error("read review_log failed", e);
        setLoadFailed(true);
      });
  }, [userId]);

  const retention = useMemo(() => (log ? retentionByDay(log, now) : null), [log, now]);
  const forecast = useMemo(() => forecastDueByDay(entries, now), [entries, now]);
  const learned = useMemo(() => learnedOverTime(entries, now), [entries, now]);
  const byInterval = useMemo(() => (log ? retentionByInterval(log, now) : null), [log, now]);

  const summary = retention ? summarizeRetention(retention) : null;
  const overallRate = summary ? retentionRate(summary) : null;
  const reviewsInWindow =
    log && retention ? countReviewsSince(log, retention[0].dayStart) : null;
  const learnedNow = learned[learned.length - 1].cumulative;
  const dueNext7 = forecast.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="manager-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="manager-card rs-card"
        role="dialog"
        aria-modal="true"
        aria-label="Thống kê ôn tập"
        tabIndex={-1}
        ref={dialogRef}
      >
        <header className="manager-head">
          <h2>Thống kê ôn tập</h2>
          <button className="auth-close" aria-label="Đóng" onClick={onClose}>
            <CloseIcon size={18} />
          </button>
        </header>

        {loadFailed ? (
          <p className="rs-error" role="alert">
            Không đọc được nhật ký ôn tập trên máy. Hãy tải lại trang rồi thử lại.
          </p>
        ) : log == null || retention == null ? (
          <Skeleton lines={4} className="rs-loading" />
        ) : (
          <>
            <div className="rs-tiles">
              <StatTile
                label={`Tỉ lệ nhớ · ${STATS_WINDOW_DAYS} ngày`}
                value={overallRate != null ? `${pct(overallRate)}%` : "—"}
                detail={
                  summary && summary.total > 0
                    ? `${summary.remembered}/${summary.total} lượt`
                    : "chưa có lượt nào"
                }
              />
              <StatTile
                label={`Lượt ôn · ${STATS_WINDOW_DAYS} ngày`}
                value={String(reviewsInWindow ?? 0)}
                detail="tính cả bước học"
              />
              <StatTile label="Đã thuộc" value={String(learnedNow)} detail="từ hiện tại" seal />
              <StatTile label="Đến hạn · 7 ngày tới" value={String(dueNext7)} detail="thẻ chờ ôn" />
            </div>

            <section className="rs-section">
              <h3>Tỉ lệ nhớ theo ngày</h3>
              {summary && summary.total > 0 ? (
                <>
                  <RetentionChart days={retention} />
                  <p className="rs-note">
                    Chỉ tính lượt ôn thẻ đã vào giai đoạn REVIEW (khoảng ôn ≥ 1 ngày);
                    các bước học 1–10 phút không tính.
                  </p>
                </>
              ) : (
                <p className="rs-empty">
                  Chưa có dữ liệu — hoàn thành vài phiên ôn với thẻ đã qua bước học để
                  thấy tỉ lệ nhớ ở đây.
                </p>
              )}
            </section>

            <section className="rs-section">
              <h3>Dự báo đến hạn 7 ngày tới</h3>
              {dueNext7 > 0 ? (
                <ForecastChart days={forecast} />
              ) : (
                <p className="rs-empty">Không có thẻ nào đến hạn trong 7 ngày tới.</p>
              )}
            </section>

            <section className="rs-section">
              <h3>Từ đã thuộc theo thời gian</h3>
              {learnedNow > 0 ? (
                <LearnedChart days={learned} />
              ) : (
                <p className="rs-empty">Chưa có từ nào đạt mức đã thuộc.</p>
              )}
            </section>

            <section className="rs-section">
              <h3>Nâng cao · Premium</h3>
              <div className="rs-premium">
                {/* Nội dung thật cho cả hai phía: Premium dùng được, người thường
                    thấy mờ (dữ liệu là của chính họ nên không có gì phải giấu —
                    khoá nằm ở thao tác, không ở bí mật). */}
                <div
                  className={isPremium ? undefined : "rs-premium-dimmed"}
                  {...(isPremium ? {} : { inert: "", "aria-hidden": true })}
                >
                  {byInterval && <IntervalRetentionList rows={byInterval} />}
                  <p className="rs-note">
                    Tỉ lệ nhớ tách theo khoảng ôn ({STATS_WINDOW_DAYS} ngày gần nhất): nhóm nào
                    tụt sâu là chỗ đang rò rỉ — thẻ non (vài ngày) yếu thì nên ôn dày hơn, thẻ
                    chín (vài tháng) yếu là dấu hiệu học vẹt.
                  </p>
                  <button
                    type="button"
                    className="link"
                    disabled={!isPremium || log == null || log.length === 0}
                    onClick={() => log && downloadCsv(log, now)}
                  >
                    Tải toàn bộ lịch sử ôn (CSV · {log?.length ?? 0} lượt)
                  </button>
                </div>
                {!isPremium && (
                  <div className="rs-premium-gate">
                    <LockIcon size={16} />
                    <p>Thống kê nâng cao và xuất lịch sử ôn dành cho Premium.</p>
                    <button type="button" className="primary" onClick={onOpenPremium}>
                      Tìm hiểu Premium
                    </button>
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

/** Bảng retention theo khoảng ôn — thanh ngang thuần div, không cần hệ toạ độ SVG.
 *  Export cùng lý do với ba chart: SSR smoke test render độc lập được. */
export function IntervalRetentionList({ rows }: { rows: IntervalRetention[] }) {
  return (
    <ul className="rs-bands">
      {rows.map((r) => {
        const rate = retentionRate(r);
        return (
          <li key={r.band.label}>
            <span className="rs-band-label">{r.band.label}</span>
            <span className="rs-band-bar" aria-hidden>
              {rate != null && <span style={{ width: `${pct(rate)}%` }} />}
            </span>
            <span className="rs-band-value">{rate != null ? `${pct(rate)}%` : "—"}</span>
            <span className="rs-band-detail">
              {r.total > 0 ? `${r.remembered}/${r.total} lượt` : "chưa có lượt"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function StatTile({
  label,
  value,
  detail,
  seal = false,
}: {
  label: string;
  value: string;
  detail: string;
  seal?: boolean;
}) {
  return (
    <div className="rs-tile">
      <span className="rs-tile-label">{label}</span>
      <span className={`rs-tile-value${seal ? " rs-tile-value-seal" : ""}`}>{value}</span>
      <span className="rs-tile-detail">{detail}</span>
    </div>
  );
}

/**
 * Nhãn trục ngày ở ba mốc đầu/giữa/cuối — đủ định vị, không rối chân trục.
 * Hai nhãn biên neo vào mép vùng vẽ (start/end) để không tràn khỏi viewBox.
 */
function TimeAxisLabels({ days }: { days: { dayStart: number }[] }) {
  const n = days.length;
  const marks: { i: number; x: number; anchor: "start" | "middle" | "end" }[] = [
    { i: 0, x: PAD.left, anchor: "start" },
    { i: Math.floor((n - 1) / 2), x: xOf(Math.floor((n - 1) / 2), n), anchor: "middle" },
    { i: n - 1, x: VIEW_W - PAD.right, anchor: "end" },
  ];
  return (
    <>
      {marks.map(({ i, x, anchor }) => (
        <text key={i} className="rs-axis" x={x} y={VIEW_H - 8} textAnchor={anchor}>
          {i === n - 1 ? "Hôm nay" : shortDate(days[i].dayStart)}
        </text>
      ))}
    </>
  );
}

// Ba component biểu đồ export để test render được từng cái độc lập (SSR smoke
// test — không cần IndexedDB hay DOM); trong app chỉ ReviewStats dùng chúng.

export function RetentionChart({ days }: { days: RetentionDay[] }) {
  const n = days.length;
  // Thang cố định 0–100%: retention là tỉ lệ, zoom trục chỉ phóng đại nhiễu.
  const y = (rate: number) => yOf(rate * 100, 100);
  const runs = contiguousRuns(
    days.map((d, i) => ({ ...d, i })),
    (d) => d.total > 0,
  );

  return (
    <svg
      className="rs-chart"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      role="img"
      aria-label={`Tỉ lệ nhớ từng ngày trong ${n} ngày gần nhất`}
    >
      {[0, 50, 100].map((v) => (
        <g key={v}>
          <line className="rs-grid" x1={PAD.left} x2={VIEW_W - PAD.right} y1={yOf(v, 100)} y2={yOf(v, 100)} />
          <text className="rs-axis" x={PAD.left - 6} y={yOf(v, 100) + 3} textAnchor="end">
            {v}%
          </text>
        </g>
      ))}
      {runs.map((run) => (
        <g key={run[0].i}>
          {run.length > 1 && (
            <polyline
              className="rs-line"
              points={run.map((d) => `${xOf(d.i, n)},${y(retentionRate(d)!)}`).join(" ")}
            />
          )}
          {run.map((d) => (
            <circle key={d.i} className="rs-dot" cx={xOf(d.i, n)} cy={y(retentionRate(d)!)} r={3} />
          ))}
        </g>
      ))}
      {/* Lớp hover: cột trong suốt rộng hơn điểm, tooltip mô tả từng ngày. */}
      {days.map(
        (d, i) =>
          d.total > 0 && (
            <rect key={i} className="rs-hit" x={xOf(i, n) - PLOT_W / n / 2} y={PAD.top} width={PLOT_W / n} height={PLOT_H}>
              <title>{`${shortDate(d.dayStart)} · ${pct(retentionRate(d)!)}% (${d.remembered}/${d.total} lượt)`}</title>
            </rect>
          ),
      )}
      <TimeAxisLabels days={days} />
    </svg>
  );
}

export function ForecastChart({ days }: { days: ForecastDay[] }) {
  const n = days.length;
  const max = Math.max(1, ...days.map((d) => d.count));
  const band = PLOT_W / n;
  const barW = band * 0.55;

  return (
    <svg
      className="rs-chart"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      role="img"
      aria-label="Số thẻ đến hạn từng ngày trong 7 ngày tới"
    >
      <line className="rs-grid" x1={PAD.left} x2={VIEW_W - PAD.right} y1={BASELINE_Y} y2={BASELINE_Y} />
      {days.map((d, i) => {
        const x = xOf(i, n);
        // Cột khác 0 luôn cao tối thiểu 2 đơn vị để không biến mất cạnh cột lớn.
        const h = d.count === 0 ? 0 : Math.max(2, (d.count / max) * PLOT_H);
        return (
          <g key={d.dayStart}>
            {d.count > 0 && (
              <path className="rs-bar" d={roundedTopBar(x - barW / 2, BASELINE_Y - h, barW, h, 4)}>
                <title>{`${forecastDayLabel(i, d.dayStart)} · ${d.count} thẻ`}</title>
              </path>
            )}
            <text
              className={`rs-value${d.count === 0 ? " rs-value-zero" : ""}`}
              x={x}
              y={BASELINE_Y - h - 5}
              textAnchor="middle"
            >
              {d.count}
            </text>
            <text className="rs-axis" x={x} y={VIEW_H - 8} textAnchor="middle">
              {forecastDayLabel(i, d.dayStart)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function LearnedChart({ days }: { days: LearnedDay[] }) {
  const n = days.length;
  const max = Math.max(1, days[n - 1].cumulative);
  const linePoints = days.map((d, i) => `${xOf(i, n)},${yOf(d.cumulative, max)}`);
  const areaPath =
    `M${xOf(0, n)},${BASELINE_Y} L` + linePoints.join(" L") + ` L${xOf(n - 1, n)},${BASELINE_Y} Z`;

  return (
    <svg
      className="rs-chart"
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      role="img"
      aria-label={`Số từ đã thuộc luỹ kế trong ${n} ngày gần nhất`}
    >
      {[0, max].map((v) => (
        <g key={v}>
          <line className="rs-grid" x1={PAD.left} x2={VIEW_W - PAD.right} y1={yOf(v, max)} y2={yOf(v, max)} />
          <text className="rs-axis" x={PAD.left - 6} y={yOf(v, max) + 3} textAnchor="end">
            {v}
          </text>
        </g>
      ))}
      <path className="rs-area" d={areaPath} />
      <polyline className="rs-learned-line" points={linePoints.join(" ")} />
      {days.map((d, i) => (
        <rect key={d.dayStart} className="rs-hit" x={xOf(i, n) - PLOT_W / n / 2} y={PAD.top} width={PLOT_W / n} height={PLOT_H}>
          <title>{`${shortDate(d.dayStart)} · ${d.cumulative} từ`}</title>
        </rect>
      ))}
      <TimeAxisLabels days={days} />
    </svg>
  );
}
