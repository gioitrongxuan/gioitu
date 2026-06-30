import { describe, it, expect } from "vitest";
import {
  parseComponents,
  parseDescrSeq,
  expandDescrSeq,
  extractComponents,
  attachStructure,
  KanjiData,
} from "@server/features/dictionary/kanjiData";
import type { KanjiEntry } from "@/shared/kanji";

describe("parseComponents / parseDescrSeq", () => {
  it("đọc 'kanji;phần', bỏ comment + dòng hỏng", () => {
    const m = parseComponents("# header\n学;⺍冖子\nhỏng-không-có-dấu-chấm-phẩy\n何;⺅可\n");
    expect(m.get("学")).toEqual(["⺍", "冖", "子"]);
    expect(m.get("何")).toEqual(["⺅", "可"]);
    expect(m.size).toBe(2);
  });

  it("descrSeq lưu chuỗi IDS thô", () => {
    const m = parseDescrSeq("何;⿰亻可\n可;⿱丁口\n");
    expect(m.get("何")).toBe("⿰亻可");
  });
});

describe("expandDescrSeq + extractComponents", () => {
  const seqMap = parseDescrSeq("何;⿰亻可\n亻;亻\n可;⿱丁口\n丁;丁\n口;口\n");

  it("mở rộng đệ quy + rút kanji (bỏ toán tử ⿰⿱)", () => {
    const seq = expandDescrSeq(seqMap, "何");
    const comps = extractComponents(seq!);
    expect(comps).toContain("可");
    expect(comps).toContain("丁");
    expect(comps).toContain("口");
    expect(comps).not.toContain("⿰");
    expect(comps).not.toContain("⿱");
  });

  it("nguyên tử (tự trỏ về mình) → undefined", () => {
    expect(expandDescrSeq(seqMap, "口")).toBeUndefined();
  });
});

describe("attachStructure", () => {
  const data: KanjiData = {
    components: new Map([["何", ["⺅", "可"]]]),
    descrSeq: parseDescrSeq("何;⿰亻可\n可;⿱丁口\n丁;丁\n口;口\n亻;亻\n"),
    structural: { "何": { type: "keisei", semantic: "人", phonetic: "可" } },
    keiseiPhonetic: new Map([["可", ["何", "河"]]]),
    keiseiSemantic: new Map([["人", ["何"]]]),
  };

  const make = (literal: string): KanjiEntry => ({
    literal, strokeCount: 7, components: [], meanings: [], onyomi: [], kunyomi: [],
  });

  it("gộp components (file + IDS), gắn structuralCategory cho chữ hình thanh", () => {
    const entry = make("何");
    attachStructure(entry, data);
    expect(entry.components).toContain("可"); // từ file
    expect(entry.components).toContain("口"); // từ IDS mở rộng
    expect(entry.components).toEqual([...entry.components].sort()); // đã sort
    expect(entry.structuralCategory).toEqual({ type: "keisei", semantic: "人", phonetic: "可" });
    // 何 không phải PHẦN âm/nghĩa của chữ nào khác → không có usage.
    expect(entry.keiseiPhonetic).toBeUndefined();
    expect(entry.keiseiSemantic).toBeUndefined();
  });

  it("keisei usage: chữ được dùng làm phần âm/nghĩa ở những chữ nào", () => {
    const phonetic = make("可");
    attachStructure(phonetic, data);
    expect(phonetic.keiseiPhonetic).toEqual(["何", "河"]);

    const semantic = make("人");
    attachStructure(semantic, data);
    expect(semantic.keiseiSemantic).toEqual(["何"]);
  });

  it("kanji không có dữ liệu → components rỗng, không structural", () => {
    const entry: KanjiEntry = {
      literal: "𠁣",
      strokeCount: 3,
      components: [],
      meanings: [],
      onyomi: [],
      kunyomi: [],
    };
    attachStructure(entry, data);
    expect(entry.components).toEqual([]);
    expect(entry.structuralCategory).toBeUndefined();
  });
});
