// 0010 — Đóng góp từ điển chung (#70 — 6.1). Người dùng đề xuất một từ; admin
// duyệt vào từ điển hệ thống hoặc từ chối. Bảng RIÊNG để đề xuất không chạm từ
// điển live cho tới khi được duyệt. Chỉ toàn text → dung lượng không đáng kể.

import type { Migration } from "./index.js";

export const migration: Migration = {
  version: "0010",
  name: "dict_proposals",
  sql: `
    CREATE TABLE IF NOT EXISTS dict_proposals (
      id          TEXT PRIMARY KEY,
      proposed_by TEXT NOT NULL,
      term_lang   TEXT NOT NULL,
      native_lang TEXT NOT NULL,
      term        TEXT NOT NULL,
      reading     TEXT,
      gloss       TEXT NOT NULL,   -- JSON string[]
      pos         TEXT,            -- JSON string[]
      status      TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
      created_at  BIGINT NOT NULL,
      reviewed_by TEXT,
      reviewed_at BIGINT
    );
    CREATE INDEX IF NOT EXISTS idx_proposals_status ON dict_proposals(status, created_at);
  `,
};
