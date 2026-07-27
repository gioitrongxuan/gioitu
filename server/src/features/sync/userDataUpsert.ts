// Câu UPSERT một dòng user_data theo khoá (user_id, term, term_lang) — dùng
// chung giữa push đồng bộ (syncStore) và lưu note Yomitan (ankiStore): hai đường
// ghi merge khác nhau nhưng phải cùng một câu ghi và cùng kỷ luật đóng dấu
// `received_at` (mốc hiệu lực LWW = min(updated_at, received_at) — xem lww.ts).
// Caller cầm client để câu ghi chạy trong transaction + row lock của chính nó.

import type { PoolClient } from "pg";

/** Phần tối thiểu của một entry để ghi được một dòng user_data; payload lưu
 *  nguyên object (các field còn lại đi theo qua JSON.stringify). */
interface UserDataEntry {
  term: string;
  term_lang: string;
  updated_at: number;
}

export async function upsertUserData(
  client: PoolClient,
  userId: string,
  entry: UserDataEntry,
  receivedAt: number,
): Promise<void> {
  await client.query(
    `INSERT INTO user_data (user_id, term, term_lang, payload, updated_at, received_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, term, term_lang) DO UPDATE SET
       payload = EXCLUDED.payload,
       updated_at = EXCLUDED.updated_at,
       received_at = EXCLUDED.received_at`,
    [userId, entry.term, entry.term_lang, JSON.stringify(entry), entry.updated_at, receivedAt],
  );
}
