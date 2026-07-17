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
  // Interval trước lapse, mang theo qua giai đoạn relearning (undefined = không
  // có lapse treo). Xem VocabEntry.lapsed_from_interval.
  lapsed_from_interval: number | undefined;
}

const clampEase = (ef: number, cfg: SrsConfig) => Math.max(ef, cfg.minEaseFactor);

/**
 * Xê dịch một interval REVIEW quanh giá trị tất định của nó để các thẻ đến hạn
 * cùng ngày tản ra — nếu không, thẻ tạo/ôn cùng ngày cứ due cùng ngày mãi
 * (phiên ôn phình rồi rỗng). Đây là "fuzz" kiểu Anki.
 *
 * Hàm THUẦN: ngẫu nhiên là một phụ thuộc, do `rng: () => number` (trả [0,1))
 * bơm từ ngoài — KHÔNG gọi Math.random() ở đây. Map rng sao cho **0.5 → offset
 * 0** (điểm giữa, giữ nguyên interval): `() => 0.5` cho kết quả tất định, hai
 * đầu [0,1) chạm ±`fuzzRatio`.
 *
 * Chỉ fuzz interval ≥ `minFuzzInterval` (REVIEW đủ lớn); các learning/relearning
 * step nhỏ hơn ngưỡng trả về nguyên vẹn — fuzz vài phút vô nghĩa và gây nhiễu.
 */
export function applyFuzz(interval: number, rng: () => number, cfg: SrsConfig): number {
  if (interval < cfg.minFuzzInterval) return interval;
  const offset = (rng() - 0.5) * 2 * cfg.fuzzRatio; // ∈ [-fuzzRatio, +fuzzRatio)
  return interval * (1 + offset);
}

/**
 * Interval (phút) một thẻ nhận khi tốt nghiệp khỏi phase learning/relearning để
 * vào REVIEW.
 *
 * Learning lần đầu: dùng thẳng `graduatingInterval` / `easyInterval`. Relearning
 * (thẻ đã từng lapse): khôi phục một phần interval TRƯỚC lúc lapse thay vì reset
 * về 1 ngày — một từ đã chín muồi lỡ quên một lần không nên tụt hẳn về đáy. Thẻ
 * relearning cũ (chưa ghi được interval trước lapse) rơi về `graduatingInterval`,
 * đúng bằng hành vi cũ.
 */
function graduationInterval(
  wasRelearning: boolean,
  lapsedFromInterval: number | undefined,
  isEasy: boolean,
  cfg: SrsConfig,
): number {
  if (wasRelearning) {
    const base = lapsedFromInterval ?? cfg.graduatingInterval;
    return Math.max(cfg.lapseMinInterval, base * cfg.lapseIntervalMultiplier);
  }
  return isEasy ? cfg.easyInterval : cfg.graduatingInterval;
}

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
    lapsed_from_interval: undefined,
  };
}

