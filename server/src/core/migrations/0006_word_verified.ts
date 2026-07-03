// 0006 — cờ kiểm duyệt trên `word`: admin duyệt nội dung một từ thì từ đó mang
// tích xanh khi tra. Mặc định FALSE — dữ liệu nhập máy (Mazii/JMdict) chưa được
// coi là đã duyệt cho tới khi con người xác nhận.

import type { Migration } from "./index.js";

export const migration: Migration = {
  version: "0006",
  name: "word_verified",
  sql: `
    ALTER TABLE word ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT FALSE;
  `,
};
