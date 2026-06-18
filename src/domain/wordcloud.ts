// Word Cloud logic (SPEC 4.3).
// Colour depends ONLY on lookup_count (independent of SRS).
// Visibility depends on SRS status (LEARNED is hidden).

import { isDue } from "./srs";
import { VocabEntry } from "./types";

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
 * LEARNED ("mature") words are hidden to free up space (SPEC 4.3 / constraint 4).
 */
export function isVisibleOnCloud(entry: Pick<VocabEntry, "status">): boolean {
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

/**
 * Build the renderable cloud from a list of entries: filter to visible words,
 * compute the shared max, then derive each tag's shade/badge/due flags.
 */
export function buildCloud(entries: VocabEntry[], opts: ShadeOptions = {}): CloudTag[] {
  const visible = entries.filter(isVisibleOnCloud);
  const now = opts.now ?? Date.now();
  const counts = visible.map((e) => effectiveCount(e, opts));
  const maxCount = counts.reduce((m, c) => Math.max(m, c), 0);

  return visible.map((entry, i) => ({
    entry,
    shade: computeShade(counts[i], maxCount),
    hasBadge: entry.status === "RELAPSED",
    due: isDue(entry, now),
  }));
}

/**
 * Map a shade in [0,1] to a CSS background colour from light grey → near-black.
 * Returns an `hsl(...)` string; lightness goes 92% (light) → 12% (dark).
 */
export function shadeToColor(shade: number): string {
  const lightness = Math.round(92 - shade * 80); // 92% → 12%
  return `hsl(220, 12%, ${lightness}%)`;
}

/** Text colour that stays readable against the computed background. */
export function shadeToTextColor(shade: number): string {
  return shade > 0.55 ? "#f5f5f5" : "#1a1a1a";
}
