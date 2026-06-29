// Migration runner. Chạy lúc khởi động (thay cho initSchema() inline cũ): tạo
// bảng schema_migrations, rồi áp dụng tuần tự các migration chưa chạy — mỗi cái
// trong một transaction. Áp lại an toàn vì SQL idempotent (IF NOT EXISTS).

import { pool } from "./db.js";
import { pendingMigrations } from "./migrations/index.js";

export async function runMigrations(): Promise<void> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version TEXT PRIMARY KEY,
       applied_at BIGINT NOT NULL
     )`,
  );

  const { rows } = await pool.query<{ version: string }>("SELECT version FROM schema_migrations");
  const applied = new Set(rows.map((r) => r.version));

  for (const m of pendingMigrations(applied)) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(m.sql);
      await client.query("INSERT INTO schema_migrations (version, applied_at) VALUES ($1, $2)", [
        m.version,
        Date.now(),
      ]);
      await client.query("COMMIT");
      console.log(`✓ migration ${m.version} (${m.name})`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`migration ${m.version} (${m.name}) thất bại: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }
}
