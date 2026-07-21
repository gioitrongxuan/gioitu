import { describe, it, expect } from "vitest";
import { DictEntry } from "@/shared/db";
import { TermResult } from "@/features/dictionary/data/yomitan";
import { partitionResults, isSecondaryResult, resultGloss } from "@/features/dictionary/domain/results";

function entry(term: string, over: Partial<DictEntry> = {}): DictEntry {
  return { term, definitions: [], term_lang: "ja", native_lang: "vi", ...over };
}

function result(term: string, flags: Partial<TermResult> = {}): TermResult {
  return { entry: entry(term), reasons: [], source: term, ...flags };
}

describe("partitionResults (#172)", () => {
  it("khớp thẳng vào primary, fuzzy/viaDefinition vào secondary", () => {
    const exact = result("共感");
    const fuzzy = result("共鳴", { fuzzy: true });
    const viaDef = result("同情", { viaDefinition: true });
    const { primary, secondary } = partitionResults([exact, fuzzy, viaDef]);
    expect(primary).toEqual([exact]);
    expect(secondary).toEqual([fuzzy, viaDef]);
  });

  it("giữ nguyên thứ tự trong từng nhóm", () => {
    const a = result("A", { viaDefinition: true });
    const b = result("B", { viaDefinition: true });
    const { secondary } = partitionResults([a, b]);
    expect(secondary.map((r) => r.entry.term)).toEqual(["A", "B"]);
  });

  it("tra tiếng Việt chỉ có khớp theo nghĩa → primary rỗng", () => {
    const { primary, secondary } = partitionResults([
      result("共感", { viaDefinition: true }),
      result("同情", { viaDefinition: true }),
    ]);
    expect(primary).toEqual([]);
    expect(secondary).toHaveLength(2);
  });

  it("isSecondaryResult đúng với cả hai cờ", () => {
    expect(isSecondaryResult(result("x", { fuzzy: true }))).toBe(true);
    expect(isSecondaryResult(result("x", { viaDefinition: true }))).toBe(true);
    expect(isSecondaryResult(result("x"))).toBe(false);
  });
});

describe("resultGloss", () => {
  it("nối các nghĩa dạng chuỗi bằng ' · '", () => {
    const e = entry("共感", { definitions: ["sự đồng cảm", "cảm thông"] });
    expect(resultGloss(e)).toBe("sự đồng cảm · cảm thông");
  });

  it("ưu tiên senses khi có (nguồn server)", () => {
    const e = entry("理解", {
      definitions: ["bỏ qua dòng này"],
      senses: [{ glossary: ["sự hiểu biết"], tags: [] }],
    });
    expect(resultGloss(e)).toBe("sự hiểu biết");
  });

  it("không có nghĩa → chuỗi rỗng", () => {
    expect(resultGloss(entry("空"))).toBe("");
  });
});
