// Word Cloud logic (SPEC 4.3).
// Colour depends ONLY on lookup_count (independent of SRS).
// Visibility depends on SRS status (LEARNED is hidden).

import { isDue } from "./srs";
import { isDeleted } from "./lifecycle";
import { filterByLabel, LabelFilter } from "./labels";
import { DEFAULT_SRS_CONFIG, SrsConfig } from "./constants";
import { VocabEntry } from "@/shared/types";
import { LangCode } from "@/shared/languages";
import { meaningToLines } from "@/shared/meaning";
import { formatRelative } from "@/shared/format";
import { DAY_MS, pad2, startOfDay } from "@/shared/date";

export interface CloudTag {
  entry: VocabEntry;
  /** log-normalized shade in [0,1]; 0 = light grey, 1 = dark/strong. */
  shade: number;
  /** Whether the word carries the relapse warning badge. */
  hasBadge: boolean;
  /** Whether the word is due for review now (used by the filter highlight). */
  due: boolean;
}

/**
 * A word is visible on the main cloud while it is being actively learned.
 * LEARNED ("mature") words are hidden to free up space (SPEC 4.3 / constraint 4),
 * and so are deleted words.
 */
export function isVisibleOnCloud(
  entry: Pick<VocabEntry, "status"> & Partial<Pick<VocabEntry, "deleted_at">>,
): boolean {
  if (isDeleted(entry)) return false;
  return entry.status === "LEARNING" || entry.status === "RELAPSED";
}

export interface ShadeOptions {
  /** Enable time-decay of lookup weight (SPEC 4.3, default OFF in v1). */
  timeDecay?: boolean;
  /** Decay rate λ per day when timeDecay is on. */
  lambda?: number;
  /** Reference "now" for time-decay. */
  now?: number;
}

/**
 * Cloud ordering:
 *   - "recent"    : most recently looked-up first (default) — newly looked-up
 *                   words surface at the top.
 *   - "frequency" : most looked-up first (by lookup_count).
 */
export type CloudSort = "recent" | "frequency";

/**
 * Language segment of the cloud. "all" mixes every language; otherwise only
 * words whose `term_lang` matches are kept. The UI offers Nhật/Anh/Cả hai, but
 * the predicate is generic over any language code.
 */
export type CloudLang = "all" | LangCode;

/** Granularity of the "hiển thị theo ngày/tháng/năm" display mode. */
export type TimeGrouping = "none" | "day" | "month" | "year";

/**
 * Cách nhóm Word Cloud mà người dùng chọn: theo thời gian (day/month/year) HOẶC
 * theo tầng trí nhớ ("srs" — "Khu vườn ký ức", DESIGN §4). "none" = phẳng.
 */
export type CloudGrouping = TimeGrouping | "srs";

export interface BuildCloudOptions extends ShadeOptions {
  sort?: CloudSort;
  /** Restrict the cloud to one language (default "all" = mixed). */
  lang?: CloudLang;
  /** Restrict the cloud to words added recently (default "all" = mọi lúc). */
  addedWindow?: AddedWindow;
  /** Lọc theo nhãn người dùng (#249): "all" = không lọc, "none" = chưa gắn nhãn. */
  label?: LabelFilter;
}

/** Effective lookup weight, optionally decayed by time since last lookup. */
export function effectiveCount(entry: Pick<VocabEntry, "lookup_count" | "last_lookup_at">, opts: ShadeOptions = {}): number {
  if (!opts.timeDecay) return entry.lookup_count;
  const lambda = opts.lambda ?? 0.05;
  const now = opts.now ?? Date.now();
  const days = Math.max(0, (now - entry.last_lookup_at) / DAY_MS);
  return entry.lookup_count * Math.exp(-lambda * days);
}

/**
 * Log-normalized shade (SPEC 4.3 fix point 7):
 *   shade = log(1 + count) / log(1 + maxCount)
 * `maxCount` is the maximum effective count among the *visible* words and must
 * be recomputed on every render.
 */
export function computeShade(count: number, maxCount: number): number {
  if (maxCount <= 0) return 0;
  const shade = Math.log(1 + count) / Math.log(1 + maxCount);
  return Math.min(1, Math.max(0, shade));
}

/** Keep only entries in the chosen language ("all" keeps everything). */
export function filterByLang<T extends Pick<VocabEntry, "term_lang">>(entries: T[], lang: CloudLang): T[] {
  if (lang === "all") return entries;
  return entries.filter((e) => e.term_lang === lang);
}

/**
 * Cửa sổ "thêm gần đây": chỉ giữ những từ vào kho trong N ngày qua. Mục đích là
 * khoanh vùng một đợt học ("dạo này tôi học AWS") để ôn riêng nhóm đó, nên mốc
 * là `created_at` — lúc từ được thêm — chứ không phải `last_lookup_at`. Khác hẳn
 * `groupByPeriod`: cái kia *chia nhóm* để xem, cái này *thu hẹp* tập từ (kéo
 * theo cả hàng đợi phiên ôn).
 */
export type AddedWindow = "all" | "1d" | "7d" | "30d" | "90d";

