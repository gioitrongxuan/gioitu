// Word Cloud logic (SPEC 4.3).
// Colour depends ONLY on lookup_count (independent of SRS).
// Visibility depends on SRS status (LEARNED is hidden).

import { isDue } from "./srs";
import { isDeleted } from "./lifecycle";
import { VocabEntry } from "@/shared/types";
import { LangCode } from "@/shared/languages";

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

export interface BuildCloudOptions extends ShadeOptions {
  sort?: CloudSort;
  /** Restrict the cloud to one language (default "all" = mixed). */
  lang?: CloudLang;
}

const DAY_MS = 24 * 60 * 60 * 1000;

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
 * Build the renderable cloud from a list of entries: filter to visible words
 * (optionally in one language), compute the shared max, then derive each tag's
 * shade/badge/due flags.
 */
export function buildCloud(entries: VocabEntry[], opts: BuildCloudOptions = {}): CloudTag[] {
  const visible = filterByLang(entries.filter(isVisibleOnCloud), opts.lang ?? "all");
  const now = opts.now ?? Date.now();

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

/** A labelled time bucket of cloud tags, for the day/month/year display mode. */
export interface CloudGroup<T = CloudTag> {
  /** Sortable bucket key: "2026", "2026-06" or "2026-06-22". */
  key: string;
  /** Vietnamese heading, e.g. "Hôm nay", "22/06/2026", "Tháng 6 2026", "2026". */
  label: string;
  items: T[];
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Local-midnight epoch of a timestamp (for the "Hôm nay"/"Hôm qua" labels). */
function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
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
 * Partition tags into time buckets by their entry's `last_lookup_at`, newest
 * bucket first. Tags keep their incoming order within a bucket, so the caller's
 * sort (recent/frequency) is preserved inside each group.
 */
export function groupByPeriod<T extends { entry: Pick<VocabEntry, "last_lookup_at"> }>(
  items: T[],
  grouping: Exclude<TimeGrouping, "none">,
  now: number,
): CloudGroup<T>[] {
  const groups = new Map<string, CloudGroup<T>>();
  for (const item of items) {
    const { key, label } = periodOf(item.entry.last_lookup_at, grouping, now);
    const group = groups.get(key);
    if (group) group.items.push(item);
    else groups.set(key, { key, label, items: [item] });
  }
  // Keys are zero-padded and year-first, so lexical-descending = newest-first.
  return [...groups.values()].sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));
}

// Shade → colour mapping lives in the theme feature (`heatBackground` /
// `heatTextColor`), so the word-cloud "heatmap" follows the user's palette.
