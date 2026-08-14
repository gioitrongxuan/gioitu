// Lịch sử tra cứu (#269) — phần I/O (IndexedDB, store `search_history`).
// Cục bộ theo thiết bị: không đồng bộ lên cloud, không nằm trong bản sao lưu
// dữ liệu học. Logic thuần (gộp lượt, xếp thứ tự, cắt trần) ở domain/.

import { getDb } from "@/shared/db";
import { SearchHistoryEntry } from "@/shared/types";
import { SearchSeed, bumpSearch, staleSearches } from "../domain/searchHistory";

/** Khoá chính của một dòng, đúng thứ tự keyPath. */
function keyOf(row: SearchSeed): [string, string, string, string] {
  return [row.user_id, row.term_lang, row.native_lang, row.term];
}

/**
 * Ghi nhận một lượt tra: +1 cho từ đã có, tạo mới nếu chưa, rồi cắt phần vượt
 * trần. Cả ba việc trong MỘT transaction để hai lượt tra sát nhau không đọc
 * cùng một `count` rồi ghi đè nhau (kết quả sẽ thiếu lượt).
 */
export async function recordSearch(seed: SearchSeed, now = Date.now()): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("search_history", "readwrite");
  const store = tx.store;
  await store.put(bumpSearch(await store.get(keyOf(seed)), seed, now));

  const all = await store.getAll(userRange(seed.user_id));
  for (const row of staleSearches(all)) await store.delete(keyOf(row));
  await tx.done;
}

/** Toàn bộ lịch sử của một người dùng (chưa sắp — domain lo thứ tự). */
export async function getSearchHistory(user_id: string): Promise<SearchHistoryEntry[]> {
  const db = await getDb();
  return db.getAll("search_history", userRange(user_id));
}

/** Xoá sạch lịch sử của một người dùng; trả lại các dòng vừa xoá để hoàn tác được. */
export async function clearSearchHistory(user_id: string): Promise<SearchHistoryEntry[]> {
  const db = await getDb();
  const tx = db.transaction("search_history", "readwrite");
  const rows = await tx.store.getAll(userRange(user_id));
  for (const row of rows) await tx.store.delete(keyOf(row));
  await tx.done;
  return rows;
}

/** Đặt lại các dòng đã xoá (nút "Hoàn tác" của toast). */
export async function restoreSearchHistory(rows: SearchHistoryEntry[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction("search_history", "readwrite");
  for (const row of rows) await tx.store.put(row);
  await tx.done;
}

/**
 * Mọi khoá bắt đầu bằng `user_id`: mảng rỗng đứng sau mọi chuỗi trong thứ tự
 * khoá IndexedDB, nên chặn trên `[user_id, []]` bắt trọn phần đuôi (cùng idiom
 * với `by_user_ts` của review_log).
 */
function userRange(user_id: string): IDBKeyRange {
  return IDBKeyRange.bound([user_id], [user_id, []]);
}
