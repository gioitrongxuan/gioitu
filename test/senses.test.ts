import { describe, it, expect } from "vitest";
import { tagRowVisibility } from "@/features/dictionary/domain/senses";

const sense = (...tags: string[]) => ({ tags });

describe("tagRowVisibility", () => {
  it("always shows the first sense's tags", () => {
    expect(tagRowVisibility([sense("n")])).toEqual([true]);
  });

  it("hides the tag row on consecutive senses with the same tag set", () => {
    expect(tagRowVisibility([sense("n"), sense("n"), sense("n")])).toEqual([true, false, false]);
  });

  it("shows the row again whenever the tag set changes", () => {
    expect(
      tagRowVisibility([sense("n"), sense("n"), sense("v5r"), sense("n")]),
    ).toEqual([true, false, true, true]);
  });

  it("treats order as part of the set (reordered tags are a new group)", () => {
    expect(tagRowVisibility([sense("n", "vs"), sense("vs", "n")])).toEqual([true, true]);
  });

  it("differs on subset/superset", () => {
    expect(tagRowVisibility([sense("n"), sense("n", "vs")])).toEqual([true, true]);
  });

  it("handles tagless senses", () => {
    // Hàng tag rỗng không render (SenseView đã kiểm tra length) nhưng
    // visibility vẫn phải nhất quán để sense có tag ngay sau đó hiện lại.
    expect(tagRowVisibility([sense(), sense(), sense("n")])).toEqual([true, false, true]);
  });

  it("empty input → empty output", () => {
    expect(tagRowVisibility([])).toEqual([]);
  });
});
