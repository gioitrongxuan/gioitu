import { describe, it, expect } from "vitest";
import { gradeCard, newCardState, relapse, isDue } from "@/features/review/domain/srs";
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

  it("Easy graduates immediately to REVIEW (4 days) and bumps EF", () => {
    const card = makeEntry({ card_state: "NEW" });
    const s = gradeCard(card, "easy", NOW);
    expect(s.card_state).toBe("REVIEW");
    expect(s.srs_interval).toBe(CFG.easyInterval); // 4 days
    expect(s.ease_factor).toBeCloseTo(2.65);
  });

  it("Again resets to first learning step and lowers EF", () => {
    const card = makeEntry({ card_state: "LEARNING", learning_step: 1 });
    const s = gradeCard(card, "again", NOW);
    expect(s.card_state).toBe("LEARNING");
    expect(s.learning_step).toBe(0);
    expect(s.srs_interval).toBe(1);
    expect(s.ease_factor).toBeCloseTo(2.3);
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

  it("relearning Good graduates back to REVIEW but keeps RELAPSED until mature", () => {
    const relearning = makeEntry({
      card_state: "LEARNING",
      is_relearning: true,
      status: "RELAPSED",
      learning_step: 0,
      srs_interval: 10,
    });
    const s = gradeCard(relearning, "good", NOW);
    expect(s.card_state).toBe("REVIEW");
    expect(s.is_relearning).toBe(false);
    expect(s.srs_interval).toBe(CFG.graduatingInterval);
    expect(s.status).toBe("RELAPSED"); // badge stays until re-mature
  });
});

describe("relapse() via lookup (SPEC 4.2)", () => {
  it("resets like Again, increments lapses, floors EF", () => {
    const s = relapse({ ease_factor: 1.35, lapses: 2, card_state: "REVIEW" }, NOW);
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
