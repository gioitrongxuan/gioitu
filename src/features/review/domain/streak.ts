// Chuỗi ngày ôn (streak) — logic thuần trên các mốc thời gian lượt chấm
// (review_log.ts). Ngày tính theo múi giờ máy người dùng: chấm bao nhiêu lượt
// trong cùng một ngày cũng chỉ là một ngày có ôn.

export interface StreakInfo {
  /**
   * Chuỗi đang chạy: số ngày ôn liên tiếp tính đến hôm nay. Hôm nay chưa ôn
   * thì chuỗi kết thúc ở hôm qua vẫn được tính là "đang chạy" — người dùng còn
   * nguyên hôm nay để nối tiếp, chưa coi là đứt.
   */
  current: number;
  /** Chuỗi dài nhất từng đạt trong toàn bộ nhật ký. */
  longest: number;
}

export const EMPTY_STREAK: StreakInfo = { current: 0, longest: 0 };

const MS_PER_DAY = 86_400_000;

/** Số thứ tự ngày ĐỊA PHƯƠNG chứa mốc `ts` (ngày đổi lúc 0h máy người dùng). */
function localDayNumber(ts: number): number {
  const d = new Date(ts);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / MS_PER_DAY);
}

/**
 * Tính chuỗi ngày ôn từ danh sách mốc thời gian các lượt chấm (không cần sắp
 * trước). `now` do caller truyền vào để logic thuần và test được.
 */
export function computeStreak(reviewTimestamps: readonly number[], now: number): StreakInfo {
  const days = [...new Set(reviewTimestamps.map(localDayNumber))].sort((a, b) => a - b);
  if (days.length === 0) return EMPTY_STREAK;

  // `run` sau vòng lặp là độ dài loạt ngày liên tiếp KẾT THÚC ở ngày ôn cuối —
  // chính là ứng viên cho chuỗi đang chạy.
  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    run = days[i] === days[i - 1] + 1 ? run + 1 : 1;
    if (run > longest) longest = run;
  }

  const today = localDayNumber(now);
  const lastDay = days[days.length - 1];
  const isRunning = lastDay === today || lastDay === today - 1;
  return { current: isRunning ? run : 0, longest };
}
