// SM-2 spaced-repetition engine (SPEC 4.4).
// Pure functions only — no I/O, no Date.now() side effects (caller passes `now`).

import { DEFAULT_SRS_CONFIG, SrsConfig } from "./constants";
import { CardState, ReviewGrade, VocabEntry, WordStatus } from "@/shared/types";

/** Fields produced/updated by the SRS engine. */
export interface SrsState {
  status: WordStatus;
  card_state: CardState;
  learning_step: number;
  ease_factor: number;
  reps: number;
  lapses: number;
  is_relearning: boolean;
  srs_interval: number; // minutes
  next_review: number; // epoch ms
}

const clampEase = (ef: number, cfg: SrsConfig) => Math.max(ef, cfg.minEaseFactor);

/**
 * Initial SRS fields applied when a card is first created (gating, SPEC 4.4).
 * A brand-new card is `NEW` and scheduled immediately (next_review = now).
 */
export function newCardState(now: number, cfg: SrsConfig = DEFAULT_SRS_CONFIG): SrsState {
  return {
    status: "LEARNING",
    card_state: "NEW",
    learning_step: 0,
    ease_factor: cfg.initialEaseFactor,
    reps: 0,
    lapses: 0,
    is_relearning: false,
    srs_interval: 0,
    next_review: now,
  };
}

/**
 * Apply a self-grade to a card and return the next SRS state.
 * Implements the grading table in SPEC 4.4 plus threshold-based graduation
 * to LEARNED (fix point 6) and badge/relapse status transitions (fix point 1).
 */
export function gradeCard(
  entry: Pick<
    VocabEntry,
    | "status"
    | "card_state"
    | "learning_step"
    | "ease_factor"
    | "reps"
    | "lapses"
    | "is_relearning"
    | "srs_interval"
  >,
  grade: ReviewGrade,
  now: number,
  cfg: SrsConfig = DEFAULT_SRS_CONFIG,
): SrsState {
  if (entry.card_state == null) {
    throw new Error("gradeCard called on an entry without an SRS card");
  }

  let ef = entry.ease_factor;
  let reps = entry.reps;
  let lapses = entry.lapses;
  let isRelearning = entry.is_relearning;
  let learningStep = entry.learning_step;
  let cardState: CardState;
  let interval: number;

  // --- "Cập nhật EF & bộ đếm" column (applies regardless of phase) ---
  switch (grade) {
    case "again":
      ef += cfg.againEaseDelta;
      break;
    case "hard":
      ef += cfg.hardEaseDelta;
      break;
    case "good":
      reps += 1;
      break;
    case "easy":
      ef += cfg.easyEaseDelta;
      reps += 1;
      break;
  }
  ef = clampEase(ef, cfg);

  const inLearningPhase = entry.card_state === "NEW" || entry.card_state === "LEARNING";

  if (inLearningPhase) {
    const steps = isRelearning ? cfg.relearningSteps : cfg.learningSteps;
    const curStep = entry.card_state === "NEW" ? 0 : entry.learning_step;

    switch (grade) {
      case "again":
        cardState = "LEARNING";
        learningStep = 0;
        interval = steps[0];
        break;
      case "hard":
        // Repeat the current step (SPEC allows "current step or average of 2").
        cardState = "LEARNING";
        learningStep = curStep;
        interval = steps[Math.min(curStep, steps.length - 1)];
        break;
      case "good": {
        const nextStep = curStep + 1;
        if (nextStep >= steps.length) {
          // Graduate from the last step.
          cardState = "REVIEW";
          isRelearning = false;
          learningStep = 0;
          interval = cfg.graduatingInterval;
        } else {
          cardState = "LEARNING";
          learningStep = nextStep;
          interval = steps[nextStep];
        }
        break;
      }
      case "easy":
        cardState = "REVIEW";
        isRelearning = false;
        learningStep = 0;
        interval = cfg.easyInterval;
        break;
    }
  } else {
    // REVIEW phase.
    const prev = entry.srs_interval;
    switch (grade) {
      case "again":
        lapses += 1;
        cardState = "LEARNING";
        isRelearning = true;
        learningStep = 0;
        interval = cfg.relearningSteps[0];
        break;
      case "hard":
        cardState = "REVIEW";
        interval = prev * cfg.hardIntervalMultiplier;
        break;
      case "good":
        cardState = "REVIEW";
        interval = prev * ef;
        break;
      case "easy":
        cardState = "REVIEW";
        interval = prev * ef * cfg.easyBonus;
        break;
    }
  }

  // Intervals are stored as whole minutes; never below 1 minute once carded.
  interval = Math.max(1, Math.round(interval!));

  // --- Status / badge transitions (SPEC 4.2 & 4.4 fix point 6) ---
  let status: WordStatus = entry.status;
  if (cardState! === "REVIEW" && interval >= cfg.matureThreshold) {
    // Graduates (or re-graduates) to mature → LEARNED, badge auto-removed.
    status = "LEARNED";
  } else if (entry.status === "LEARNED") {
    // A mature word dropped below threshold → it has been forgotten again.
    status = "RELAPSED";
  } else if (entry.status !== "RELAPSED") {
    status = "LEARNING";
  }
  // (If it was RELAPSED and still immature, it stays RELAPSED — badge remains.)

  return {
    status,
    card_state: cardState!,
    learning_step: learningStep,
    ease_factor: ef,
    reps,
    lapses,
    is_relearning: isRelearning,
    srs_interval: interval,
    next_review: now + interval * 60_000,
  };
}

/**
 * Relapse a word that is currently LEARNED because it was "touched" again via a
 * lookup (SPEC 4.2, covers both Case 1 and Case 2). Behaves like "Again":
 * lapses += 1, back to the first relearning step, ease -= 0.20 (floored).
 */
export function relapse(
  entry: Pick<
    VocabEntry,
    "ease_factor" | "lapses" | "card_state"
  >,
  now: number,
  cfg: SrsConfig = DEFAULT_SRS_CONFIG,
): SrsState {
  const ef = clampEase(entry.ease_factor + cfg.againEaseDelta, cfg);
  const interval = cfg.relearningSteps[0];
  return {
    status: "RELAPSED",
    card_state: "LEARNING",
    learning_step: 0,
    ease_factor: ef,
    reps: 0,
    lapses: entry.lapses + 1,
    is_relearning: true,
    srs_interval: interval,
    next_review: now + interval * 60_000,
  };
}

/** True when a card is due for review at time `now`. */
export function isDue(entry: Pick<VocabEntry, "card_state" | "next_review">, now: number): boolean {
  return entry.card_state != null && entry.next_review != null && entry.next_review <= now;
}
