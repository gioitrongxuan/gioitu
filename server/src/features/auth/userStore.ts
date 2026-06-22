// User data-access for the Yomitan API key. Kept here (the auth feature owns
// the `users` table) so other features resolve a user from a key without
// reaching into the table directly.
import { pool } from "../../core/db.js";
import { newApiKey } from "./auth.js";

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
