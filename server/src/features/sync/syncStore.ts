// Cloud-sync data-access (SPEC 2.C). Last-write-wins by `updated_at`; ownership
// is always forced to the authenticated user (a client-supplied user_id is
// ignored, so it cannot be spoofed).
import { pool } from "../../core/db.js";

interface SyncEntry {
  term: string;
  term_lang: string;
  updated_at: number;
  [k: string]: unknown;
}

/** Pull a user's entries changed at/after `since`. */
export async function pull(userId: string, since: number) {
  const { rows } = await pool.query<{ payload: string }>(
    "SELECT payload FROM user_data WHERE user_id = $1 AND updated_at >= $2",
    [userId, since],
  );
  return rows.map((r) => JSON.parse(r.payload));
}

/** Upsert the pushed entries (last-write-wins), then return the user's full set. */
export async function push(userId: string, entries: SyncEntry[]) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const e of entries) {
      // Force ownership to the authenticated user (ignore any client user_id).
      const owned = { ...e, user_id: userId };
      await client.query(
        `INSERT INTO user_data (user_id, term, term_lang, payload, updated_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, term, term_lang) DO UPDATE SET
           payload = EXCLUDED.payload,
           updated_at = EXCLUDED.updated_at
         WHERE EXCLUDED.updated_at >= user_data.updated_at`,
        [userId, e.term, e.term_lang, JSON.stringify(owned), e.updated_at],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const { rows } = await pool.query<{ payload: string }>(
    "SELECT payload FROM user_data WHERE user_id = $1",
    [userId],
  );
  return rows.map((r) => JSON.parse(r.payload));
}