/** Số ngày của mỗi cửa sổ; "all" không có mốc nên nằm ngoài bảng. */
export const ADDED_WINDOW_DAYS: Record<Exclude<AddedWindow, "all">, number> = {
  "1d": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

/** Nhãn tiếng Việt của mỗi cửa sổ — dùng chung cho select và câu báo rỗng. */
export const ADDED_WINDOW_LABEL: Record<AddedWindow, string> = {
  all: "Mọi lúc",
  "1d": "1 ngày qua",
  "7d": "7 ngày qua",
  "30d": "30 ngày qua",
  "90d": "90 ngày qua",
};

/** Keep only entries added within the chosen window ("all" keeps everything). */
export function filterByAddedWithin<T extends Pick<VocabEntry, "created_at">>(
  entries: T[],
  added: AddedWindow,
  now: number,
): T[] {
  if (added === "all") return entries;
  const from = now - ADDED_WINDOW_DAYS[added] * DAY_MS;
  return entries.filter((e) => e.created_at >= from);
}

/**
 * Build the renderable cloud from a list of entries: filter to visible words
 * (optionally in one language, one nhãn and/or added within a window), compute
 * the shared max, then derive each tag's shade/badge/due flags.
 */
export function buildCloud(entries: VocabEntry[], opts: BuildCloudOptions = {}): CloudTag[] {
  const now = opts.now ?? Date.now();
  const visible = filterByAddedWithin(
    filterByLabel(
      filterByLang(entries.filter(isVisibleOnCloud), opts.lang ?? "all"),
      opts.label ?? "all",
    ),
    opts.addedWindow ?? "all",
    now,
  );

  // Order before computing shade so the max is unaffected by sorting.
  const sort = opts.sort ?? "recent";
  const ordered = visible.slice().sort((a, b) => {
    if (sort === "frequency") {
      // Higher lookup_count first; tie-break by most recent.
      return b.lookup_count - a.lookup_count || b.last_lookup_at - a.last_lookup_at;
    }
    // "recent": most recently looked-up first.
    return b.last_lookup_at - a.last_lookup_at;
  });

  const counts = ordered.map((e) => effectiveCount(e, opts));
  const maxCount = counts.reduce((m, c) => Math.max(m, c), 0);

  return ordered.map((entry, i) => ({
    entry,
    shade: computeShade(counts[i], maxCount),
    hasBadge: entry.status === "RELAPSED",
    due: isDue(entry, now),
  }));
}

/**
 * Nội dung popover mini của một thẻ trên Word Cloud (#159): cách đọc, nghĩa
 * đầu, lịch ôn và số lần tra — phần nào thiếu dữ liệu thì bỏ (từ tiếng Anh
 * không có `reading`, từ chưa lưu nghĩa, thẻ chưa có lịch…). Lịch ôn đọc là
 * "đến hạn" nếu quá hạn, ngược lại "ôn sau X" (tái dùng formatRelative).
 * Thay cho tooltip `title` trước đây; thuần để test dễ.
 */
export interface TagPopoverContent {
  reading?: string;
  gloss?: string;
  schedule?: string;
  lookupText: string;
}

export function tagPopoverContent(
  entry: Pick<VocabEntry, "reading" | "meaning" | "lookup_count" | "card_state" | "next_review">,
  now: number,
): TagPopoverContent {
  const gloss = meaningToLines(entry.meaning)[0];
  const schedule =
    entry.card_state != null && entry.next_review != null
      ? isDue(entry, now)
        ? "đến hạn"
        : `ôn ${formatRelative(entry.next_review, now)}`
      : undefined;
  return {
    reading: entry.reading || undefined,
    gloss: gloss || undefined,
    schedule,
    lookupText: `tra ${entry.lookup_count} lần`,
  };
}

/** A labelled time bucket of cloud tags, for the day/month/year display mode. */
export interface CloudGroup<T = CloudTag> {
  /** Sortable bucket key: "2026", "2026-06" or "2026-06-22". */
  key: string;
  /** Vietnamese heading, e.g. "Hôm nay", "22/06/2026", "Tháng 6 2026", "2026". */
  label: string;
  items: T[];
}

/**
 * The time bucket a timestamp falls into, as a sortable key plus a Vietnamese
 * label. Day buckets within the last two days read as "Hôm nay"/"Hôm qua".
 */
export function periodOf(
  ts: number,
  grouping: Exclude<TimeGrouping, "none">,
  now: number,
): { key: string; label: string } {
  const d = new Date(ts);
  const year = d.getFullYear();
  const month = d.getMonth() + 1; // getMonth() is 0-based
  const day = d.getDate();

  if (grouping === "year") return { key: `${year}`, label: `${year}` };
  if (grouping === "month") return { key: `${year}-${pad2(month)}`, label: `Tháng ${month} ${year}` };

  const key = `${year}-${pad2(month)}-${pad2(day)}`;
  const daysAgo = Math.round((startOfDay(now) - startOfDay(ts)) / DAY_MS);
  if (daysAgo === 0) return { key, label: "Hôm nay" };
  if (daysAgo === 1) return { key, label: "Hôm qua" };
  return { key, label: `${pad2(day)}/${pad2(month)}/${year}` };
}

/**
 * Partition tags into time buckets by a per-entry timestamp, newest bucket
 * first. Mặc định gom theo `last_lookup_at` (Word Cloud chính); truyền `tsOf`
 * để gom theo mốc khác — vd trang Đã thuộc gom theo `learned_at`. Tags keep
 * their incoming order within a bucket, so the caller's sort (recent/frequency)
 * is preserved inside each group.
 */
export function groupByPeriod<T extends { entry: Pick<VocabEntry, "last_lookup_at" | "learned_at"> }>(
  items: T[],
  grouping: Exclude<TimeGrouping, "none">,
  now: number,
  tsOf: (entry: Pick<VocabEntry, "last_lookup_at" | "learned_at">) => number = (e) => e.last_lookup_at,
): CloudGroup<T>[] {
  const groups = new Map<string, CloudGroup<T>>();
  for (const item of items) {
    const { key, label } = periodOf(tsOf(item.entry), grouping, now);
    const group = groups.get(key);
    if (group) group.items.push(item);
    else groups.set(key, { key, label, items: [item] });
  }
  // Keys are zero-padded and year-first, so lexical-descending = newest-first.
  return [...groups.values()].sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));
}

