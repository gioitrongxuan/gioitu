import { describe, it, expect } from "vitest";
import { gradeCard, newCardState, relapse, markKnown, isDue, applyFuzz, isLeech, learnedAtAfter } from "@/features/review/domain/srs";
import { DAY, DEFAULT_SRS_CONFIG as CFG } from "@/features/review/domain/constants";
import { makeEntry } from "./fixtures";

const NOW = 2_000_000;

describe("newCardState (gating)", () => {
  it("creates a NEW card scheduled immediately", () => {
    const s = newCardState(NOW);
    expect(s.card_state).toBe("NEW");
    expect(s.status).toBe("LEARNING");
    expect(s.ease_factor).toBe(2.5);
    expect(s.next_review).toBe(NOW);
  });
});

describe("markKnown ('Đã nhớ')", () => {
  it("graduates straight to a well-mastered LEARNED card (hidden, out of queue)", () => {
    const s = markKnown(NOW);
    expect(s.status).toBe("LEARNED");
    expect(s.card_state).toBe("REVIEW");
    // Asserted known cold → the long "known" interval, well past mere maturity.
    expect(s.srs_interval).toBe(CFG.knownInterval);
    expect(s.srs_interval).toBeGreaterThan(CFG.matureThreshold);
    expect(s.next_review).toBe(NOW + CFG.knownInterval * 60_000);
    expect(isDue({ card_state: s.card_state, next_review: s.next_review }, NOW)).toBe(false);
  });
});

describe("learnedAtAfter (mốc thời điểm thuộc)", () => {
  it("đóng dấu now khi vừa chuyển sang LEARNED (kể cả entry mới)", () => {
    expect(learnedAtAfter("LEARNING", "LEARNED", NOW)).toBe(NOW);
    expect(learnedAtAfter("RELAPSED", "LEARNED", NOW)).toBe(NOW);
    expect(learnedAtAfter(undefined, "LEARNED", NOW)).toBe(NOW);
  });

  it("giữ mốc cũ khi vốn đã LEARNED (đánh dấu lại không dời mốc)", () => {
    expect(learnedAtAfter("LEARNED", "LEARNED", NOW, 111)).toBe(111);
  });

  it("giữ mốc cũ (kể cả undefined) khi rời khỏi hoặc không ở LEARNED", () => {
    expect(learnedAtAfter("LEARNED", "RELAPSED", NOW, 111)).toBe(111);
    expect(learnedAtAfter("LEARNING", "LEARNING", NOW)).toBeUndefined();
  });
});

describe("learning phase", () => {
  it("Good advances through learning steps then graduates to REVIEW (1 day)", () => {
    const card = makeEntry({ card_state: "NEW" });
    const s1 = gradeCard(card, "good", NOW);
    expect(s1.card_state).toBe("LEARNING");
    expect(s1.learning_step).toBe(1);
    expect(s1.srs_interval).toBe(10); // second learning step
    expect(s1.reps).toBe(1);

    const s2 = gradeCard({ ...card, ...s1 }, "good", NOW);
    expect(s2.card_state).toBe("REVIEW");
    expect(s2.srs_interval).toBe(CFG.graduatingInterval); // 1 day
  });

  it("Easy graduates immediately to REVIEW (4 days) without touching EF", () => {
    const card = makeEntry({ card_state: "NEW" });
    const s = gradeCard(card, "easy", NOW);
    expect(s.card_state).toBe("REVIEW");
    expect(s.srs_interval).toBe(CFG.easyInterval); // 4 days
    // Learning steps never move ease (Anki parity) — no bump on Easy-graduation.
    expect(s.ease_factor).toBe(2.5);
    expect(s.reps).toBe(1);
  });

  it("Again resets to first learning step and leaves EF untouched", () => {
    const card = makeEntry({ card_state: "LEARNING", learning_step: 1 });
    const s = gradeCard(card, "again", NOW);
    expect(s.card_state).toBe("LEARNING");
    expect(s.learning_step).toBe(0);
    expect(s.srs_interval).toBe(1);
    // No "ease hell" before the card is ever truly reviewed: ease unchanged.
    expect(s.ease_factor).toBe(2.5);
  });
});

