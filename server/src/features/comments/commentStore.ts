// Data-access cho bình luận / góp ý của người dùng trên một từ trong từ điển
// hệ thống (#23). Công khai đọc; đăng nhập mới viết. Khoá theo bộ
// (term_lang, native_lang, term, reading) — nhất quán với store `terms`
// (không gộp đồng âm). `author_name` suy ra server-side từ email để không giả
// mạo được; xoá thì tác giả xoá của mình, admin xoá bất kỳ.

import crypto from "node:crypto";
import { pool } from "../../core/db.js";
import { isAdminEmail } from "../auth/auth.js";

const MAX_BODY = 2000;

export interface WordKey {
  term_lang: string;
  native_lang: string;
  term: string;
  reading?: string | null;
}

export interface Comment {
  id: string;
  term_lang: string;
  native_lang: string;
  term: string;
  reading: string | null;
  user_id: string;
  author_name: string;
  body: string;
  created_at: number;
}

interface CommentRow {
  id: string;
  term_lang: string;
  native_lang: string;
  term: string;
  reading: string | null;
  user_id: string;
  author_name: string;
  body: string;
  status: string;
  created_at: string;
}

function rowToComment(r: CommentRow): Comment {
  return {
    id: r.id,
    term_lang: r.term_lang,
    native_lang: r.native_lang,
    term: r.term,
    reading: r.reading,
    user_id: r.user_id,
    author_name: r.author_name,
    body: r.body,
    created_at: Number(r.created_at),
  };
}

/** Email người dùng (để suy ra tên hiển thị và kiểm tra quyền admin). */
async function emailOf(userId: string): Promise<string> {
  const { rows } = await pool.query<{ email: string }>("SELECT email FROM users WHERE id = $1", [userId]);
  return rows[0]?.email ?? "";
}

/** Tên hiển thị: phần trước @ của email (không lộ toàn bộ địa chỉ). */
function displayName(email: string): string {
  return email.split("@")[0]?.trim() || "Người dùng";
}

/** Bình luận đang hiển thị của một từ, cũ → mới. Guest đọc được (không cần auth). */
export async function listForWord(key: WordKey): Promise<Comment[]> {
  const term = key.term.trim();
  if (!term || !key.term_lang || !key.native_lang) return [];
  const reading = key.reading?.trim() || null;
  const { rows } = await pool.query<CommentRow>(
    `SELECT * FROM dict_comments
     WHERE status = 'visible' AND term_lang = $1 AND native_lang = $2 AND term = $3
       AND reading IS NOT DISTINCT FROM $4
     ORDER BY created_at ASC`,
    [key.term_lang, key.native_lang, term, reading],
  );
  return rows.map(rowToComment);
}

/** Thêm một bình luận (đã có userId từ requireAuth). Trả về bản ghi vừa tạo. */
export async function addComment(
  userId: string,
  key: WordKey,
  body: string,
): Promise<{ ok: boolean; error?: string; comment?: Comment }> {
  const term = key.term.trim();
  const text = (body ?? "").trim();
  if (!term || !key.term_lang || !key.native_lang) return { ok: false, error: "Thiếu từ hoặc cặp ngôn ngữ" };
  if (!text) return { ok: false, error: "Bình luận trống" };
  if (text.length > MAX_BODY) return { ok: false, error: `Bình luận tối đa ${MAX_BODY} ký tự` };

  const authorName = displayName(await emailOf(userId));
  const reading = key.reading?.trim() || null;
  const id = crypto.randomUUID();
  const createdAt = Date.now();
  await pool.query(
    `INSERT INTO dict_comments (id, term_lang, native_lang, term, reading, user_id, author_name, body, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'visible', $9)`,
    [id, key.term_lang, key.native_lang, term, reading, userId, authorName, text, createdAt],
  );
  return {
    ok: true,
    comment: {
      id,
      term_lang: key.term_lang,
      native_lang: key.native_lang,
      term,
      reading,
      user_id: userId,
      author_name: authorName,
      body: text,
      created_at: createdAt,
    },
  };
}

/** Xoá: chỉ tác giả bình luận, hoặc admin. Trả false nếu không tìm thấy/không đủ quyền. */
export async function deleteComment(id: string, userId: string): Promise<boolean> {
  const { rows } = await pool.query<{ user_id: string }>(
    "SELECT user_id FROM dict_comments WHERE id = $1",
    [id],
  );
  const owner = rows[0]?.user_id;
  if (!owner) return false;
  if (owner !== userId && !isAdminEmail(await emailOf(userId))) return false;
  const { rowCount } = await pool.query("DELETE FROM dict_comments WHERE id = $1", [id]);
  return (rowCount ?? 0) > 0;
}
