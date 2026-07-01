// 0005 — drop bảng `dict` phẳng cũ. 0003 đã backfill sang word/entry và code path
// mới KHÔNG còn đọc `dict`; giữ tới giờ chỉ làm "phao". Trên prod bảng này còn ~286k
// dòng MỒ CÔI (đến sau 0003 qua restore nên chưa từng merge) — đã chốt DROP thay vì
// backfill lại (nghĩa JA→VI đã có Mazii). Idempotent: IF EXISTS.

import type { Migration } from "./index.js";

export const migration: Migration = {
  version: "0005",
  name: "drop_dict",
  sql: `DROP TABLE IF EXISTS dict;`,
};
