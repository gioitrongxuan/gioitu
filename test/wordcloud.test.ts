import { describe, it, expect } from "vitest";
import {
  buildCloud,
  computeShade,
  effectiveCount,
  isVisibleOnCloud,
} from "../src/domain/wordcloud";
import { makeEntry } from "./fixtures";

describe("visibility depends on SRS status (constraint 4)", () => {
  it("shows LEARNING and RELAPSED, hides LEARNED", () => {
    expect(isVisibleOnCloud({ status: "LEARNING" })).toBe(true);
    expect(isVisibleOnCloud({ status: "RELAPSED" })).toBe(true);
    expect(isVisibleOnCloud({ status: "LEARNED" })).toBe(false);
  });
});

describe("log-normalized shade (fix point 7)", () => {
  it("0 count -> 0, max count -> 1, and is monotonic", () => {
    expect(computeShade(0, 100)).toBe(0);
    expect(computeShade(100, 100)).toBe(1);
    expect(computeShade(5, 100)).toBeGreaterThan(computeShade(2, 100));
    expect(computeShade(5, 100)).toBeLessThan(1);
  });

  it("returns 0 when there is no positive max", () => {
    expect(computeShade(0, 0)).toBe(0);
  });
});

describe("buildCloud", () => {
  it("filters out LEARNED, flags badges and normalizes by visible max", () => {
    const entries = [
      makeEntry({ term: "a", status: "LEARNING", lookup_count: 1 }),
      makeEntry({ term: "b", status: "RELAPSED", lookup_count: 10 }),
      makeEntry({ term: "c", status: "LEARNED", lookup_count: 99 }),
    ];
    const cloud = buildCloud(entries, { now: 0 });
    expect(cloud.map((t) => t.entry.term).sort()).toEqual(["a", "b"]);
    const b = cloud.find((t) => t.entry.term === "b")!;
    expect(b.hasBadge).toBe(true); // RELAPSED carries the badge
    expect(b.shade).toBe(1); // highest among visible (LEARNED excluded)
  });

  it("colour is independent of SRS (constraint 3): badge word can be lighter", () => {
    const entries = [
      makeEntry({ term: "x", status: "RELAPSED", lookup_count: 1 }),
      makeEntry({ term: "y", status: "LEARNING", lookup_count: 50 }),
    ];
    const cloud = buildCloud(entries, { now: 0 });
    const x = cloud.find((t) => t.entry.term === "x")!;
    const y = cloud.find((t) => t.entry.term === "y")!;
    expect(x.shade).toBeLessThan(y.shade);
  });
});

describe("time-decay (optional, default off)", () => {
  it("returns raw count when disabled", () => {
    const e = makeEntry({ lookup_count: 10, last_lookup_at: 0 });
    expect(effectiveCount(e)).toBe(10);
  });

  it("decays weight by time when enabled", () => {
    const e = makeEntry({ lookup_count: 10, last_lookup_at: 0 });
    const decayed = effectiveCount(e, { timeDecay: true, lambda: 0.1, now: 10 * 24 * 60 * 60 * 1000 });
    expect(decayed).toBeLessThan(10);
    expect(decayed).toBeGreaterThan(0);
  });
});
