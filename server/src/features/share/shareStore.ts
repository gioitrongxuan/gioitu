// Data-access cho link chia sẻ tạm (#70 — 5.2). Blob sống ngắn (TTL 5') với cả
// trần cho một file lẫn tổng dung lượng, để bảo vệ đĩa server (~10GB). Dọn rác
// lười khi truy cập + sweep định kỳ (index.ts). ID ngẫu nhiên khó đoán.

import crypto from "node:crypto";
import { pool } from "../../core/db.js";

export const SHARE_TTL_MS = 5 * 60 * 1000;
export const MAX_SHARE_BYTES = 10 * 1024 * 1024; // một file
export const MAX_SHARE_TOTAL = 200 * 1024 * 1024; // tổng mọi share đang sống

export type CreateResult =
  | { ok: true; id: string; expires_at: number }
  | { ok: false; status: number; error: string };

/** Tạo một share mới cho `blob`. Dọn hết share hết hạn trước để tính quota đúng. */
export async function create(blob: Buffer, filename: string): Promise<CreateResult> {
  if (blob.length === 0) return { ok: false, status: 400, error: "File rỗng" };
  if (blob.length > MAX_SHARE_BYTES) return { ok: false, status: 413, error: "File quá lớn để chia sẻ" };

  await sweep();
  const { rows } = await pool.query<{ sum: string | null }>("SELECT SUM(bytes)::bigint AS sum FROM shares");
  if (Number(rows[0]?.sum ?? 0) + blob.length > MAX_SHARE_TOTAL) {
    return { ok: false, status: 503, error: "Máy chủ tạm đầy, thử lại sau ít phút" };
  }

  const id = crypto.randomBytes(9).toString("base64url");
  const now = Date.now();
  const expires_at = now + SHARE_TTL_MS;
  await pool.query(
    "INSERT INTO shares (id, blob, bytes, filename, expires_at, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
    [id, blob, blob.length, filename, expires_at, now],
  );
  return { ok: true, id, expires_at };
}

/** Lấy một share nếu còn sống; hết hạn thì xoá lười và trả null. */
export async function get(id: string): Promise<{ blob: Buffer; filename: string } | null> {
  const { rows } = await pool.query<{ blob: Buffer; filename: string; expires_at: string }>(
    "SELECT blob, filename, expires_at FROM shares WHERE id = $1",
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  if (Number(row.expires_at) < Date.now()) {
    await pool.query("DELETE FROM shares WHERE id = $1", [id]);
    return null;
  }
  return { blob: row.blob, filename: row.filename };
}

/** Xoá mọi share đã hết hạn (gọi định kỳ + trước mỗi lần tạo). */
export async function sweep(): Promise<void> {
  await pool.query("DELETE FROM shares WHERE expires_at < $1", [Date.now()]);
}
