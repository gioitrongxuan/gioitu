// Thống kê ôn tập từ `review_log` + danh sách entry (BACKLOG GĐ3, #163).
// Toàn bộ là hàm thuần: caller truyền mảng log/entry và mốc `now` — không
// Date.now(), không I/O — để test được tất định và làm nền đối chiếu cho FSRS
// sau này (khi đủ log thì so scheduler mới với retention thật đo ở đây).

import { DAY } from "./constants";
import { isDeleted } from "./lifecycle";
import { ReviewLogEntry, VocabEntry } from "@/shared/types";

/** Cửa sổ mặc định cho retention + đường "đã thuộc": 30 ngày gần nhất. */
export const STATS_WINDOW_DAYS = 30;

/** Tầm dự báo đến hạn: hôm nay + 6 ngày kế tiếp. */
export const FORECAST_DAYS = 7;

/**
 * Chỉ lượt chấm có `interval_before` ≥ 1 ngày mới được tính retention ("true
 * retention" kiểu Anki): các learning/relearning step (1, 10 phút) lặp ngay
 * trong phiên — chấm "Nhớ" sau 1 phút không đo trí nhớ dài hạn, gộp vào chỉ
 * thổi phồng tỉ lệ.
 */
export const MIN_RETENTION_INTERVAL = 1 * DAY;

/** Nửa đêm địa phương của một thời điểm (cùng idiom với wordcloud.ts). */
function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Mốc nửa đêm của `days` ngày liên tiếp kết thúc ở ngày chứa `now`, kèm một
 * mốc chặn (nửa đêm ngày mai) để bucket ngày cuối có biên phải. Đi qua
 * Date(y, m, d±i) thay vì cộng 24h thẳng để không lệch khi đổi giờ (DST).
 */
function dayStarts(now: number, days: number): { starts: number[]; end: number } {
  const d = new Date(startOfDay(now));
  const at = (offset: number) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset).getTime();
  const starts: number[] = [];
  for (let i = days - 1; i >= 0; i--) starts.push(at(-i));
  return { starts, end: at(1) };
}

/** Chỉ số bucket ngày của `ts` trong dãy `starts` (biên phải `end`); -1 nếu ngoài. */
function bucketIndex(ts: number, starts: number[], end: number): number {
  if (ts < starts[0] || ts >= end) return -1;
  for (let i = starts.length - 1; i >= 0; i--) {
    if (ts >= starts[i]) return i;
  }
  return -1;
}

/** Một ngày trong biểu đồ retention. `total === 0` = ngày trống (khoảng hở). */
export interface RetentionDay {
  dayStart: number; // nửa đêm địa phương, epoch ms
  total: number; // số lượt chấm ĐƯỢC TÍNH (thẻ REVIEW thật) trong ngày
  remembered: number; // trong đó số lượt không phải "Quên"
}

/**
 * Tỉ lệ nhớ theo ngày trong `days` ngày gần nhất (phần tử cuối = hôm nay).
 * Trả đủ một phần tử mỗi ngày — ngày không ôn có `total: 0` để biểu đồ vẽ
 * khoảng hở thay vì nối xuyên qua.
 */
export function retentionByDay(
  log: ReviewLogEntry[],
  now: number,
  days: number = STATS_WINDOW_DAYS,
): RetentionDay[] {
  const { starts, end } = dayStarts(now, days);
  const out: RetentionDay[] = starts.map((dayStart) => ({ dayStart, total: 0, remembered: 0 }));
  for (const row of log) {
    if (row.interval_before < MIN_RETENTION_INTERVAL) continue;
    const i = bucketIndex(row.ts, starts, end);
    if (i === -1) continue;
    out[i].total += 1;
    if (row.grade !== "again") out[i].remembered += 1;
  }
  return out;
}

/** Tỉ lệ nhớ của một ngày, ∈ [0, 1]; `null` khi ngày đó không có lượt nào. */
export function retentionRate(day: Pick<RetentionDay, "total" | "remembered">): number | null {
  return day.total === 0 ? null : day.remembered / day.total;
}

/** Gộp cả cửa sổ thành một cặp tổng — cho ô "Tỉ lệ nhớ 30 ngày". */
export function summarizeRetention(
  days: RetentionDay[],
): { total: number; remembered: number } {
  let total = 0;
  let remembered = 0;
  for (const d of days) {
    total += d.total;
    remembered += d.remembered;
  }
  return { total, remembered };
}

