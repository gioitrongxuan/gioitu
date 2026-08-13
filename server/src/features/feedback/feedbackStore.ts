// Data-access cho góp ý về web (#244). User gửi góp ý (trạng thái new); admin đọc
// danh sách và đánh dấu đã xử lý. Email người gửi join từ `users` lúc đọc — bảng
// góp ý chỉ giữ `user_id` nên không có bản sao email lạc hậu, và admin vẫn liên
// hệ lại được.

import crypto from "node:crypto";
import { pool } from "../../core/db.js";
import { clampInt } from "../../core/queryParams.js";

/** Loại góp ý hợp lệ — khớp FEEDBACK_KINDS ở client (`features/feedback/domain`). */
const KINDS = new Set(["bug", "idea", "other"]);
const MAX_MESSAGE = 2000;
/** Trang danh sách admin: cỡ mặc định, và trần cứng cho một lượt. */
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export interface Feedback {
  id: string;
  user_id: string;
  /** Email người gửi; null nếu tài khoản đã bị xoá khỏi `users`. */
  email: string | null;
  kind: string;
  message: string;
  status: string;
  created_at: number;
}

export interface FeedbackInput {
  kind: string;
  message: string;
}

interface FeedbackRow {
  id: string;
  user_id: string;
  email: string | null;
  kind: string;
  message: string;
  status: string;
  created_at: string;
}

function rowToFeedback(r: FeedbackRow): Feedback {
  return {
    id: r.id,
    user_id: r.user_id,
    email: r.email,
    kind: r.kind,
    message: r.message,
    status: r.status,
    created_at: Number(r.created_at),
  };
}

/** User: gửi một góp ý. Lỗi trả về là chữ hiện thẳng cho người dùng. */
export async function submit(userId: string, input: FeedbackInput): Promise<{ ok: boolean; error?: string }> {
  const message = (input.message ?? "").trim();
  if (!message) return { ok: false, error: "Hãy nhập nội dung góp ý" };
  if (message.length > MAX_MESSAGE) return { ok: false, error: `Góp ý quá dài (tối đa ${MAX_MESSAGE} ký tự)` };
  if (!KINDS.has(input.kind)) return { ok: false, error: "Loại góp ý không hợp lệ" };

  await pool.query(
    `INSERT INTO feedback (id, user_id, kind, message, status, created_at)
     VALUES ($1, $2, $3, $4, 'new', $5)`,
    [crypto.randomUUID(), userId, input.kind, message, Date.now()],
  );
  return { ok: true };
}

/**
 * Admin: góp ý mới nhất trước. `includeHandled` mở cả phần đã xử lý — mặc định
 * chỉ phần đang chờ, vì đó là việc còn phải làm.
 */
export async function list(options: { includeHandled: boolean; limit?: unknown }): Promise<Feedback[]> {
  const limit = clampInt(options.limit, DEFAULT_LIMIT, 1, MAX_LIMIT);
  const { rows } = await pool.query<FeedbackRow>(
    `SELECT f.id, f.user_id, f.kind, f.message, f.status, f.created_at, u.email
       FROM feedback f
       LEFT JOIN users u ON u.id = f.user_id
      WHERE $1::boolean OR f.status = 'new'
      ORDER BY f.created_at DESC
      LIMIT $2`,
    [options.includeHandled, limit],
  );
  return rows.map(rowToFeedback);
}

/** Admin: đánh dấu đã xử lý. false = không còn góp ý nào đang chờ với id đó. */
export async function markHandled(id: string, reviewer: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    "UPDATE feedback SET status = 'handled', handled_by = $1, handled_at = $2 WHERE id = $3 AND status = 'new'",
    [reviewer, Date.now(), id],
  );
  return (rowCount ?? 0) > 0;
}
