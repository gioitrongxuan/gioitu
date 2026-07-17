// 0011 — Bình luận / góp ý của người dùng cho một từ trong từ điển hệ thống
// (#23). Công khai: guest đọc được, đăng nhập mới viết được. Khoá theo cùng bộ
// (term_lang, native_lang, term, reading) như store `terms` để không gộp đồng âm.
// `status` phục vụ post-moderation (admin có thể ẩn); mặc định 'visible'.

import type { Migration } from "./index.js";

export const migration: Migration = {
  version: "0011",
  name: "dict_comments",
  sql: `
    CREATE TABLE IF NOT EXISTS dict_comments (
      id          TEXT PRIMARY KEY,
      term_lang   TEXT NOT NULL,
      native_lang TEXT NOT NULL,
      term        TEXT NOT NULL,
      reading     TEXT,
      user_id     TEXT NOT NULL,
      author_name TEXT NOT NULL,
      body        TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'visible',   -- visible | hidden
      created_at  BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_comments_word
      ON dict_comments(term_lang, native_lang, term, reading, status, created_at);
  `,
};
