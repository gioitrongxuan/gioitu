// Biên nhận của nhật ký ôn tập đẩy lên (/api/sync/log) — logic thuần, không
// import pg để test được bằng vitest.
//
// Vì sao lọc ở biên (cùng lý do isPushableEntry của user_data): một dòng thiếu
// trường làm INSERT vi phạm NOT NULL, ném lỗi và ROLLBACK cả mẻ — một dòng hỏng
// làm mất luôn các dòng lành. `grade` còn phải nằm trong bộ giá trị hợp lệ vì
// nó là một phần khoá duy nhất: nhận "GOOD" hay "gud" là tự tạo ra dòng trùng
// mà khoá không chặn được.

/** Một lượt chấm như client đẩy lên: chủ nhân suy từ token, `id` là khoá cục bộ. */
export interface ReviewLogRow {
  term: string;
  term_lang: string;
  grade: string;
  ts: number;
  interval_before: number;
  interval_after: number;
}

/** Số dòng tối đa một trang pull — đủ lớn để một máy mới đồng bộ trong vài lượt,
 *  đủ nhỏ để không dựng cả nhật ký nhiều năm trong một phản hồi. */
export const LOG_PAGE_SIZE = 2000;

/** Bộ điểm hợp lệ — khớp `ReviewGrade` của client (shared/types.ts). */
const GRADES = new Set(["again", "hard", "good", "easy"]);

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isPushableRow(x: unknown): x is ReviewLogRow {
  const o = x as Record<string, unknown> | null;
  return (
    typeof o?.term === "string" && o.term !== "" &&
    typeof o.term_lang === "string" && o.term_lang !== "" &&
    typeof o.grade === "string" && GRADES.has(o.grade) &&
    isFiniteNumber(o.ts) &&
    isFiniteNumber(o.interval_before) &&
    isFiniteNumber(o.interval_after)
  );
}

/** Giữ lại các dòng ghi được, bỏ qua dòng hỏng (caller log số bị bỏ). */
export function pushableLogRows(raw: unknown[]): ReviewLogRow[] {
  return raw.filter(isPushableRow);
}
