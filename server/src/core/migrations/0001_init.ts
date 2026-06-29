// 0001 — chụp nguyên trạng schema hiện có (trước khi có migration runner).
// SQL idempotent (IF NOT EXISTS) nên DB đang chạy chỉ "đánh dấu đã áp dụng", còn
// DB mới thì được tạo từ đây. Nội dung = đúng phần initSchema() cũ trong core/db.ts.

import type { Migration } from "./index.js";

export const migration: Migration = {
  version: "0001",
  name: "init",
  sql: `
    -- Edit-distance matching for fuzzy look-up (levenshtein_less_equal).
    CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      google_sub TEXT,
      created_at BIGINT NOT NULL
    );
    ALTER TABLE users DROP COLUMN IF EXISTS password_hash;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS api_key TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_api_key ON users(api_key);

    CREATE TABLE IF NOT EXISTS dictionaries (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      term_lang TEXT NOT NULL,
      native_lang TEXT NOT NULL,
      created_at BIGINT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dict (
      term TEXT NOT NULL,
      term_lang TEXT NOT NULL,
      native_lang TEXT NOT NULL,
      reading TEXT,
      definitions TEXT NOT NULL,
      dict_id TEXT REFERENCES dictionaries(id) ON DELETE SET NULL,
      PRIMARY KEY (term_lang, native_lang, term)
    );
    ALTER TABLE dict ADD COLUMN IF NOT EXISTS dict_id TEXT
      REFERENCES dictionaries(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_dict_source ON dict(dict_id);
    CREATE INDEX IF NOT EXISTS idx_dict_reading ON dict(term_lang, native_lang, reading);

    CREATE TABLE IF NOT EXISTS user_data (
      user_id TEXT NOT NULL,
      term TEXT NOT NULL,
      term_lang TEXT NOT NULL,
      payload TEXT NOT NULL,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (user_id, term, term_lang)
    );
    CREATE INDEX IF NOT EXISTS idx_user_updated ON user_data(user_id, updated_at);
  `,
};
