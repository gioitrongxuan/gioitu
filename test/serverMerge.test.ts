import { describe, it, expect } from "vitest";
import { mergeDeinflectedHits, CandidateHit, MergeableEntry } from "@/features/dictionary/domain/serverMerge";

// entry ngắn gọn cho test — chỉ cần các trường mà mergeDeinflectedHits đọc.
const e = (term: string, reading?: string, score?: number): MergeableEntry => ({ term, reading, score });

describe("mergeDeinflectedHits", () => {
  it("gộp và xếp exact (ít lý do) trước, rồi score giảm dần", () => {
    const hits: CandidateHit<MergeableEntry>[] = [
      { reasons: [], entries: [e("食べる", "たべる", 10)] },
      { reasons: ["polite"], entries: [e("食う", "くう", 99)] },
    ];
    const out = mergeDeinflectedHits(hits, "食べます");
    expect(out.map((r) => r.entry.term)).toEqual(["食べる", "食う"]);
    // source được gắn cho mọi kết quả.
    expect(out.every((r) => r.source === "食べます")).toBe(true);
  });

  it("khoá theo (term, reading): đồng âm cùng term khác cách đọc KHÔNG gộp", () => {
    const hits: CandidateHit<MergeableEntry>[] = [
      { reasons: [], entries: [e("桜", "さくら", 5), e("桜", "オウ", 3)] },
    ];
    const out = mergeDeinflectedHits(hits, "桜");
    expect(out).toHaveLength(2);
  });

  it("trùng khoá: giữ ứng viên ÍT lý do biến cách hơn", () => {
    const hits: CandidateHit<MergeableEntry>[] = [
      { reasons: ["causative", "polite"], entries: [e("見る", "みる", 1)] },
      { reasons: ["polite"], entries: [e("見る", "みる", 1)] },
    ];
    const out = mergeDeinflectedHits(hits, "見させます");
    expect(out).toHaveLength(1);
    expect(out[0].reasons).toEqual(["polite"]);
  });

  it("hoà lý do: giữ ứng viên ĐẾN TRƯỚC (first-wins như vòng lặp tuần tự cũ)", () => {
    const hits: CandidateHit<MergeableEntry>[] = [
      { reasons: ["a"], entries: [e("行く", "いく", 1)] },
      { reasons: ["b"], entries: [e("行く", "いく", 1)] },
    ];
    const out = mergeDeinflectedHits(hits, "行って");
    expect(out).toHaveLength(1);
    expect(out[0].reasons).toEqual(["a"]);
  });

  it("mẻ rỗng và không có kết quả nào → mảng rỗng", () => {
    expect(mergeDeinflectedHits([], "x")).toEqual([]);
    expect(mergeDeinflectedHits([{ reasons: [], entries: [] }], "x")).toEqual([]);
  });
});
