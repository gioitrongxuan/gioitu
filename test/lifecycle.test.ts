import { describe, it, expect } from "vitest";
import { softDelete, isDeleted, isReviewable } from "@/features/review/domain/lifecycle";
import { makeEntry } from "./fixtures";

const NOW = 7_000_000;

describe("softDelete (tombstone)", () => {
  it("stamps deleted_at and bumps updated_at so the deletion wins LWW sync", () => {
    const entry = makeEntry({ updated_at: NOW - 1000 });
    const tombstoned = { ...entry, ...softDelete(NOW) };
    expect(isDeleted(tombstoned)).toBe(true);
    expect(tombstoned.deleted_at).toBe(NOW);
    expect(tombstoned.updated_at).toBe(NOW);
    expect(tombstoned.updated_at).toBeGreaterThan(entry.updated_at);
  });
});

describe("isReviewable", () => {
  const due = makeEntry({ card_state: "REVIEW", next_review: NOW - 1 });

  it("a due, active card is reviewable", () => {
    expect(isReviewable(due, NOW)).toBe(true);
  });

  it("a deleted card is NOT reviewable even when due", () => {
    expect(isReviewable({ ...due, ...softDelete(NOW) }, NOW)).toBe(false);
  });

  it("a card not yet due is not reviewable", () => {
    expect(isReviewable({ ...due, next_review: NOW + 1000 }, NOW)).toBe(false);
  });
});
