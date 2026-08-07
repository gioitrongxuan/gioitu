// Đồng bộ nhật ký ôn tập với cloud (BACKLOG GĐ0). Vì sao cần: chuỗi ngày + dải
// hoạt động 7 ngày ở màn "Hôm nay" đọc thẳng từ `review_log`, nên khi nhật ký chỉ
// nằm trong IndexedDB của từng máy, ôn trên điện thoại xong mở máy tính là thấy
// chuỗi ngày đứt oan (và ngược lại).
//
// Kỷ luật khác user_data: nhật ký append-only nên không có LWW — đồng bộ hai
// chiều ở đây chỉ là "bù các dòng bên kia chưa có", cả hai đầu tự khử trùng lặp.
// Hai con trỏ (reviewLogCursor) để mỗi lượt chỉ chuyển phần mới: đẩy các dòng từ
// mốc `pushedThrough`, kéo các dòng sau `pulledSeq` — `seq` do server cấp theo
// thứ tự ghi, nhờ vậy một máy offline nhiều ngày rồi mới đẩy nhật ký cũ lên vẫn
// tới được các máy khác.

import { SyncStatus } from "../domain/syncStatus";
import { maxTs, rowsToPush } from "../domain/reviewLog";
import { appendMissingLog, getReviewLogSince } from "./reviewLog";
import { pullReviewLog, pushReviewLog } from "./reviewLogApi";
import { readReviewLogCursor, writeReviewLogCursor } from "./reviewLogCursor";

/**
 * Trần số trang kéo trong MỘT lượt đồng bộ. Máy mới tinh của người ôn lâu năm
 * cần nhiều trang, nhưng vòng lặp phải có điểm dừng cứng; phần còn lại sang lượt
 * sau (con trỏ đã lưu nên không mất gì).
 */
const MAX_PULL_PAGES = 20;

/** Kết quả một lượt đồng bộ nhật ký — đủ để caller phản hồi trung thực. */
export interface ReviewLogSyncReport {
  status: SyncStatus;
  /** Số dòng server ghi mới thật sự (đã trừ dòng nó đã có). */
  pushed: number;
  /** Số dòng mới ghi xuống IndexedDB — >0 nghĩa là thống kê cần đọc lại. */
  pulled: number;
}

export async function syncReviewLog(user_id: string): Promise<ReviewLogSyncReport> {
  const cursor = readReviewLogCursor(user_id);
  let pushed = 0;

  // Đọc sẵn theo khoảng index từ mốc trở đi (kho có thể rất dài); rowsToPush lo
  // phần bỏ `id`/`user_id` — và giữ luôn điều kiện mốc để logic chọn nằm ở domain.
  const local = await getReviewLogSince(user_id, cursor.pushedThrough);
  const outgoing = rowsToPush(local, cursor.pushedThrough);
  if (outgoing.length > 0) {
    const res = await pushReviewLog(outgoing);
    // Chưa đẩy được thì cũng chưa kéo: mốc giữ nguyên, lượt sau làm lại từ đây.
    if (res.status !== "ok") return { status: res.status, pushed: 0, pulled: 0 };
    pushed = res.inserted;
    cursor.pushedThrough = maxTs(outgoing, cursor.pushedThrough);
    writeReviewLogCursor(user_id, cursor);
  }

  let pulled = 0;
  for (let page = 0; page < MAX_PULL_PAGES; page++) {
    const res = await pullReviewLog(cursor.pulledSeq);
    if (res.status !== "ok") return { status: res.status, pushed, pulled };
    pulled += await appendMissingLog(user_id, res.rows);
    // Ghi con trỏ sau khi đã ghi xong dòng của trang: mất điện giữa chừng thì
    // lượt sau kéo lại trang đó (khử trùng lặp lo phần còn lại), không bỏ sót.
    cursor.pulledSeq = res.cursor;
    writeReviewLogCursor(user_id, cursor);
    if (!res.more) break;
  }

  return { status: "ok", pushed, pulled };
}
