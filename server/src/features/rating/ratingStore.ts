// Data-access cho đánh giá ứng dụng (#245). Một người một đánh giá: gửi lại là
// sửa chính nó (upsert theo khoá chính `user_id`), nên điểm trung bình là "mỗi
// người một phiếu" chứ không phải "ai bấm nhiều lần người đó nặng ký".
//
// Điểm trung bình + phân bố tính bằng SQL trên TOÀN BẢNG, không suy từ danh
// sách trả về: danh sách có trần (`MAX_LIMIT`) nên tính từ nó sẽ sai ngay khi
// vượt trần.

import { pool } from "../../core/db.js";
import { clampInt } from "../../core/queryParams.js";

const MAX_NOTE = 500;
/** Danh sách của admin: cỡ mặc định và trần cứng cho một lượt. */
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export interface Rating {
  user_id: string;
  /** Email người đánh giá; null nếu tài khoản đã bị xoá khỏi `users`. */
  email: string | null;
  stars: number;
  note: string | null;
  created_at: number;
  updated_at: number;
}

/** Số phiếu theo từng mức sao, luôn đủ 5 khoá "1".."5" (mức chưa ai chọn là 0). */
export interface RatingSummary {
  count: number;
  /** Trung bình cộng; 0 khi chưa có phiếu nào. */
  average: number;
  byStar: Record<string, number>;
}

interface RatingRow {
  user_id: string;
  email: string | null;
  stars: number;
  note: string | null;
  created_at: string;
  updated_at: string;
}

function rowToRating(r: RatingRow): Rating {
  return {
    user_id: r.user_id,
    email: r.email,
    stars: Number(r.stars),
    note: r.note,
    created_at: Number(r.created_at),
    updated_at: Number(r.updated_at),
  };
}

/**
 * User: gửi (hoặc sửa) đánh giá của mình. Lỗi trả về là chữ hiện thẳng cho
 * người dùng. Kiểm lại đúng các luật của `checkRating` phía client — client
 * không phải bức tường duy nhất.
 */
export async function submit(
  userId: string,
  input: { stars: unknown; note: unknown },
): Promise<{ ok: boolean; error?: string }> {
  const stars = Number(input.stars);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    return { ok: false, error: "Hãy chọn từ 1 đến 5 sao" };
  }
  const note = String(input.note ?? "").trim();
  if (note.length > MAX_NOTE) {
    return { ok: false, error: `Nhận xét quá dài (tối đa ${MAX_NOTE} ký tự)` };
  }

  const now = Date.now();
  await pool.query(
    `INSERT INTO app_ratings (user_id, stars, note, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $4)
     ON CONFLICT (user_id) DO UPDATE SET stars = $2, note = $3, updated_at = $4`,
    [userId, stars, note || null, now],
  );
  return { ok: true };
}

/** Đánh giá hiện tại của một người, để form mở ra đã điền sẵn thứ họ từng gửi. */
export async function mine(userId: string): Promise<Rating | null> {
  const { rows } = await pool.query<RatingRow>(
    `SELECT r.user_id, r.stars, r.note, r.created_at, r.updated_at, u.email
       FROM app_ratings r
       LEFT JOIN users u ON u.id = r.user_id
      WHERE r.user_id = $1`,
    [userId],
  );
  return rows[0] ? rowToRating(rows[0]) : null;
}

/** Admin: đánh giá mới sửa gần nhất trước. */
export async function list(limitRaw?: unknown): Promise<Rating[]> {
  const limit = clampInt(limitRaw, DEFAULT_LIMIT, 1, MAX_LIMIT);
  const { rows } = await pool.query<RatingRow>(
    `SELECT r.user_id, r.stars, r.note, r.created_at, r.updated_at, u.email
       FROM app_ratings r
       LEFT JOIN users u ON u.id = r.user_id
      ORDER BY r.updated_at DESC
      LIMIT $1`,
    [limit],
  );
  return rows.map(rowToRating);
}

/** Admin: tổng số phiếu, trung bình và phân bố theo mức sao (toàn bảng). */
export async function summary(): Promise<RatingSummary> {
  const { rows } = await pool.query<{ stars: number; n: number }>(
    "SELECT stars, COUNT(*)::int AS n FROM app_ratings GROUP BY stars",
  );

  const byStar: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  let count = 0;
  let total = 0;
  for (const row of rows) {
    const stars = Number(row.stars);
    const n = Number(row.n);
    // CHECK của bảng đã chặn mức lạ, nhưng bảng có thể mang dữ liệu cũ hơn ràng
    // buộc đó — bỏ qua thay vì để một dòng hỏng kéo lệch trung bình.
    if (byStar[String(stars)] === undefined) continue;
    byStar[String(stars)] = n;
    count += n;
    total += stars * n;
  }
  return { count, average: count === 0 ? 0 : total / count, byStar };
}
