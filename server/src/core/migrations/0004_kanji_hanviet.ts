// 0004 — thêm Hán-Việt cho kanji + index duyệt theo JLPT. Bảng `kanji` (tạo ở
// 0002) đã đủ cột cấu trúc; chỉ thiếu âm Hán-Việt (gioitu là từ điển JA→VI).
// han_viet là JSONB mảng vì một chữ có thể nhiều âm (行 → HÀNH, HÀNG).

import type { Migration } from "./index.js";

export const migration: Migration = {
  version: "0004",
  name: "kanji_hanviet",
  sql: `
    ALTER TABLE kanji ADD COLUMN IF NOT EXISTS han_viet JSONB;
    CREATE INDEX IF NOT EXISTS idx_kanji_jlpt ON kanji (native_lang, jlpt);
  `,
};