/** Số lượt chấm (mọi loại thẻ) từ mốc `since` — cho ô "Lượt ôn". */
export function countReviewsSince(log: ReviewLogEntry[], since: number): number {
  return log.filter((r) => r.ts >= since).length;
}

/** Một ngày trong dự báo đến hạn. */
export interface ForecastDay {
  dayStart: number; // nửa đêm địa phương, epoch ms
  count: number; // số thẻ đến hạn trong ngày (ngày đầu gồm cả thẻ đã quá hạn)
}

/**
 * Số thẻ đến hạn mỗi ngày trong `days` ngày tới (phần tử đầu = hôm nay). Thẻ
 * đã quá hạn từ trước dồn hết vào hôm nay — chúng chờ ở phiên ôn kế tiếp chứ
 * không nằm ở quá khứ. Giả định mỗi thẻ được ôn đúng hạn (không mô phỏng dây
 * chuyền reschedule).
 */
export function forecastDueByDay(
  entries: VocabEntry[],
  now: number,
  days: number = FORECAST_DAYS,
): ForecastDay[] {
  const d = new Date(startOfDay(now));
  const at = (offset: number) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset).getTime();
  const today = at(0);
  const futureStarts: number[] = [];
  for (let i = 0; i < days; i++) futureStarts.push(at(i));
  const end = at(days);

  const out: ForecastDay[] = futureStarts.map((dayStart) => ({ dayStart, count: 0 }));
  for (const e of entries) {
    if (isDeleted(e) || e.card_state == null || e.next_review == null) continue;
    if (e.next_review >= end) continue;
    const i = e.next_review < today ? 0 : bucketIndex(e.next_review, futureStarts, end);
    if (i !== -1) out[i].count += 1;
  }
  return out;
}

/** Một điểm trên đường "số từ đã thuộc" (luỹ kế đến hết ngày). */
export interface LearnedDay {
  dayStart: number; // nửa đêm địa phương, epoch ms
  cumulative: number; // tổng số từ đang LEARNED có mốc thuộc ≤ hết ngày này
}

/**
 * Đường luỹ kế số từ đã thuộc trong `days` ngày gần nhất. Mốc thuộc là
 * `learned_at`, fallback `last_lookup_at` cho entry cũ chưa đóng dấu (cùng quy
 * ước với store.learnedEntries); từ thuộc trước cửa sổ dồn vào nền của ngày
 * đầu. Chỉ đếm entry HIỆN đang LEARNED — review_log không ghi chuyển trạng
 * thái nên từ đã tái quên rời khỏi đường (đường tả tài sản hiện có, không phải
 * lịch sử đầy đủ); điểm cuối vì thế luôn khớp ô "Đã thuộc (N)".
 */
export function learnedOverTime(
  entries: VocabEntry[],
  now: number,
  days: number = STATS_WINDOW_DAYS,
): LearnedDay[] {
  const { starts, end } = dayStarts(now, days);
  const perDay = new Array<number>(days).fill(0);
  let baseline = 0;
  for (const e of entries) {
    if (isDeleted(e) || e.status !== "LEARNED") continue;
    const ts = e.learned_at ?? e.last_lookup_at;
    if (ts < starts[0]) {
      baseline += 1;
      continue;
    }
    const i = bucketIndex(ts, starts, end);
    if (i !== -1) perDay[i] += 1;
  }
  let cumulative = baseline;
  return starts.map((dayStart, i) => {
    cumulative += perDay[i];
    return { dayStart, cumulative };
  });
}

/**
 * Tách một dãy ngày thành các đoạn liên tục CÓ dữ liệu để vẽ polyline — ngày
 * trống là khoảng hở thật trên biểu đồ, không được nối đường xuyên qua (nối
 * qua sẽ bịa ra dữ liệu không tồn tại).
 */
export function contiguousRuns<T>(items: T[], hasData: (item: T) => boolean): T[][] {
  const runs: T[][] = [];
  let current: T[] = [];
  for (const item of items) {
    if (hasData(item)) {
      current.push(item);
    } else if (current.length > 0) {
      runs.push(current);
      current = [];
    }
  }
  if (current.length > 0) runs.push(current);
  return runs;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Nhãn ngày ngắn "dd/MM" cho trục thời gian. */
export function shortDate(dayStart: number): string {
  const d = new Date(dayStart);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
}

/** Nhãn cột dự báo: hai ngày đầu gọi tên, còn lại "dd/MM". */
export function forecastDayLabel(index: number, dayStart: number): string {
  if (index === 0) return "Hôm nay";
  if (index === 1) return "Ngày mai";
  return shortDate(dayStart);
}
