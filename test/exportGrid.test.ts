import { describe, it, expect } from "vitest";
import { computeGridColumns, chunkIntoRows } from "@/features/kanjistats/domain/exportGrid";

describe("computeGridColumns", () => {
  it("matches CSS grid auto-fill: fits as many cellSize+gap tracks as possible", () => {
    // 5 cells of 34px + 4 4px gaps = 186px exactly.
    expect(computeGridColumns(186, 34, 4)).toBe(5);
    expect(computeGridColumns(185, 34, 4)).toBe(4); // one pixel short of the 5th
    expect(computeGridColumns(34, 34, 4)).toBe(1); // exactly one cell, no room for a gap+cell
  });

  it("never returns fewer than 1 column", () => {
    expect(computeGridColumns(0, 34, 4)).toBe(1);
    expect(computeGridColumns(10, 34, 4)).toBe(1); // narrower than a single cell
  });

  it("guards against a non-positive cell size", () => {
    expect(computeGridColumns(200, 0, 4)).toBe(1);
    expect(computeGridColumns(200, -5, 4)).toBe(1);
  });
});

describe("chunkIntoRows", () => {
  it("splits into fixed-width rows, left-to-right top-to-bottom", () => {
    expect(chunkIntoRows([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkIntoRows(["a", "b", "c"], 3)).toEqual([["a", "b", "c"]]);
  });

  it("returns an empty array for an empty list", () => {
    expect(chunkIntoRows([], 3)).toEqual([]);
  });

  it("falls back to a single row when columns is non-positive", () => {
    expect(chunkIntoRows([1, 2, 3], 0)).toEqual([[1, 2, 3]]);
  });
});
