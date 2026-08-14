// Lịch sử tra cứu (#269) — phần THUẦN: gộp một lượt tra vào dòng cũ, và xếp
// hai danh sách mà trang Tra cứu kể lại khi chưa tra gì ("Tra gần đây" / "Tra
// nhiều nhất"). I/O nằm ở data/searchHistory.ts.
//
// Đây KHÔNG phải dữ liệu học: ghi vào đây không tạo thẻ và không đụng
// `VocabEntry.lookup_count` (xem SearchHistoryEntry trong shared/types.ts).

import { SearchHistoryEntry } from "@/shared/types";

/** Trần số từ giữ lại cho mỗi người dùng — cắt theo lần tra gần nhất. */
export const HISTORY_LIMIT = 200;

/** Số từ hiện mỗi mục trên trang Tra cứu (đủ một-hai hàng chip, không thành tường). */
export const PANEL_LIMIT = 8;

/**
 * "Tra nhiều nhất" chỉ có nghĩa khi một từ đã tra lại — tra một lần thì mọi từ
 * cùng đếm 1, mục này sẽ chỉ là bản sao của "Tra gần đây".
 */
const TOP_MIN_COUNT = 2;

/** Danh tính một lượt tra: từ nào, dưới cặp ngôn ngữ nào. */
export type SearchSeed = Omit<SearchHistoryEntry, "count" | "lastAt">;

/**
 * Dòng cần ghi lại sau một lượt tra: chưa có thì đếm 1, có rồi thì +1 và dời
 * `lastAt`. Cách đọc lấy theo lượt mới nhất (từ điển vừa đổi/bổ sung reading thì
 * lịch sử theo kịp), nhưng lượt không có reading không xoá reading đang lưu.
 */
export function bumpSearch(
  prev: SearchHistoryEntry | undefined,
  seed: SearchSeed,
  now: number,
): SearchHistoryEntry {
  return {
    ...seed,
    reading: seed.reading ?? prev?.reading,
    count: (prev?.count ?? 0) + 1,
    lastAt: now,
  };
}

/** Vừa tra gì — mới nhất trước. */
export function recentSearches(rows: SearchHistoryEntry[], limit = PANEL_LIMIT): SearchHistoryEntry[] {
  return [...rows].sort(byRecent).slice(0, limit);
}

/**
 * Tra gì nhiều nhất — nhiều lượt trước, cùng số lượt thì từ mới tra gần đây
 * đứng trước. Rỗng cho tới khi có từ được tra lại (xem TOP_MIN_COUNT).
 */
export function topSearches(rows: SearchHistoryEntry[], limit = PANEL_LIMIT): SearchHistoryEntry[] {
  return rows
    .filter((r) => r.count >= TOP_MIN_COUNT)
    .sort((a, b) => b.count - a.count || byRecent(a, b))
    .slice(0, limit);
}

/**
 * Những dòng rơi ra ngoài trần `limit` (cũ nhất) — caller xoá chúng sau khi ghi,
 * để lịch sử không phình vô hạn theo mỗi từ từng gõ.
 */
export function staleSearches(rows: SearchHistoryEntry[], limit = HISTORY_LIMIT): SearchHistoryEntry[] {
  return [...rows].sort(byRecent).slice(limit);
}

function byRecent(a: SearchHistoryEntry, b: SearchHistoryEntry): number {
  return b.lastAt - a.lastAt;
}
