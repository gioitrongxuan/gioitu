// Đọc tham số số từ query string. Mọi giá trị client gửi lên đều là chuỗi tuỳ
// ý, nên phải qua đây trước khi chạm SQL: `Number("abc")` ra NaN và số âm lọt
// xuống `LIMIT`/`OFFSET` sẽ làm Postgres ném lỗi. App không gắn error handler,
// nên lỗi đó nổi lên thành 500 kèm stack thay vì một trang rỗng vô hại.

/**
 * Số nguyên trong `[min, max]`. Thiếu, không phải số, hoặc nhỏ hơn `min` thì
 * lùi về `fallback` — coi đầu vào hỏng là "không truyền" chứ không phải lỗi,
 * vì đây là tham số phân trang: trả trang đầu vẫn hữu ích hơn ném 500.
 */
export function clampInt(raw: unknown, fallback: number, min: number, max: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min) return fallback;
  return Math.min(Math.floor(value), max);
}

/** Mốc thời gian "lấy thay đổi từ lúc" của sync: âm/hỏng đều về 0 (lấy tất cả). */
export function sinceParam(raw: unknown): number {
  return clampInt(raw, 0, 0, Number.MAX_SAFE_INTEGER);
}
