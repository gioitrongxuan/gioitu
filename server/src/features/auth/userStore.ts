// User data-access for the Yomitan API key. Kept here (the auth feature owns
// the `users` table) so other features resolve a user from a key without
// reaching into the table directly.
import { pool } from "../../core/db.js";
import { newApiKey, newUserId } from "./auth.js";
import { GoogleIdentity } from "./google.js";

export interface AccountUser {
  id: string;
  email: string;
  is_premium: boolean;
}

/**
 * Resolve the account for a verified Google identity, creating it on first
 * sign-in. Match on the Google subject first, then fall back to email so an
 * account that predates Google sign-in keeps its cloud data; either way the
 * subject and email are kept current.
 */
export async function upsertGoogleUser({ sub, email }: GoogleIdentity): Promise<AccountUser> {
  const bySub = await pool.query<{ id: string; is_premium: boolean }>(
    "SELECT id, is_premium FROM users WHERE google_sub = $1",
    [sub],
  );
  if (bySub.rows[0]) {
    await pool.query("UPDATE users SET email = $1 WHERE id = $2", [email, bySub.rows[0].id]);
    return { id: bySub.rows[0].id, email, is_premium: bySub.rows[0].is_premium === true };
  }

  const byEmail = await pool.query<{ id: string; is_premium: boolean }>(
    "SELECT id, is_premium FROM users WHERE email = $1",
    [email],
  );
  if (byEmail.rows[0]) {
    await pool.query("UPDATE users SET google_sub = $1 WHERE id = $2", [sub, byEmail.rows[0].id]);
    return { id: byEmail.rows[0].id, email, is_premium: byEmail.rows[0].is_premium === true };
  }

  const id = newUserId();
  await pool.query(
    "INSERT INTO users (id, email, google_sub, created_at) VALUES ($1, $2, $3, $4)",
    [id, email, sub, Date.now()],
  );
  return { id, email, is_premium: false };
}

/**
 * Resolve (or create) an account by email alone — no Google subject. Dùng cho
 * đăng nhập dev; giữ nguyên tài khoản cũ nếu email đã tồn tại.
 */
export async function upsertUserByEmail(email: string): Promise<AccountUser> {
  const found = await pool.query<{ id: string; is_premium: boolean }>(
    "SELECT id, is_premium FROM users WHERE email = $1",
    [email],
  );
  if (found.rows[0]) return { id: found.rows[0].id, email, is_premium: found.rows[0].is_premium === true };

  const id = newUserId();
  await pool.query("INSERT INTO users (id, email, created_at) VALUES ($1, $2, $3)", [id, email, Date.now()]);
  return { id, email, is_premium: false };
}

/** Cờ Premium hiện tại của một user (nguồn gác cổng sync — luôn đọc tươi từ DB). */
export async function isPremium(userId: string): Promise<boolean> {
  const { rows } = await pool.query<{ is_premium: boolean }>(
    "SELECT is_premium FROM users WHERE id = $1",
    [userId],
  );
  return rows[0]?.is_premium === true;
}

/** The user's Yomitan API key, generating and persisting one on first request. */
export async function ensureApiKey(userId: string): Promise<string> {
  const { rows } = await pool.query<{ api_key: string | null }>(
    "SELECT api_key FROM users WHERE id = $1",
    [userId],
  );
  return rows[0]?.api_key || regenerateApiKey(userId);
}

/** Rotate (or create) the user's Yomitan API key and return the new value. */
export async function regenerateApiKey(userId: string): Promise<string> {
  const key = newApiKey();
  await pool.query("UPDATE users SET api_key = $1 WHERE id = $2", [key, userId]);
  return key;
}

/** Resolve a user id from a Yomitan API key, or null if the key is blank/unknown. */
export async function userIdByApiKey(key: unknown): Promise<string | null> {
  if (typeof key !== "string" || !key) return null;
  const { rows } = await pool.query<{ id: string }>(
    "SELECT id FROM users WHERE api_key = $1",
    [key],
  );
  return rows[0]?.id ?? null;
}
