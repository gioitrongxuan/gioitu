// Nhật ký ôn tập (review_log) — phần logic thuần: dựng bản ghi từ trạng thái thẻ
// trước/sau khi chấm, khử trùng lặp khi nhận nhật ký từ nơi khác (file backup,
// cloud) và chọn phần cần đẩy lên. Việc ghi xuống IndexedDB nằm ở
// data/reviewLog.ts, việc đi mạng ở data/reviewLogApi.ts + data/reviewLogSync.ts.

import { ReviewGrade, ReviewLogEntry, VocabEntry } from "@/shared/types";

/**
 * Dựng một dòng `review_log` từ trạng thái thẻ NGAY TRƯỚC khi chấm (`before`) và
 * NGAY SAU khi chấm (`after`). Hàm thuần để test được mà không cần IndexedDB.
 *
 * `interval_before` lấy từ thẻ cũ, `interval_after` từ thẻ đã tính lại — chính
 * cặp này (kèm `grade`, `ts`) là đầu vào cho thống kê retention/forecast và cho
 * FSRS sau này. Không gán `id`: khoá do IndexedDB tự cấp lúc ghi.
 */
export function buildReviewLogEntry(
  before: Pick<VocabEntry, "user_id" | "term" | "term_lang" | "srs_interval">,
  after: Pick<VocabEntry, "srs_interval">,
  grade: ReviewGrade,
  ts: number,
): ReviewLogEntry {
  return {
    user_id: before.user_id,
    term: before.term,
    term_lang: before.term_lang,
    grade,
    ts,
    interval_before: before.srs_interval,
    interval_after: after.srs_interval,
  };
}

/**
 * Một dòng nhật ký như nó đi trên dây / trong file: bỏ `id` (khoá do IndexedDB
 * của MÁY NGUỒN cấp, mang sang máy khác vừa vô nghĩa vừa đè nhầm dòng sẵn có) và
 * bỏ `user_id` (server suy từ token, nơi nhận tự gán theo người đang dùng).
 */
export type SyncedLogRow = Omit<ReviewLogEntry, "id" | "user_id">;

// Ký tự nối các phần của khoá: NUL không bao giờ xuất hiện trong mặt chữ nên
// hai dòng khác nhau không thể vô tình ghép ra cùng một khoá.
const KEY_SEP = "\u0000";

/** Danh tính một lượt chấm — đủ phân biệt trong thực tế (hai lượt cùng ms là trùng).
 *  Cùng bộ trường với khoá duy nhất của bảng `review_log` trên server. */
const logKey = (r: SyncedLogRow) => [r.term, r.term_lang, r.ts, r.grade].join(KEY_SEP);

/**
 * Gán lại chủ nhân cho các dòng lịch sử nhận từ nơi khác (file backup, cloud) và
 * bỏ `id` để store đích tự cấp khoá mới khi ghi.
 */
export function logRowsForUser(
  rows: (SyncedLogRow & { id?: number })[],
  user_id: string,
): ReviewLogEntry[] {
  return rows.map(({ id: _id, ...row }) => ({ ...row, user_id }));
}

/**
 * Lọc các dòng lịch sử CHƯA có trong kho hiện tại (khử cả trùng lặp nội bộ của
 * mẻ đến). review_log là append-only nên nhận lại cùng một dòng — nhập lại đúng
 * file backup, hay kéo về dòng mình vừa đẩy lên cloud — không được phép nhân đôi
 * lịch sử, thống kê retention sẽ sai.
 */
export function missingLogRows<T extends SyncedLogRow>(
  existing: SyncedLogRow[],
  incoming: T[],
): T[] {
  const seen = new Set(existing.map(logKey));
  const out: T[] = [];
  for (const row of incoming) {
    const key = logKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

/**
 * Các dòng cần đẩy lên cloud: từ mốc `pushedThrough` (ts lớn nhất đã đẩy thành
 * công) trở đi. Lấy `>=` chứ không `>` — biên đúng một dòng bị đẩy lại mỗi lượt
 * (server chống trùng nên vô hại), đổi lại không bỏ sót dòng nào được ghi trong
 * cùng mili-giây với dòng cuối của mẻ trước.
 */
export function rowsToPush(local: ReviewLogEntry[], pushedThrough: number): SyncedLogRow[] {
  return local
    .filter((r) => r.ts >= pushedThrough)
    .map(({ id: _id, user_id: _user_id, ...row }) => row);
}

/** Mốc đẩy mới sau một lượt push thành công: `ts` lớn nhất của mẻ vừa đẩy. */
export function maxTs(rows: SyncedLogRow[], fallback: number): number {
  return rows.reduce((max, r) => (r.ts > max ? r.ts : max), fallback);
}

/** `ts` nhỏ nhất của một mẻ — dùng để biết phải lùi mốc đẩy tới đâu khi nhận
 *  nhật ký CŨ (nhập file backup). `fallback` chỉ dùng cho mẻ rỗng. */
export function minTs(rows: SyncedLogRow[], fallback: number): number {
  return rows.reduce((min, r) => (r.ts < min ? r.ts : min), fallback);
}

/** Cột của file CSV lịch sử ôn — thứ tự cố định, đổi là đổi định dạng file. */
const CSV_HEADER = ["ts_iso", "term", "term_lang", "grade", "interval_before_min", "interval_after_min"];

/** Bọc một ô CSV: chỉ quote khi cần (chứa dấu phẩy/quote/xuống dòng), quote kép bên trong. */
function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Xuất lịch sử ôn thành CSV (tính năng Premium "stats nâng cao"): mỗi lượt chấm
 * một dòng, `ts` kèm bản ISO (UTC) để mở bằng Excel/Sheets đọc được ngay,
 * interval giữ đơn vị phút như trong model. Không ghi `user_id`/`id` — file là
 * dữ liệu mang đi của một người, khoá nội bộ không có nghĩa bên ngoài app.
 */
export function reviewLogToCsv(log: ReviewLogEntry[]): string {
  const rows = log.map((r) =>
    [
      new Date(r.ts).toISOString(),
      csvCell(r.term),
      r.term_lang,
      r.grade,
      String(r.interval_before),
      String(r.interval_after),
    ].join(","),
  );
  return [CSV_HEADER.join(","), ...rows].join("\n");
}
