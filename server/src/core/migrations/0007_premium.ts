// 0007 — Premium entitlement (#70 — 6.2 gate). Cờ `is_premium` trên tài khoản
// (owner sync vẫn là user_id; mã chỉ mở khoá) + bảng mã kích hoạt do admin cấp
// tay (chưa tích hợp thanh toán). SQL idempotent như mọi migration khác.

import type { Migration } from "./index.js";

export const migration: Migration = {
  version: "0007",
  name: "premium",
  sql: `
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_premium BOOLEAN NOT NULL DEFAULT false;

    CREATE TABLE IF NOT EXISTS premium_codes (
      code TEXT PRIMARY KEY,
      created_at BIGINT NOT NULL,
      redeemed_by TEXT,
      redeemed_at BIGINT
    );
  `,
};
