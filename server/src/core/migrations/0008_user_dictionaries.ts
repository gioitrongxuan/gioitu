// 0008 — Đồng bộ từ điển cá nhân (#70 — 6.2). Mỗi từ điển cá nhân của một user
// lưu thành một blob nén: payload = gzip(JSON { registry, terms[] }). Cột `bytes`
// (kích thước nén) cho phép tính quota nhanh mà không phải giải nén. LWW theo
// `updated_at`; tombstone nằm trong payload (registry.deletedAt), như user_data.

import type { Migration } from "./index.js";

export const migration: Migration = {
  version: "0008",
  name: "user_dictionaries",
  sql: `
    CREATE TABLE IF NOT EXISTS user_dictionaries (
      user_id    TEXT NOT NULL,
      dict_id    TEXT NOT NULL,
      payload    BYTEA NOT NULL,
      bytes      INTEGER NOT NULL,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (user_id, dict_id)
    );
    CREATE INDEX IF NOT EXISTS idx_userdict_updated ON user_dictionaries(user_id, updated_at);
  `,
};
