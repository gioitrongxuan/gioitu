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
