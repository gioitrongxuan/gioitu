import { describe, it, expect } from "vitest";
import {
  startSession,
  orderSession,
  currentCard,
  applyGrade,
  undoGrade,
  canUndo,
  shouldRequeue,
  hasNextBatch,
  nextBatchSize,
  loadNextBatch,
} from "@/features/review/domain/session";
import { REVIEW_BATCH_SIZE } from "@/features/review/domain/constants";
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

// c0 is the most overdue, c(n-1) the least — so the deterministic sorted order
// is c0, c1, …, c(n-1) and slicing into batches is easy to assert.
function dueBatch(n: number) {
  return Array.from({ length: n }, (_, i) => due(`c${i}`, (n - i) * 1000));
}

describe("batching", () => {
  it("serves the whole queue in one batch when due count ≤ batch size (no prompt)", () => {
    const s = startSession(dueBatch(REVIEW_BATCH_SIZE));
    expect(s.queue).toHaveLength(REVIEW_BATCH_SIZE);
    expect(s.pending).toHaveLength(0);
    expect(hasNextBatch(s)).toBe(false);
  });

  it("splits a queue larger than the batch size into a first batch + pending", () => {
    const s = startSession(dueBatch(REVIEW_BATCH_SIZE + 5));
    expect(s.queue).toHaveLength(REVIEW_BATCH_SIZE);
    expect(hasNextBatch(s)).toBe(true);
    expect(s.pending).toHaveLength(5);
    expect(nextBatchSize(s)).toBe(5); // last partial batch
  });

  it("puts the most-overdue cards in the first batch (priority before batching)", () => {
    const s = startSession(dueBatch(REVIEW_BATCH_SIZE + 3));
    expect(currentCard(s)?.term).toBe("c0"); // most overdue served first
    expect(s.queue.map((e) => e.term)).toEqual(
      Array.from({ length: REVIEW_BATCH_SIZE }, (_, i) => `c${i}`),
    );
    // the least-overdue tail waits in pending
    expect(s.pending.map((e) => e.term)).toEqual(
      Array.from({ length: 3 }, (_, i) => `c${REVIEW_BATCH_SIZE + i}`),
    );
  });

  it("loadNextBatch serves the next slice with no overlap or gap", () => {
    let s = startSession(dueBatch(7), Math.random, 3);
    expect(s.queue.map((e) => e.term)).toEqual(["c0", "c1", "c2"]);

    s = loadNextBatch(s);
    expect(s.queue.map((e) => e.term)).toEqual(["c3", "c4", "c5"]);
    expect(hasNextBatch(s)).toBe(true);
    expect(nextBatchSize(s)).toBe(1); // one card left

    s = loadNextBatch(s);
    expect(s.queue.map((e) => e.term)).toEqual(["c6"]);
    expect(hasNextBatch(s)).toBe(false);
  });

  it("accumulates reviewed across batches; undo does not cross a batch boundary", () => {
    let s = startSession(dueBatch(4), Math.random, 2);
    // Graduate both cards of batch 1 to REVIEW so they drop out of the queue.
    s = applyGrade(s, { ...currentCard(s)!, card_state: "REVIEW", next_review: NOW + 999 });
    s = applyGrade(s, { ...currentCard(s)!, card_state: "REVIEW", next_review: NOW + 999 });
    expect(currentCard(s)).toBeUndefined();
    expect(hasNextBatch(s)).toBe(true);
    expect(s.reviewed).toBe(2);

    s = loadNextBatch(s);
    expect(canUndo(s)).toBe(false); // fresh batch — nothing to undo across the seam
    s = applyGrade(s, { ...currentCard(s)!, card_state: "REVIEW", next_review: NOW + 999 });
    expect(s.reviewed).toBe(3); // cumulative, not reset per batch
  });

  it("batchSize ≤ 0 keeps everything in a single batch", () => {
    const s = startSession(dueBatch(30), Math.random, 0);
    expect(s.queue).toHaveLength(30);
    expect(hasNextBatch(s)).toBe(false);
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
