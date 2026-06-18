// Default SM-2 / SRS parameters (SPEC 4.4, configurable).
// All durations expressed in MINUTES to match VocabEntry.srs_interval.

export const MINUTE = 1;
export const DAY = 24 * 60; // 1440 minutes

export interface SrsConfig {
  /** Learning steps in minutes (SPEC default [1 min, 10 min]). */
  learningSteps: number[];
  /** Interval granted on graduating via "Good" from the last learning step. */
  graduatingInterval: number;
  /** Interval granted on graduating via "Easy". */
  easyInterval: number;
  /** Initial ease factor for new cards. */
  initialEaseFactor: number;
  /** Hard lower bound on ease factor. */
  minEaseFactor: number;
  /** Multiplier applied to interval when grading "Hard" in REVIEW. */
  hardIntervalMultiplier: number;
  /** Extra multiplier applied on top of EF when grading "Easy" in REVIEW. */
  easyBonus: number;
  /** Relearning step(s) entered after "Again" from REVIEW. */
  relearningSteps: number[];
  /** Interval (minutes) at/above which a word graduates to LEARNED ("mature"). */
  matureThreshold: number;
  /** Ease penalty for "Again". */
  againEaseDelta: number;
  /** Ease penalty for "Hard". */
  hardEaseDelta: number;
  /** Ease bonus for "Easy". */
  easyEaseDelta: number;
}

export const DEFAULT_SRS_CONFIG: SrsConfig = {
  learningSteps: [1 * MINUTE, 10 * MINUTE],
  graduatingInterval: 1 * DAY,
  easyInterval: 4 * DAY,
  initialEaseFactor: 2.5,
  minEaseFactor: 1.3,
  hardIntervalMultiplier: 1.2,
  easyBonus: 1.3,
  relearningSteps: [10 * MINUTE],
  matureThreshold: 21 * DAY,
  againEaseDelta: -0.2,
  hardEaseDelta: -0.15,
  easyEaseDelta: 0.15,
};

/** Debounce window for counting a repeated lookup of the same term (SPEC 4.1). */
export const LOOKUP_DEBOUNCE_MS = 2000;

/** Minimum lookups before an SRS card is auto-created (SPEC 4.4 gating). */
export const SRS_GATING_THRESHOLD = 2;
