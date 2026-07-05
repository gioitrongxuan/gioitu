// Data-access đồng bộ từ điển cá nhân (#70 — 6.2). Mỗi từ điển là một blob nén
// (gzip JSON) keyed theo (user_id, dict_id). LWW theo `registry.updatedAt`;
// ownership ép bằng cột user_id. Quota nén tối đa mỗi user để bảo vệ đĩa server.

import zlib from "node:zlib";
import { pool } from "../../core/db.js";

export interface SyncedDict {
  registry: { id: string; updatedAt?: number; deletedAt?: number; [k: string]: unknown };
  terms: unknown[];
}

/** Dung lượng NÉN tối đa mỗi user (bảo vệ đĩa ~10GB; premium-gated nên ít user). */
export const MAX_SYNC_BYTES = 2 * 1024 * 1024;

function decode(payload: Buffer): SyncedDict {
  return JSON.parse(zlib.gunzipSync(payload).toString("utf8")) as SyncedDict;
}

/** Kéo các từ điển thay đổi tại/sau `since` (kể cả tombstone trong payload). */
export async function pull(userId: string, since: number): Promise<SyncedDict[]> {
  const { rows } = await pool.query<{ payload: Buffer }>(
    "SELECT payload FROM user_dictionaries WHERE user_id = $1 AND updated_at >= $2",
    [userId, since],
  );
  return rows.map((r) => decode(r.payload));
}

export interface PushResult {
  ok: boolean;
  /** Toàn bộ tập của user (khi thành công). */
  dicts?: SyncedDict[];
  /** Tổng byte nén sau khi ghi (khi vượt quota). */
  usedBytes?: number;
  limit?: number;
}

/**
 * Upsert các từ điển được đẩy lên (LWW theo updated_at), rồi kiểm quota tổng.
 * Vượt quota → rollback (không lưu gì) và trả ok:false để client giữ bản local.
 */
export async function push(userId: string, dicts: SyncedDict[]): Promise<PushResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const d of dicts) {
      const dictId = d?.registry?.id;
      if (!dictId) continue; // bỏ blob không hợp lệ thay vì làm hỏng cả push
      const updatedAt = Number(d.registry.updatedAt ?? 0);
      const gz = zlib.gzipSync(Buffer.from(JSON.stringify(d), "utf8"));
      await client.query(
        `INSERT INTO user_dictionaries (user_id, dict_id, payload, bytes, updated_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, dict_id) DO UPDATE SET
           payload = EXCLUDED.payload, bytes = EXCLUDED.bytes, updated_at = EXCLUDED.updated_at
         WHERE EXCLUDED.updated_at >= user_dictionaries.updated_at`,
        [userId, dictId, gz, gz.length, updatedAt],
      );
    }

    const { rows } = await client.query<{ sum: string | null }>(
      "SELECT SUM(bytes)::bigint AS sum FROM user_dictionaries WHERE user_id = $1",
      [userId],
    );
    const usedBytes = Number(rows[0]?.sum ?? 0);
    if (usedBytes > MAX_SYNC_BYTES) {
      await client.query("ROLLBACK");
      return { ok: false, usedBytes, limit: MAX_SYNC_BYTES };
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const { rows } = await pool.query<{ payload: Buffer }>(
    "SELECT payload FROM user_dictionaries WHERE user_id = $1",
    [userId],
  );
  return { ok: true, dicts: rows.map((r) => decode(r.payload)) };
}
