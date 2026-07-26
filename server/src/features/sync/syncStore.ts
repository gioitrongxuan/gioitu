// Cloud-sync data-access (SPEC 2.C). Last-write-wins theo mốc hiệu lực
// min(updated_at, received_at) — server đóng dấu `received_at` lúc nhận để máy
// lệch đồng hồ không thắng oan (#166); logic thuần ở lww.ts. Ownership luôn ép
// về user đã xác thực (user_id do client gửi bị bỏ qua, không giả mạo được).
import { pool } from "../../core/db.js";
import { SyncEntry, mergeStampedEntries } from "./lww.js";

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
  // Một mốc nhận cho cả mẻ: các entry cùng lượt push đến cùng lúc.
  const receivedAt = Date.now();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const e of entries) {
      // Force ownership to the authenticated user (ignore any client user_id).
      const owned = { ...e, user_id: userId };
      // Đọc bản hiện có (khoá dòng để hai push đồng thời không đua) rồi merge
      // field-level thay vì LWW nguyên blob, giữ max lookup_count/lapses.
      const { rows } = await client.query<{ payload: string; received_at: string }>(
        `SELECT payload, received_at FROM user_data
         WHERE user_id = $1 AND term = $2 AND term_lang = $3 FOR UPDATE`,
        [userId, owned.term, owned.term_lang],
      );
      const merged = rows[0]
        ? mergeStampedEntries(
            { entry: JSON.parse(rows[0].payload), receivedAt: Number(rows[0].received_at) },
            { entry: owned, receivedAt },
          )
        : { entry: owned, receivedAt };
      await client.query(
        `INSERT INTO user_data (user_id, term, term_lang, payload, updated_at, received_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, term, term_lang) DO UPDATE SET
           payload = EXCLUDED.payload,
           updated_at = EXCLUDED.updated_at,
           received_at = EXCLUDED.received_at`,
        [
          userId,
          owned.term,
          owned.term_lang,
          JSON.stringify(merged.entry),
          merged.entry.updated_at,
          merged.receivedAt,
        ],
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
