import { describe, expect, it } from "vitest";
import {
  editDistanceWithin,
  fuzzyMatchDistance,
  fuzzyThreshold,
} from "@/features/dictionary/domain/fuzzy";

describe("editDistanceWithin", () => {
  it("is 0 for identical strings", () => {
    expect(editDistanceWithin("食べる", "食べる", 2)).toBe(0);
    expect(editDistanceWithin("", "", 2)).toBe(0);
  });

  it("counts a single insert, delete or substitution as 1", () => {
    expect(editDistanceWithin("cat", "cats", 2)).toBe(1); // insert
    expect(editDistanceWithin("cats", "cat", 2)).toBe(1); // delete
    expect(editDistanceWithin("cat", "cot", 2)).toBe(1); // substitute
    expect(editDistanceWithin("食べる", "食べゆ", 2)).toBe(1);
  });

  it("handles an empty string against a non-empty one", () => {
    expect(editDistanceWithin("", "abc", 5)).toBe(3);
    expect(editDistanceWithin("abc", "", 5)).toBe(3);
  });

  it("returns max+1 (not the true distance) once the bound is exceeded", () => {
    // 'kitten' → 'sitting' is distance 3; bounded at 1 it must bail out early.
    expect(editDistanceWithin("kitten", "sitting", 1)).toBe(2);
    expect(editDistanceWithin("abc", "xyz", 1)).toBe(2);
    // A pure length gap larger than the bound short-circuits.
    expect(editDistanceWithin("a", "abcdef", 2)).toBe(3);
  });
});

describe("fuzzyThreshold", () => {
  it("allows one edit for short queries, two for longer ones", () => {
    expect(fuzzyThreshold("ab")).toBe(1);
    expect(fuzzyThreshold("食べる")).toBe(1); // 3 chars
    expect(fuzzyThreshold("test")).toBe(1); // 4 chars (boundary)
    expect(fuzzyThreshold("tests")).toBe(2); // 5 chars
    expect(fuzzyThreshold("receive")).toBe(2);
  });
});

describe("fuzzyMatchDistance", () => {
  it("takes the smaller distance over term and reading", () => {
    // Query matches the kanji term exactly.
    expect(fuzzyMatchDistance("食べる", "食べる", "たべる", 2)).toBe(0);
    // Kana query matches via the reading, even though the kanji term differs.
    expect(fuzzyMatchDistance("たべる", "食べる", "たべる", 2)).toBe(0);
    // A near-miss kana query: one edit from the reading.
    expect(fuzzyMatchDistance("たべろ", "食べる", "たべる", 2)).toBe(1);
  });

  it("ignores reading when absent or identical to the term", () => {
    expect(fuzzyMatchDistance("cat", "cot", undefined, 2)).toBe(1);
    expect(fuzzyMatchDistance("cat", "cot", "cot", 2)).toBe(1);
  });
});