/**
 * Apply a self-grade to a card and return the next SRS state.
 * Implements the grading table in SPEC 4.4 plus threshold-based graduation
 * to LEARNED (fix point 6) and badge/relapse status transitions (fix point 1).
 *
 * `rng` (tuỳ chọn) bơm nguồn ngẫu nhiên để fuzz interval REVIEW (rải ngày đến
 * hạn — xem applyFuzz). KHÔNG truyền → KHÔNG fuzz (tất định), giữ hàm thuần và
 * để mọi lượt chấm không có rng ra đúng interval cũ.
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
    | "lapsed_from_interval"
  >,
  grade: ReviewGrade,
  now: number,
  rng?: () => number,
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
  // Interval trước lapse, giữ nguyên qua các bước relearning; tiêu thụ khi tốt
  // nghiệp; xoá ở mọi lượt chấm REVIEW bình thường. Xem graduationInterval().
  let lapsedFrom = entry.lapsed_from_interval;
  let cardState: CardState;
  let interval: number;

  // reps đếm số lần nhớ được (Good/Easy) ở MỌI pha — nó chỉ là bộ đếm, không
  // phải nguồn gốc "ease hell" như ease, nên giữ độc lập với pha. Ease NGƯỢC lại
  // chỉ điều chỉnh trong REVIEW (dưới đây): giống Anki, learning/relearning steps
  // không bao giờ đụng vào ease → tránh trừ ease từ trước khi thẻ được ôn thật.
  if (grade === "good" || grade === "easy") reps += 1;

  const inLearningPhase = entry.card_state === "NEW" || entry.card_state === "LEARNING";

  if (inLearningPhase) {
    const wasRelearning = isRelearning;
    const steps = wasRelearning ? cfg.relearningSteps : cfg.learningSteps;
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
          interval = graduationInterval(wasRelearning, lapsedFrom, false, cfg);
          lapsedFrom = undefined; // đã khôi phục — không còn lapse treo
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
        interval = graduationInterval(wasRelearning, lapsedFrom, true, cfg);
        lapsedFrom = undefined;
        break;
    }
  } else {
    // REVIEW phase — pha DUY NHẤT được điều chỉnh ease.
    const prev = entry.srs_interval;
    switch (grade) {
      case "again":
        ef += cfg.againEaseDelta;
        lapses += 1;
        cardState = "LEARNING";
        isRelearning = true;
        learningStep = 0;
        interval = cfg.relearningSteps[0];
        lapsedFrom = prev; // nhớ interval cũ để khôi phục khi tốt nghiệp lại
        break;
      case "hard":
        ef += cfg.hardEaseDelta;
        cardState = "REVIEW";
        interval = prev * cfg.hardIntervalMultiplier;
        break;
      case "good":
        cardState = "REVIEW";
        interval = prev * ef;
        break;
      case "easy":
        ef += cfg.easyEaseDelta;
        cardState = "REVIEW";
        interval = prev * ef * cfg.easyBonus;
        break;
    }
    ef = clampEase(ef, cfg);
  }

  // Fuzz chỉ áp cho thẻ vào REVIEW (again trong REVIEW quay về LEARNING nên
  // không dính); applyFuzz tự bỏ qua interval < minFuzzInterval, còn ở đây thêm
  // điều kiện cardState để "chỉ fuzz interval REVIEW" tường minh. Đặt TRƯỚC khi
  // kẹp/chuẩn hoá bên dưới nên trần maxInterval và sàn 1 phút vẫn siết kết quả.
  if (rng && cardState! === "REVIEW") interval = applyFuzz(interval!, rng, cfg);

  // Whole minutes, floored at 1, capped at maxInterval. The cap only bites in
  // REVIEW growth (learning/relearning intervals sit far below it).
  interval = Math.min(interval!, cfg.maxInterval);
  interval = Math.max(1, Math.round(interval));

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
    lapsed_from_interval: lapsedFrom,
  };
}

/**
 * Relapse a word that is currently LEARNED because it was "touched" again via a
 * lookup (SPEC 4.2, covers both Case 1 and Case 2). Behaves like an "Again" in
 * REVIEW: lapses += 1, back to the first relearning step, ease -= 0.20 (floored,
 * a LEARNED word is a mature REVIEW card so lowering ease is right here), and the
 * pre-lapse interval is remembered so graduating back recovers a fraction of it.
 */
export function relapse(
  entry: Pick<
    VocabEntry,
    "ease_factor" | "lapses" | "card_state" | "srs_interval"
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
    lapsed_from_interval: entry.srs_interval,
  };
}

/**
 * Mark a word as already known ("Đã nhớ"): the user is vouching they know it
 * cold, so it graduates straight to a REVIEW card at the `knownInterval` — far
 * past mere maturity. It counts as LEARNED (hidden from the cloud, out of the
 * queue), reads as (near-)fully mastered on the kanji-stats heatmap, and won't
 * resurface for a long time. Looking it up again later relapses it like any
 * other mature word (SPEC 4.2).
 */
export function markKnown(now: number, cfg: SrsConfig = DEFAULT_SRS_CONFIG): SrsState {
  return {
    status: "LEARNED",
    card_state: "REVIEW",
    learning_step: 0,
    ease_factor: cfg.initialEaseFactor,
    reps: 0,
    lapses: 0,
    is_relearning: false,
    srs_interval: cfg.knownInterval,
    next_review: now + cfg.knownInterval * 60_000,
    lapsed_from_interval: undefined,
  };
}

/** True when a card is due for review at time `now`. */
export function isDue(entry: Pick<VocabEntry, "card_state" | "next_review">, now: number): boolean {
  return entry.card_state != null && entry.next_review != null && entry.next_review <= now;
}

/**
 * Một thẻ là "leech" (khó nhằn) khi số lần rớt tích luỹ đạt/vượt ngưỡng cấu hình:
 * ôn đi ôn lại vẫn quên nên đốt thời gian của cả phiên. Suy thẳng từ `lapses` sẵn
 * có (tăng ở mỗi "Again" trong REVIEW và mỗi relapse-do-tra-cứu) nên KHÔNG cần
 * thêm trường model. Đây chỉ là PHÁT HIỆN để UI cảnh báo + gợi ý — engine không
 * tự hoãn/xoá thẻ hay đổi lịch biểu SM-2.
 */
export function isLeech(
  entry: Pick<VocabEntry, "lapses">,
  cfg: SrsConfig = DEFAULT_SRS_CONFIG,
): boolean {
  return entry.lapses >= cfg.leechLapseThreshold;
}
