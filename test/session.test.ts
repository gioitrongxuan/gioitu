import { describe, it, expect } from "vitest";
import {
  startSession,
  orderSession,
  currentCard,
  applyGrade,
  undoGrade,
  canUndo,
  shouldRequeue,
} from "@/features/review/domain/session";
import { makeEntry } from "./fixtures";

const NOW = 5_000_000;

// Distinct next_review values so the stable sort fully determines order — the
// result is then independent of the (randomised) shuffle, which is the point of
// the sort. Listed most-overdue first == the expected queue order.
function due(term: string, overdueMs: number) {
  return makeEntry({ term, card_state: "REVIEW", next_review: NOW - overdueMs });
}

describe("orderSession", () => {
  it("puts the most overdue cards first", () => {
    const cards = [due("a", 100), due("b", 900), due("c", 500)];
    expect(orderSession(cards).map((e) => e.term)).toEqual(["b", "c", "a"]);
  });

  it("does not mutate the input array", () => {
    const cards = [due("a", 100), due("b", 900)];
    const before = cards.map((e) => e.term);
    orderSession(cards);
    expect(cards.map((e) => e.term)).toEqual(before);
  });
});

describe("startSession", () => {
  it("snapshots the due cards into an ordered queue", () => {
    const s = startSession([due("a", 100), due("b", 900)]);
    expect(s.queue.map((e) => e.term)).toEqual(["b", "a"]);
    expect(s.reviewed).toBe(0);
    expect(canUndo(s)).toBe(false);
    expect(currentCard(s)?.term).toBe("b");
  });
});

describe("applyGrade — no card skipping (regression)", () => {
  it("advances to the very next snapshot card, not the one after it", () => {
    // The store's live dueEntries would shrink under us here (the graded card
    // drops out); the snapshot must still surface b, not skip to c.
    let s = startSession([due("a", 300), due("b", 200), due("c", 100)]);
    expect(currentCard(s)?.term).toBe("a");
    s = applyGrade(s, { ...currentCard(s)!, card_state: "REVIEW", next_review: NOW + 999 });
    expect(currentCard(s)?.term).toBe("b");
    expect(s.reviewed).toBe(1);
    expect(s.queue).toHaveLength(2);
  });

  it("empties the queue after grading every card", () => {
    let s = startSession([due("a", 100)]);
    s = applyGrade(s, { ...currentCard(s)!, card_state: "REVIEW", next_review: NOW + 999 });
    expect(currentCard(s)).toBeUndefined();
    expect(s.reviewed).toBe(1);
  });
});

describe("shouldRequeue / applyGrade re-queue", () => {
  it("re-queues a card still in the learning phase to the END of the queue", () => {
    let s = startSession([due("a", 300), due("b", 200)]);
    expect(currentCard(s)?.term).toBe("a");
    s = applyGrade(s, { ...currentCard(s)!, card_state: "LEARNING", next_review: NOW + 60_000 });
    // b is drilled before a comes back — never the same card twice in a row.
    expect(s.queue.map((e) => e.term)).toEqual(["b", "a"]);
    expect(currentCard(s)?.term).toBe("b");
  });

  it("drops a card that graduated to REVIEW", () => {
    expect(shouldRequeue({ card_state: "REVIEW" })).toBe(false);
    expect(shouldRequeue({ card_state: "LEARNING" })).toBe(true);
    let s = startSession([due("a", 100)]);
    s = applyGrade(s, { ...currentCard(s)!, card_state: "REVIEW", next_review: NOW + 999 });
    expect(s.queue).toHaveLength(0);
  });
});

describe("undoGrade", () => {
  it("returns null when there is nothing to undo", () => {
    expect(undoGrade(startSession([due("a", 100)]))).toBeNull();
  });

  it("restores the queue and hands back the pre-grade entry to re-persist", () => {
    let s = startSession([due("a", 300), due("b", 200)]);
    const preGradeA = currentCard(s)!;
    expect(preGradeA.term).toBe("a");
    s = applyGrade(s, { ...preGradeA, card_state: "REVIEW", next_review: NOW + 999, reps: 1 });
    expect(currentCard(s)?.term).toBe("b");

    const undone = undoGrade(s)!;
    expect(undone.restore).toBe(preGradeA); // the "a" card in its pre-grade state
    expect(undone.restore.reps).toBe(0);
    expect(currentCard(undone.session)?.term).toBe("a");
    expect(undone.session.reviewed).toBe(0);
    expect(canUndo(undone.session)).toBe(false);
  });

  it("undoes a re-queue: the appended learning card is removed and restored at front", () => {
    let s = startSession([due("a", 300), due("b", 200)]);
    const preGradeA = currentCard(s)!;
    s = applyGrade(s, { ...preGradeA, card_state: "LEARNING", next_review: NOW + 60_000 });
    expect(s.queue.map((e) => e.term)).toEqual(["b", "a"]); // a re-queued at end

    const undone = undoGrade(s)!;
    expect(undone.session.queue.map((e) => e.term)).toEqual(["a", "b"]);
    expect(undone.restore).toBe(preGradeA);
  });
});
