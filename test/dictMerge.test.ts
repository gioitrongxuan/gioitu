import { describe, it, expect } from "vitest";
import {
  SyncedDict,
  mergeDictPair,
  mergeSyncedDicts,
  sameTermContent,
  termMergeKey,
} from "@/features/dictionary/domain/dictMerge";
import type { DictEntry, LocalDictionary } from "@/shared/db";

function reg(over: Partial<LocalDictionary>): LocalDictionary {
  return {
    id: "d",
    title: "t",
    term_lang: "ja",
    native_lang: "vi",
    termCount: 0,
    importedAt: 0,
    custom: true,
    ...over,
  };
}

function term(t: string, gloss: string, updatedAt?: number): DictEntry {
  return {
    term: t,
    reading: "",
    definitions: [gloss],
    term_lang: "ja",
    native_lang: "vi",
    ...(updatedAt !== undefined ? { updatedAt } : {}),
  };
}

function blob(over: Partial<LocalDictionary>, terms: DictEntry[] = []): SyncedDict {
  return { registry: reg(over), terms };
}

describe("mergeDictPair — term-level cho từ điển cá nhân", () => {
  it("hai máy sửa HAI từ khác nhau: giữ cả hai (không còn nuốt nguyên blob)", () => {
    const a = blob({ updatedAt: 10 }, [term("水", "nước", 10), term("火", "lửa sửa ở A", 10)]);
    const b = blob({ updatedAt: 20 }, [term("水", "nước", 5), term("山", "núi thêm ở B", 20)]);
    const merged = mergeDictPair(a, b);
    const glosses = Object.fromEntries(merged.terms.map((t) => [t.term, t.definitions[0]]));
    expect(glosses).toEqual({ 水: "nước", 火: "lửa sửa ở A", 山: "núi thêm ở B" });
    expect(merged.registry.termCount).toBe(3);
  });

  it("cùng một từ sửa hai nơi: mốc updatedAt theo từ mới hơn thắng", () => {
    const a = blob({ updatedAt: 30 }, [term("水", "bản mới", 30)]);
    const b = blob({ updatedAt: 20 }, [term("水", "bản cũ", 20)]);
    expect(mergeDictPair(a, b).terms[0].definitions[0]).toBe("bản mới");
  });

  it("từ thêm ở máy A sống sót dù registry máy B mới hơn (điểm yếu blob-LWW cũ)", () => {
    const a = blob({ updatedAt: 10 }, [term("火", "lửa", 10)]);
    const b = blob({ updatedAt: 99, title: "đổi tên ở B" }, []);
    const merged = mergeDictPair(a, b);
    expect(merged.terms.map((t) => t.term)).toEqual(["火"]);
    expect(merged.registry.title).toBe("đổi tên ở B"); // metadata theo bản mới hơn
    expect(merged.registry.updatedAt).toBe(99);
  });

  it("tombstone theo từ: xoá mới hơn mốc của từ → từ bị xoá ở mọi máy", () => {
    const a = blob({ updatedAt: 50, deletedTerms: { [termMergeKey(term("火", ""))]: 50 } }, []);
    const b = blob({ updatedAt: 10 }, [term("火", "lửa", 10)]);
    const merged = mergeDictPair(a, b);
    expect(merged.terms).toHaveLength(0);
    expect(merged.registry.deletedTerms).toEqual({ [termMergeKey(term("火", ""))]: 50 });
  });

  it("thêm lại sau khi xoá: từ mới hơn tombstone → sống, tombstone bị tỉa", () => {
    const a = blob({ updatedAt: 50, deletedTerms: { [termMergeKey(term("火", ""))]: 50 } }, []);
    const b = blob({ updatedAt: 70 }, [term("火", "lửa hồi sinh", 70)]);
    const merged = mergeDictPair(a, b);
    expect(merged.terms.map((t) => t.term)).toEqual(["火"]);
    expect(merged.registry.deletedTerms).toBeUndefined();
  });

  it("từ legacy không có updatedAt: dùng mốc registry của bên đó làm fallback", () => {
    const a = blob({ updatedAt: 30 }, [term("水", "bản legacy bên mới")]); // stamp = 30
    const b = blob({ updatedAt: 20 }, [term("水", "bản legacy bên cũ")]); // stamp = 20
    expect(mergeDictPair(a, b).terms[0].definitions[0]).toBe("bản legacy bên mới");
  });

  it("tombstone CẢ CUỐN mới hơn vẫn thắng trọn (không term-merge với bản sống cũ)", () => {
    const live = blob({ updatedAt: 10 }, [term("水", "nước", 10)]);
    const dead = blob({ updatedAt: 20, deletedAt: 20 }, []);
    const merged = mergeDictPair(live, dead);
    expect(merged.registry.deletedAt).toBe(20);
    expect(merged.terms).toHaveLength(0);
  });

  it("từ điển nhập .zip (không custom): giữ LWW nguyên blob — re-import bỏ từ phải lan truyền", () => {
    const oldImport = blob({ custom: undefined, importedAt: 10, updatedAt: undefined }, [
      term("水", "nước"),
      term("火", "lửa"),
    ]);
    const newImport = blob({ custom: undefined, importedAt: 20, updatedAt: undefined }, [
      term("水", "nước"),
    ]);
    const merged = mergeDictPair(oldImport, newImport);
    expect(merged.terms.map((t) => t.term)).toEqual(["水"]);
  });

  it("hoà mốc theo từ → bên b (remote) thắng, khớp quy ước merge cũ", () => {
    const a = blob({ updatedAt: 10 }, [term("水", "bản a", 10)]);
    const b = blob({ updatedAt: 10 }, [term("水", "bản b", 10)]);
    expect(mergeDictPair(a, b).terms[0].definitions[0]).toBe("bản b");
  });
});

describe("mergeSyncedDicts — gộp danh sách theo registry.id", () => {
  it("id khác nhau giữ cả hai; cùng id thì merge term-level", () => {
    const merged = mergeSyncedDicts(
      [blob({ id: "x", updatedAt: 10 }, [term("水", "nước", 10)])],
      [blob({ id: "x", updatedAt: 20 }, [term("火", "lửa", 20)]), blob({ id: "y", updatedAt: 5 })],
    );
    expect(merged.map((d) => d.registry.id).sort()).toEqual(["x", "y"]);
    expect(merged.find((d) => d.registry.id === "x")!.terms).toHaveLength(2);
  });
});

describe("sameTermContent — so nội dung bỏ qua mốc LWW", () => {
  it("cùng nội dung, khác updatedAt → bằng nhau", () => {
    expect(sameTermContent(term("水", "nước", 10), term("水", "nước", 99))).toBe(true);
    expect(sameTermContent(term("水", "nước", 10), term("水", "nước"))).toBe(true);
  });

  it("nội dung khác → không bằng", () => {
    expect(sameTermContent(term("水", "nước", 10), term("水", "nước lã", 10))).toBe(false);
  });
});
