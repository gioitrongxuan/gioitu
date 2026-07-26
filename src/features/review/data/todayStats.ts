// Số liệu màn "Hôm nay" (#150) — phần I/O: đọc nhật ký ôn tập cục bộ một lần
// rồi giao cho domain tính cả chuỗi ngày lẫn dải hoạt động. App inject hàm này
// vào TodayScreen (cùng idiom loadReviewStreak → ThemeSettings) để màn hình
// không phải biết review_log.

import { getReviewLog } from "./reviewLog";
import { computeStreak, StreakInfo } from "../domain/streak";
import { activityByDay, ActivityDay } from "../domain/reviewStats";

export interface TodayStats {
  streak: StreakInfo;
  /** 7 ngày gần nhất, phần tử cuối = hôm nay. */
  activity: ActivityDay[];
}

export async function loadTodayStats(user_id: string): Promise<TodayStats> {
  const rows = await getReviewLog(user_id);
  const now = Date.now();
  return {
    streak: computeStreak(rows.map((row) => row.ts), now),
    activity: activityByDay(rows, now),
  };
}
