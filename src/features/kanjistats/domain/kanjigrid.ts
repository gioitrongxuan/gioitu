// Kanji mastery statistics — a port of Kuuuube's Anki "Kanji Grid" add-on
// (ref/kanjigrid) to gioitu's vocabulary + SRS model. Pure functions only: no
// I/O and no `Date`, so the whole page is deterministic and testable.
//
// Concept (unchanged from the add-on): every word you know contributes its
// kanji. A kanji's mastery is the strength — the average SRS interval — of the
// words that contain it, mapped through the add-on's `score_adjust` curve. A
// "grouping" (JLPT, cấp lớp…) then turns that into coverage: how many kanji of
// a known set you already command, and which are still missing.

import { isCodePointKanji } from "@/shared/japanese";
import { DEFAULT_SRS_CONFIG } from "@/features/review/domain/constants";
import { VocabEntry } from "@/shared/types";

const MINUTES_PER_DAY = 1440;

/**
 * Interval (in days) that reads as the "strong" reference on the colour scale.
 * We anchor it to the SRS mature threshold — the point at which a word counts as
 * learned — rather than the add-on's arbitrary 180 days: on gioitu's scale a
 * just-learned kanji should already read strong (ratio 1 → score 0.75), while
 * words reviewed further (longer intervals) shade on up toward 1. Kept in sync
 * with the SRS engine so the two definitions of "learned" never drift.
 */
export const STRONG_INTERVAL_DAYS = DEFAULT_SRS_CONFIG.matureThreshold / MINUTES_PER_DAY;

/** Per-kanji aggregate over the source words. */
export interface KanjiStat {
  kanji: string;
  /** Number of source words containing this kanji. */
  wordCount: number;
  /** Average `srs_interval` (minutes) across those words. */
  avgInterval: number;
  /** Mastery score in [0,1): `scoreAdjust(avgIntervalDays / strongIntervalDays)`. */
  score: number;
}

/**
 * The add-on's score curve (`util.score_adjust`): maps an interval ratio in
 * [0,∞) to [0,1), rising fast then flattening — so early progress is visible
 * while very long intervals don't run away. ratio 0 → 0, ratio 1 → 0.75.
 */
export function scoreAdjust(ratio: number): number {
  const s = ratio + 1;
  return 1 - 1 / (s * s);
}

/** Distinct kanji in a term, in first-seen order (kana/punctuation ignored). */
export function kanjiOf(term: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const ch of term) {
    if (isCodePointKanji(ch.codePointAt(0) ?? 0) && !seen.has(ch)) {
      seen.add(ch);
      out.push(ch);
    }
  }
  return out;
}

type SourceWord = Pick<VocabEntry, "term" | "srs_interval">;

/**
 * Aggregate kanji mastery over a set of source words. Each word folds its
 * `srs_interval` into a running average for every distinct kanji it contains
 * (`add_data_from_card` in the add-on); the score then comes from that averaged
 * interval against the "strong" threshold. Words with no interval (0) still
 * count toward `wordCount` but pull the average — and thus the score — down.
 */
export function computeKanjiStats(
  words: SourceWord[],
  strongIntervalDays: number = STRONG_INTERVAL_DAYS,
): Map<string, KanjiStat> {
  const stats = new Map<string, KanjiStat>();
  for (const word of words) {
    const interval = word.srs_interval ?? 0;
    for (const kanji of kanjiOf(word.term)) {
      const prev = stats.get(kanji);
      if (prev) {
        prev.avgInterval = (prev.avgInterval * prev.wordCount + interval) / (prev.wordCount + 1);
        prev.wordCount += 1;
      } else {
        stats.set(kanji, { kanji, wordCount: 1, avgInterval: interval, score: 0 });
      }
    }
  }

  const strongMinutes = strongIntervalDays * MINUTES_PER_DAY;
  for (const stat of stats.values()) {
    stat.score = scoreAdjust(stat.avgInterval / strongMinutes);
  }
  return stats;
}

/** Known kanji, strongest first — the flat ("Không nhóm") view. */
export function knownKanji(stats: Map<string, KanjiStat>): KanjiStat[] {
  return [...stats.values()].sort((a, b) => b.score - a.score || b.wordCount - a.wordCount);
}

// --- Groupings (JLPT, cấp lớp…) — same JSON shape as the add-on's data files. --

export interface KanjiGroup {
  name: string;
  /** Every kanji of the group, concatenated into one string. */
  characters: string;
}

export interface KanjiGrouping {
  name: string;
  /** ISO 639-1 of the target language (all built-ins are "ja"). */
  lang: string;
  /** Attribution for the source of the list, shown at the foot of the grid. */
  source: string;
  /** Heading for known kanji that fall in none of the groups. */
  leftover_group: string;
  groups: KanjiGroup[];
}

/** One kanji of a group, paired with the user's stat when they know it. */
export interface GroupCell {
  kanji: string;
  /** The mastery stat, or null when the kanji is not yet known (missing). */
  stat: KanjiStat | null;
}

/** A group measured against the user's known kanji. */
export interface GroupCoverage {
  name: string;
  /** Every group kanji, in the group's own order, flagged known/missing. */
  cells: GroupCell[];
  knownCount: number;
  /** Distinct kanji in the group. */
  total: number;
}

/** A whole grouping measured against the user's known kanji. */
export interface GroupingCoverage {
  groups: GroupCoverage[];
  /** Known kanji that fall in no defined group. */
  leftover: { name: string; known: KanjiStat[] };
  /** Distinct known kanji that belong to the grouping. */
  knownInGrouping: number;
  /** Distinct kanji across the whole grouping. */
  groupingTotal: number;
  /** Attribution for the list, shown at the foot of the grid. */
  source: string;
}

/**
 * Lay the user's known kanji over a grouping: for each group keep its kanji in
 * order with the matching stat (or null when missing), and collect any known
 * kanji outside every group into the leftover bucket.
 */
export function applyGrouping(
  stats: Map<string, KanjiStat>,
  grouping: KanjiGrouping,
): GroupingCoverage {
  const inAnyGroup = new Set<string>();
  const groupingChars = new Set<string>();

  const groups: GroupCoverage[] = grouping.groups.map((group) => {
    // Dedupe within the group so its total counts distinct kanji.
    const chars = [...new Set(group.characters)].filter((c) => c.trim().length > 0);
    let knownCount = 0;
    const cells: GroupCell[] = chars.map((kanji) => {
      groupingChars.add(kanji);
      inAnyGroup.add(kanji);
      const stat = stats.get(kanji) ?? null;
      if (stat) knownCount += 1;
      return { kanji, stat };
    });
    return { name: group.name, cells, knownCount, total: chars.length };
  });

  const leftoverKnown = [...stats.values()]
    .filter((s) => !inAnyGroup.has(s.kanji))
    .sort((a, b) => b.score - a.score || b.wordCount - a.wordCount);

  let knownInGrouping = 0;
  for (const c of groupingChars) if (stats.has(c)) knownInGrouping += 1;

  return {
    groups,
    leftover: { name: grouping.leftover_group, known: leftoverKnown },
    knownInGrouping,
    groupingTotal: groupingChars.size,
    source: grouping.source,
  };
}

/** Whole-number percentage of `part` out of `whole` (0 when `whole` is 0). */
export function percent(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}
