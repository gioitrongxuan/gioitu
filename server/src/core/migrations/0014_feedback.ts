// 0014 — Góp ý về web (#244). Người dùng gửi góp ý/báo lỗi về chính app; admin
// đọc rồi đánh dấu đã xử lý. Bảng RIÊNG, không dính gì tới từ điển hay dữ liệu
// học — chỉ toàn text nên dung lượng không đáng kể. Email người gửi KHÔNG lưu ở
// đây: join `users` lúc đọc để admin không đọc phải bản sao email lạc hậu.

import type { Migration } from "./index.js";

export const migration: Migration = {
  version: "0014",
  name: "feedback",
  sql: `
    CREATE TABLE IF NOT EXISTS feedback (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      kind       TEXT NOT NULL,                   -- bug | idea | other
      message    TEXT NOT NULL,
      status     TEXT NOT NULL DEFAULT 'new',     -- new | handled
      created_at BIGINT NOT NULL,
      handled_by TEXT,
      handled_at BIGINT
    );
    CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status, created_at DESC);
  `,
};
