// Danh sách migration theo thứ tự áp dụng. Mỗi migration là module TS chứa SQL
// string (đánh số) — robust hơn đọc file .sql vì server chạy thẳng bằng tsx
// (không bundle/copy asset). Runner ở core/migrate.ts.

import { migration as m0001 } from "./0001_init.js";
import { migration as m0002 } from "./0002_dictionary_core.js";
import { migration as m0003 } from "./0003_backfill_dict.js";
import { migration as m0004 } from "./0004_kanji_hanviet.js";
import { migration as m0005 } from "./0005_drop_dict.js";
import { migration as m0006 } from "./0006_word_verified.js";
import { migration as m0007 } from "./0007_premium.js";
import { migration as m0008 } from "./0008_user_dictionaries.js";
import { migration as m0009 } from "./0009_shares.js";
import { migration as m0010 } from "./0010_dict_proposals.js";
import { migration as m0011 } from "./0011_dict_comments.js";

export interface Migration {
  /** Mã phiên bản, vd "0001". Dùng làm khoá trong schema_migrations. */
  version: string;
  name: string;
  sql: string;
}

export const migrations: Migration[] = [m0001, m0002, m0003, m0004, m0005, m0006, m0007, m0008, m0009, m0010, m0011];

/** Các migration chưa áp dụng, giữ nguyên thứ tự. Thuần → test được không cần DB. */
export function pendingMigrations(applied: Set<string>, all: Migration[] = migrations): Migration[] {
  return all.filter((m) => !applied.has(m.version));
}
