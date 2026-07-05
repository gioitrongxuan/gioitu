// Data-access cho Premium (#70 — 6.2 gate). Admin sinh/liệt kê mã; user đổi mã
// để bật `is_premium`. Đổi mã chạy trong một transaction (khoá dòng mã) để hai
// thiết bị không đổi trùng một mã.

import { pool } from "../../core/db.js";
import { newPremiumCode, normalizeCode } from "./code.js";

export interface PremiumCode {
  code: string;
  created_at: number;
  redeemed_by: string | null;
  redeemed_at: number | null;
}

const MAX_BATCH = 50;

/** Sinh `count` mã mới (giới hạn 1..50 mỗi lần). Trả về các mã vừa tạo. */
export async function generateCodes(count: number): Promise<string[]> {
  const n = Math.max(1, Math.min(MAX_BATCH, Math.floor(count) || 1));
  const codes: string[] = [];
  for (let i = 0; i < n; i++) {
    const code = newPremiumCode();
    await pool.query("INSERT INTO premium_codes (code, created_at) VALUES ($1, $2)", [code, Date.now()]);
    codes.push(code);
  }
  return codes;
}

export async function listCodes(): Promise<PremiumCode[]> {
  const { rows } = await pool.query<PremiumCode>(
    "SELECT code, created_at, redeemed_by, redeemed_at FROM premium_codes ORDER BY created_at DESC",
  );
  return rows;
}

export type RedeemResult = { ok: true } | { ok: false; error: string };

/**
 * Đổi mã cho một user: mã phải tồn tại và chưa dùng. Đặt `is_premium=true` và
 * đánh dấu mã đã dùng trong một transaction (SELECT … FOR UPDATE).
 */
export async function redeemCode(userId: string, rawCode: unknown): Promise<RedeemResult> {
  const code = normalizeCode(rawCode);
  if (!code) return { ok: false, error: "Thiếu mã kích hoạt" };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ redeemed_by: string | null }>(
      "SELECT redeemed_by FROM premium_codes WHERE code = $1 FOR UPDATE",
      [code],
    );
    if (!rows[0]) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Mã không tồn tại" };
    }
    if (rows[0].redeemed_by) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Mã đã được sử dụng" };
    }
    await client.query("UPDATE premium_codes SET redeemed_by = $1, redeemed_at = $2 WHERE code = $3", [
      userId,
      Date.now(),
      code,
    ]);
    await client.query("UPDATE users SET is_premium = true WHERE id = $1", [userId]);
    await client.query("COMMIT");
    return { ok: true };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
