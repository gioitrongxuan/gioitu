// Nhật ký ôn tập (review_log) — phần logic thuần.
// Chỉ dựng bản ghi từ trạng thái thẻ trước/sau khi chấm; việc ghi xuống
// IndexedDB nằm ở data/reviewLog.ts.

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
