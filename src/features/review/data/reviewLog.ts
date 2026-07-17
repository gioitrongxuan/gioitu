// Nhật ký ôn tập (review_log) — phần I/O.
// Append-only: mỗi lượt chấm ghi đúng một dòng, không sửa/xoá. Cục bộ trong
// IndexedDB; chưa đồng bộ lên cloud (để dành cho giai đoạn thống kê).

import { getDb } from "@/shared/db";
import { ReviewLogEntry } from "@/shared/types";

/**
 * Ghi thêm một dòng nhật ký. Dùng `add` (không phải `put`) để đúng nghĩa
 * append-only: khoá `id` do IndexedDB tự cấp, không lượt ghi nào đè lượt trước.
 */
export async function appendReviewLog(entry: ReviewLogEntry): Promise<void> {
  const db = await getDb();
  await db.add("review_log", entry);
}

/**
 * Đọc toàn bộ nhật ký của một người dùng, sắp theo `ts` tăng dần (phục vụ thống
 * kê). Dùng index `by_user_ts`: chặn dưới `[user_id]` và chặn trên `[user_id,
 * []]` — mảng rỗng đứng sau mọi `ts` số trong thứ tự khoá IndexedDB, nên khoảng
 * này bắt trọn các dòng cùng `user_id` bất kể thời gian.
 */
export async function getReviewLog(user_id: string): Promise<ReviewLogEntry[]> {
  const db = await getDb();
  const range = IDBKeyRange.bound([user_id], [user_id, []]);
  return db.getAllFromIndex("review_log", "by_user_ts", range);
}