describe("ease is only adjusted in REVIEW (SM-2 correctness)", () => {
  it("Hard in the learning phase does not lower ease", () => {
    const card = makeEntry({ card_state: "LEARNING", learning_step: 0, ease_factor: 2.5 });
    expect(gradeCard(card, "hard", NOW).ease_factor).toBe(2.5);
  });

  it("Again / Hard / Easy in REVIEW still move ease", () => {
    const review = makeEntry({ card_state: "REVIEW", srs_interval: 1 * DAY, ease_factor: 2.5 });
    expect(gradeCard(review, "again", NOW).ease_factor).toBeCloseTo(2.3);
    expect(gradeCard(review, "hard", NOW).ease_factor).toBeCloseTo(2.35);
    expect(gradeCard(review, "easy", NOW).ease_factor).toBeCloseTo(2.65);
  });
});

describe("interval ceiling (maxInterval)", () => {
  it("clamps a growing REVIEW interval at maxInterval", () => {
    // Already at the ceiling: Good (× ease) would overshoot but must be capped.
    const card = makeEntry({ card_state: "REVIEW", srs_interval: CFG.maxInterval, ease_factor: 2.5 });
    const s = gradeCard(card, "good", NOW);
    expect(s.srs_interval).toBe(CFG.maxInterval);
    // knownInterval shares the ceiling, so a naturally maxed card and "đã thuộc"
    // land at the same top of the scale.
    expect(CFG.maxInterval).toBe(CFG.knownInterval);
  });
});

describe("interval fuzz (rải ngày đến hạn)", () => {
  // "good" trong REVIEW từ 1 ngày, ease 2.5 → interval tất định trước khi fuzz.
  const baseInterval = Math.round(1 * DAY * 2.5);
  const reviewCard = () =>
    makeEntry({ card_state: "REVIEW", srs_interval: 1 * DAY, ease_factor: 2.5, status: "LEARNING" });

  it("applyFuzz với rng() = 0.5 giữ nguyên interval (điểm giữa)", () => {
    expect(applyFuzz(30 * DAY, () => 0.5, CFG)).toBe(30 * DAY);
  });

  it("rng() = 0.5 truyền qua gradeCard cho đúng interval tất định cũ", () => {
    expect(gradeCard(reviewCard(), "good", NOW, () => 0.5).srs_interval).toBe(baseInterval);
  });

  it("rng khác nhau cho interval khác nhau, đều nằm trong ±biên quanh gốc", () => {
    const low = gradeCard(reviewCard(), "good", NOW, () => 0).srs_interval; // -fuzzRatio
    const high = gradeCard(reviewCard(), "good", NOW, () => 0.99).srs_interval; // ~ +fuzzRatio
    expect(low).toBeLessThan(baseInterval);
    expect(high).toBeGreaterThan(baseInterval);
    expect(low).not.toBe(high);
    expect(low).toBeGreaterThanOrEqual(baseInterval * (1 - CFG.fuzzRatio));
    expect(high).toBeLessThanOrEqual(baseInterval * (1 + CFG.fuzzRatio));
  });

  it("KHÔNG fuzz interval nhỏ (learning step) dù có rng", () => {
    // NEW + Good → step learning 10 phút, vẫn ở LEARNING → không fuzz.
    const s = gradeCard(makeEntry({ card_state: "NEW" }), "good", NOW, () => 0);
    expect(s.card_state).toBe("LEARNING");
    expect(s.srs_interval).toBe(10);
    // applyFuzz cũng bỏ qua interval dưới ngưỡng.
    expect(applyFuzz(CFG.minFuzzInterval - 1, () => 0, CFG)).toBe(CFG.minFuzzInterval - 1);
  });

  it("fuzz không vượt maxInterval (kẹp trần sau khi xê dịch)", () => {
    // Good từ trần × ease rồi fuzz dương → phải bị kẹp về maxInterval.
    const maxed = makeEntry({ card_state: "REVIEW", srs_interval: CFG.maxInterval, ease_factor: 2.5 });
    const s = gradeCard(maxed, "good", NOW, () => 0.99);
    expect(s.srs_interval).toBe(CFG.maxInterval);
  });
});

