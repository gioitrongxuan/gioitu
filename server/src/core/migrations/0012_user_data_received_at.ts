// 0012 — LWW chống lệch đồng hồ (#166). Server đóng dấu `received_at` lúc nhận
// mỗi entry; mốc hiệu lực khi so LWW là min(updated_at, received_at) nên client
// lệch giờ về tương lai không còn thắng oan (xem features/sync/lww.ts).
// Backfill = LEAST(updated_at, now): dòng cũ chắc chắn được nhận trước lúc chạy
// migration, nên mốc ảo (updated_at tương lai) bị ghìm ngay từ đây.

import type { Migration } from "./index.js";

export const migration: Migration = {
  version: "0012",
  name: "user_data_received_at",
  sql: `
    ALTER TABLE user_data ADD COLUMN IF NOT EXISTS received_at BIGINT NOT NULL DEFAULT 0;
    UPDATE user_data
       SET received_at = LEAST(updated_at, (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT)
     WHERE received_at = 0;
  `,
};
