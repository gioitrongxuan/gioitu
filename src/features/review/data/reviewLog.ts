// Nhật ký ôn tập (review_log) — phần I/O.
// Append-only: mỗi lượt chấm ghi đúng một dòng, không sửa/xoá. Sống trong
// IndexedDB và được đồng bộ hai chiều lên cloud (reviewLogSync.ts).

import { getDb } from "@/shared/db";
import { ReviewLogEntry } from "@/shared/types";
import { SyncedLogRow, logRowsForUser, missingLogRows } from "../domain/reviewLog";

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

/**
 * Như `getReviewLog` nhưng chỉ từ `since` (epoch ms) trở đi — đồng bộ chỉ cần
 * phần đuôi, mà nhật ký của người ôn lâu năm thì dài: chặn dưới ngay trong khoảng
 * index rẻ hơn nhiều so với đọc cả kho rồi lọc bằng JS mỗi lượt đồng bộ.
 */
export async function getReviewLogSince(
  user_id: string,
  since: number,
): Promise<ReviewLogEntry[]> {
  const db = await getDb();
  const range = IDBKeyRange.bound([user_id, since], [user_id, []]);
  return db.getAllFromIndex("review_log", "by_user_ts", range);
}

/**
 * Ghi bổ sung nhật ký nhận từ nơi khác (file backup, cloud) dưới tên người đang
 * dùng: chỉ những dòng CHƯA có, so bằng danh tính lượt chấm. Nhận lại cùng một
 * dòng — nhập lại đúng file, hay kéo về dòng chính mình vừa đẩy lên — không được
 * nhân đôi lịch sử. Trả về số dòng thật sự ghi thêm.
 */
export async function appendMissingLog(
  user_id: string,
  incoming: (SyncedLogRow & { id?: number })[],
): Promise<number> {
  // Lượt đồng bộ nào cũng gọi hàm này, mà hầu hết lượt không có gì để nhận —
  // đừng đọc cả kho chỉ để so với mẻ rỗng.
  if (incoming.length === 0) return 0;
  const existing = await getReviewLog(user_id);
  const missing = missingLogRows(existing, logRowsForUser(incoming, user_id));
  if (missing.length === 0) return 0;

  const db = await getDb();
  const tx = db.transaction("review_log", "readwrite");
  for (const row of missing) await tx.store.add(row);
  await tx.done;
  return missing.length;
}
