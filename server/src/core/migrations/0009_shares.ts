// 0009 — Link chia sẻ tạm (#70 — 5.2). Kho blob EPHEMERAL: nhận file .zip từ
// client, phát một link tải sống trong 5 phút rồi tự xoá. Khác hẳn kho đồng bộ
// (user_dictionaries) vốn là nguồn sự thật bền vững — ở đây TTL mới là đúng chỗ.

import type { Migration } from "./index.js";

export const migration: Migration = {
  version: "0009",
  name: "shares",
  sql: `
    CREATE TABLE IF NOT EXISTS shares (
      id         TEXT PRIMARY KEY,
      blob       BYTEA NOT NULL,
      bytes      INTEGER NOT NULL,
      filename   TEXT NOT NULL,
      expires_at BIGINT NOT NULL,
      created_at BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_shares_expires ON shares(expires_at);
  `,
};