/**
 * Ba tầng "Khu vườn ký ức" (DESIGN §4), xếp theo độ vững của trí nhớ từ mong
 * manh đến gần trưởng thành. Chỉ áp cho từ đang hiện trên cloud (LEARNING /
 * RELAPSED); từ đã thuộc (LEARNED) vốn đã ẩn khỏi bản đồ.
 */
export type SrsTier = "forgetting" | "rooting" | "maturing";

/** Tiêu đề tiếng Việt cho mỗi tầng (DESIGN §4). */
const SRS_TIER_LABEL: Record<SrsTier, string> = {
  forgetting: "Sắp quên",
  rooting: "Đang bén rễ",
  maturing: "Sắp trưởng thành",
};

/** Thứ tự hiển thị: mong manh trước (cấp thiết nhất), trưởng thành sau. */
const SRS_TIER_ORDER: SrsTier[] = ["forgetting", "rooting", "maturing"];

/**
 * Xếp một từ vào tầng trí nhớ dựa CHỈ trên trạng thái SRS sẵn có (không thêm hằng
 * số mới):
 *  - "forgetting" (Sắp quên): vừa tái quên (RELAPSED) hoặc chưa rời các bước
 *    learning/relearning (`card_state ≠ REVIEW`) — trí nhớ còn mong manh, chưa
 *    bén rễ.
 *  - "maturing" (Sắp trưởng thành): thẻ REVIEW mà chỉ cần một lần "Nhớ" nữa là
 *    chạm ngưỡng trưởng thành (`srs_interval × ease_factor ≥ matureThreshold`).
 *  - "rooting" (Đang bén rễ): thẻ REVIEW còn lại — đã bén rễ và đang lớn dần.
 */
export function srsTier(
  entry: Pick<VocabEntry, "status" | "card_state" | "srs_interval" | "ease_factor">,
  cfg: SrsConfig = DEFAULT_SRS_CONFIG,
): SrsTier {
  if (entry.status === "RELAPSED" || entry.card_state !== "REVIEW") return "forgetting";
  return entry.srs_interval * entry.ease_factor >= cfg.matureThreshold ? "maturing" : "rooting";
}

/**
 * Phân các thẻ vào 3 tầng trí nhớ ("Khu vườn ký ức", DESIGN §4), giữ nguyên thứ
 * tự đến của thẻ trong mỗi tầng (nên sắp xếp recent/frequency của caller được bảo
 * toàn). Chỉ trả về tầng có thẻ, theo thứ tự mong manh → trưởng thành. Thuần để
 * test độc lập, soi gương `groupByPeriod`.
 */
export function groupBySrsTier<
  T extends { entry: Pick<VocabEntry, "status" | "card_state" | "srs_interval" | "ease_factor"> },
>(items: T[], cfg: SrsConfig = DEFAULT_SRS_CONFIG): CloudGroup<T>[] {
  const buckets = new Map<SrsTier, T[]>();
  for (const item of items) {
    const tier = srsTier(item.entry, cfg);
    const bucket = buckets.get(tier);
    if (bucket) bucket.push(item);
    else buckets.set(tier, [item]);
  }
  return SRS_TIER_ORDER.filter((tier) => buckets.has(tier)).map((tier) => ({
    key: tier,
    label: SRS_TIER_LABEL[tier],
    items: buckets.get(tier)!,
  }));
}

/**
 * Các entry đến hạn (due) trong một nhóm cloud — cấp N cho nút "Ôn N từ này"
 * theo tầng trí nhớ (DESIGN §4). Chỉ nhóm "srs" hiển thị nút này ở UI.
 */
export function dueEntriesInGroup(group: Pick<CloudGroup, "items">): VocabEntry[] {
  return group.items.filter((t) => t.due).map((t) => t.entry);
}

// Shade → colour mapping lives in the theme feature (`heatBackground` /
// `heatTextColor`), so the word-cloud "heatmap" follows the user's palette.
