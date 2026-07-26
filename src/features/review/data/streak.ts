// Chuỗi ngày ôn của một người dùng — phần I/O: đọc nhật ký ôn tập cục bộ rồi
// giao cho domain/streak tính. App inject hàm này vào màn Giao diện (bộ sưu
// tập skin, #162) để feature theme không phải import ngược sang review.

import { getReviewLog } from "./reviewLog";
import { computeStreak, StreakInfo } from "../domain/streak";

export async function loadReviewStreak(user_id: string): Promise<StreakInfo> {
  const rows = await getReviewLog(user_id);
  return computeStreak(rows.map((row) => row.ts), Date.now());
}