describe("review phase", () => {
  const review = () => makeEntry({ card_state: "REVIEW", srs_interval: 1 * DAY, status: "LEARNING" });

  it("Good multiplies interval by EF", () => {
    const s = gradeCard(review(), "good", NOW);
    expect(s.srs_interval).toBe(Math.round(1 * DAY * 2.5));
  });

  it("Hard multiplies by 1.2 and lowers EF", () => {
    const s = gradeCard(review(), "hard", NOW);
    expect(s.srs_interval).toBe(Math.round(1 * DAY * 1.2));
    expect(s.ease_factor).toBeCloseTo(2.35);
  });

  it("Easy multiplies by EF * easy bonus", () => {
    const s = gradeCard(review(), "easy", NOW);
    expect(s.srs_interval).toBe(Math.round(1 * DAY * 2.65 * 1.3));
  });

  it("graduates to LEARNED once interval >= 21 days (fix point 6)", () => {
    // Walk Good several times until mature.
    let e = makeEntry({ card_state: "REVIEW", srs_interval: 1 * DAY, status: "LEARNING" });
    let learned = false;
    for (let i = 0; i < 6; i++) {
      const s = gradeCard(e, "good", NOW);
      e = { ...e, ...s };
      if (s.status === "LEARNED") {
        learned = true;
        expect(s.srs_interval).toBeGreaterThanOrEqual(CFG.matureThreshold);
        break;
      }
    }
    expect(learned).toBe(true);
  });
});

describe("relapse from REVIEW Again", () => {
  it("a mature LEARNED card graded Again becomes RELAPSED and relearns", () => {
    const mature = makeEntry({
      card_state: "REVIEW",
      srs_interval: 60 * DAY,
      status: "LEARNED",
      ease_factor: 2.5,
      lapses: 0,
    });
    const s = gradeCard(mature, "again", NOW);
    expect(s.status).toBe("RELAPSED");
    expect(s.card_state).toBe("LEARNING");
    expect(s.is_relearning).toBe(true);
    expect(s.lapses).toBe(1);
    expect(s.srs_interval).toBe(CFG.relearningSteps[0]); // 10 min
    expect(s.ease_factor).toBeCloseTo(2.3);
  });

  it("legacy relearning Good (no remembered interval) graduates to graduatingInterval", () => {
    const relearning = makeEntry({
      card_state: "LEARNING",
      is_relearning: true,
      status: "RELAPSED",
      learning_step: 0,
      srs_interval: 10,
      // lapsed_from_interval unset (pre-migration card) → falls back to old behaviour.
    });
    const s = gradeCard(relearning, "good", NOW);
    expect(s.card_state).toBe("REVIEW");
    expect(s.is_relearning).toBe(false);
    expect(s.srs_interval).toBe(CFG.graduatingInterval); // 1 day, as before
    expect(s.status).toBe("RELAPSED"); // badge stays until re-mature
  });

  it("remembers the pre-lapse interval when lapsing from REVIEW", () => {
    const mature = makeEntry({ card_state: "REVIEW", srs_interval: 60 * DAY, status: "LEARNED" });
    const s = gradeCard(mature, "again", NOW);
    expect(s.lapsed_from_interval).toBe(60 * DAY);
  });
});

describe("lapse recovery (interval restored as % of pre-lapse)", () => {
  it("a long-mature card graduating from relearning recovers a fraction, not 1 day", () => {
    // Mature at 60 days → Again (lapse) → relearn → Good graduates.
    const mature = makeEntry({ card_state: "REVIEW", srs_interval: 60 * DAY, status: "LEARNED" });
    const lapsed = { ...mature, ...gradeCard(mature, "again", NOW) };
    const graduated = gradeCard(lapsed, "good", NOW);
    // 60 days × 0.5 = 30 days, well above the 1-day floor.
    expect(graduated.srs_interval).toBe(60 * DAY * CFG.lapseIntervalMultiplier);
    expect(graduated.srs_interval).toBeGreaterThan(CFG.graduatingInterval);
    // The remembered interval is consumed once recovered.
    expect(graduated.lapsed_from_interval).toBeUndefined();
    // 30 days > matureThreshold → straight back to LEARNED.
    expect(graduated.status).toBe("LEARNED");
  });

  it("recovery is floored at lapseMinInterval for short pre-lapse intervals", () => {
    // Pre-lapse interval of 1 day → 1 × 0.5 = 12h, floored to lapseMinInterval.
    const shallow = makeEntry({ card_state: "REVIEW", srs_interval: 1 * DAY, status: "LEARNING" });
    const lapsed = { ...shallow, ...gradeCard(shallow, "again", NOW) };
    const graduated = gradeCard(lapsed, "good", NOW);
    expect(graduated.srs_interval).toBe(CFG.lapseMinInterval);
  });

  it("relapse() via lookup remembers the pre-lapse interval too", () => {
    const s = relapse({ ease_factor: 2.5, lapses: 0, card_state: "REVIEW", srs_interval: 90 * DAY }, NOW);
    expect(s.lapsed_from_interval).toBe(90 * DAY);
    const graduated = gradeCard({ ...makeEntry(), ...s }, "good", NOW);
    expect(graduated.srs_interval).toBe(90 * DAY * CFG.lapseIntervalMultiplier);
  });
});

