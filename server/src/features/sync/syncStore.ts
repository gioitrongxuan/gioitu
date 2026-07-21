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

/**
 * Hợp nhất field-level một cặp entry cùng khoá (giống client repository.ts):
 * `lookup_count` & `lapses` lấy MAX (bộ đếm chỉ tăng), phần còn lại theo bản mới
 * hơn (LWW theo `updated_at`). Chống mất lượt khi hai thiết bị cùng học một từ
 * rồi push đè nhau — LWW nguyên blob sẽ nuốt bộ đếm của bên thua.
 */
function mergeEntryPair(existing: SyncEntry, incoming: SyncEntry): SyncEntry {
  const winner = incoming.updated_at >= existing.updated_at ? incoming : existing;
  const num = (v: unknown) => (typeof v === "number" ? v : 0);
  return {
    ...winner,
    lookup_count: Math.max(num(existing.lookup_count), num(incoming.lookup_count)),
    lapses: Math.max(num(existing.lapses), num(incoming.lapses)),
  };
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
      // Đọc bản hiện có (khoá dòng để hai push đồng thời không đua) rồi merge
      // field-level thay vì LWW nguyên blob, giữ max lookup_count/lapses.
      const { rows } = await client.query<{ payload: string }>(
        `SELECT payload FROM user_data
         WHERE user_id = $1 AND term = $2 AND term_lang = $3 FOR UPDATE`,
        [userId, owned.term, owned.term_lang],
      );
      const merged = rows[0]
        ? mergeEntryPair(JSON.parse(rows[0].payload), owned)
        : owned;
      await client.query(
        `INSERT INTO user_data (user_id, term, term_lang, payload, updated_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, term, term_lang) DO UPDATE SET
           payload = EXCLUDED.payload,
           updated_at = EXCLUDED.updated_at`,
        [userId, owned.term, owned.term_lang, JSON.stringify(merged), merged.updated_at],
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
