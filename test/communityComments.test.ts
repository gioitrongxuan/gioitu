import { describe, expect, it } from "vitest";
import { rankByLikes } from "@/features/dictionary/domain/communityComments";
import type { DictComment } from "@/shared/dictionary";

function mk(mean: string, likes: number, dislikes = 0): DictComment {
  return { mean, likes, dislikes };
}

describe("rankByLikes", () => {
  it("xếp nhiều like lên trước", () => {
    const ranked = rankByLikes([mk("ít", 1), mk("nhiều", 30), mk("vừa", 7)]);
    expect(ranked.map((c) => c.mean)).toEqual(["nhiều", "vừa", "ít"]);
  });

  it("bằng like thì giữ nguyên thứ tự gốc", () => {
    const ranked = rankByLikes([mk("a", 5), mk("b", 5), mk("c", 5)]);
    expect(ranked.map((c) => c.mean)).toEqual(["a", "b", "c"]);
  });

  it("thiếu like coi như 0, xuống cuối chứ không làm hỏng sort", () => {
    const missing = { mean: "thiếu", dislikes: 0 } as unknown as DictComment;
    const ranked = rankByLikes([missing, mk("có", 2)]);
    expect(ranked.map((c) => c.mean)).toEqual(["có", "thiếu"]);
  });

  it("không đột biến mảng gốc của entry", () => {
    const original = [mk("ít", 1), mk("nhiều", 30)];
    rankByLikes(original);
    expect(original.map((c) => c.mean)).toEqual(["ít", "nhiều"]);
  });

  it("mảng rỗng vẫn an toàn", () => {
    expect(rankByLikes([])).toEqual([]);
  });
});