describe("relapse() via lookup (SPEC 4.2)", () => {
  it("resets like Again, increments lapses, floors EF", () => {
    const s = relapse({ ease_factor: 1.35, lapses: 2, card_state: "REVIEW", srs_interval: 30 * DAY }, NOW);
    expect(s.status).toBe("RELAPSED");
    expect(s.lapses).toBe(3);
    expect(s.is_relearning).toBe(true);
    expect(s.srs_interval).toBe(CFG.relearningSteps[0]);
    expect(s.ease_factor).toBe(CFG.minEaseFactor); // 1.35 - 0.2 -> floored to 1.3
  });
});

describe("ease factor floor (constraint 8)", () => {
  it("never drops below 1.3", () => {
    let e = makeEntry({ card_state: "REVIEW", srs_interval: 1 * DAY, ease_factor: 1.3 });
    for (let i = 0; i < 5; i++) e = { ...e, ...gradeCard(e, "again", NOW) };
    expect(e.ease_factor).toBe(1.3);
  });
});

describe("isDue", () => {
  it("is false without a card, true when next_review has passed", () => {
    expect(isDue(makeEntry({ card_state: null, next_review: null }), NOW)).toBe(false);
    expect(isDue(makeEntry({ card_state: "REVIEW", next_review: NOW - 1 }), NOW)).toBe(true);
    expect(isDue(makeEntry({ card_state: "REVIEW", next_review: NOW + 1 }), NOW)).toBe(false);
  });
});

describe("leech detection (isLeech)", () => {
  const threshold = CFG.leechLapseThreshold;

  it("dưới ngưỡng → không phải leech", () => {
    expect(isLeech(makeEntry({ lapses: 0 }))).toBe(false);
    expect(isLeech(makeEntry({ lapses: threshold - 1 }))).toBe(false);
  });

  it("đúng ngưỡng → là leech (biên)", () => {
    expect(isLeech(makeEntry({ lapses: threshold }))).toBe(true);
  });

  it("vượt ngưỡng → là leech", () => {
    expect(isLeech(makeEntry({ lapses: threshold + 5 }))).toBe(true);
  });

  it("tôn trọng ngưỡng tiêm qua config (dependency injection)", () => {
    const strict = { ...CFG, leechLapseThreshold: 2 };
    expect(isLeech(makeEntry({ lapses: 2 }), strict)).toBe(true);
    expect(isLeech(makeEntry({ lapses: 2 }), CFG)).toBe(false); // mặc định 8
  });

  it("lapses tích luỹ qua các lần Again trong REVIEW rồi vượt ngưỡng", () => {
    // Mỗi vòng mô phỏng một lần rớt thật: REVIEW → Again (lapse +1, về relearning)
    // → Good (tốt nghiệp lại REVIEW). Kiểm tra `lapses` đếm tăng đúng và isLeech chỉ
    // lật khi đủ số lần rớt.
    let e = makeEntry({ card_state: "REVIEW", srs_interval: 30 * DAY, status: "LEARNED", lapses: 0 });
    for (let i = 0; i < threshold; i++) {
      expect(e.lapses).toBe(i);
      expect(isLeech(e)).toBe(false);
      e = { ...e, ...gradeCard(e, "again", NOW) }; // lapse: lapses += 1, về relearning
      e = { ...e, ...gradeCard(e, "good", NOW) }; // tốt nghiệp khỏi relearning về REVIEW
    }
    expect(e.lapses).toBe(threshold);
    expect(isLeech(e)).toBe(true);
  });
});
