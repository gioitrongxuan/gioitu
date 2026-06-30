import { describe, it, expect } from "vitest";
import { assembleKanji, KanjiRow } from "@server/features/dictionary/kanjiAssemble";

const fullRow: KanjiRow = {
  literal: "学",
  term_lang: "ja",
  native_lang: "vi",
  jouyou: 1,
  jinmeiyou: null,
  jlpt: 4,
  rank_news: 63,
  stroke_count: 8,
  stroke_counts: [8],
  meanings: ["học", "kiến thức"],
  readings: {
    onyomi: [{ text: "ガク", commonness: 2 }],
    kunyomi: [{ text: "まな.ぶ" }],
    nanori: ["さと"],
  },
  components: ["⺍", "冖", "子"],
  structural: {
    category: { type: "keisei", semantic: "子", phonetic: "𦥑" },
    keiseiPhonetic: ["覚"],
  },
  han_viet: ["HỌC"],
  score: 12000,
};

describe("assembleKanji — ráp KanjiEntry từ dòng bảng kanji", () => {
  it("map đầy đủ: on/kun/nanori từ readings, cấu tạo từ structural, Hán-Việt", () => {
    const e = assembleKanji(fullRow);
    expect(e.literal).toBe("学");
    expect(e.strokeCount).toBe(8);
    expect(e.jouyou).toBe(1);
    expect(e.jlpt).toBe(4);
    expect(e.rankNews).toBe(63);
    expect(e.onyomi).toEqual([{ text: "ガク", commonness: 2 }]);
    expect(e.kunyomi).toEqual([{ text: "まな.ぶ" }]);
    expect(e.nanori).toEqual(["さと"]);
    expect(e.meanings).toEqual(["học", "kiến thức"]);
    expect(e.hanViet).toEqual(["HỌC"]);
    expect(e.components).toEqual(["⺍", "冖", "子"]);
    expect(e.structuralCategory).toEqual({ type: "keisei", semantic: "子", phonetic: "𦥑" });
    expect(e.keiseiPhonetic).toEqual(["覚"]);
    expect(e.score).toBe(12000);
  });

  it("dòng thưa (toàn null) → mặc định mảng rỗng, bỏ trường tuỳ chọn", () => {
    const e = assembleKanji({
      literal: "々",
      term_lang: "ja",
      native_lang: "en",
      jouyou: null,
      jinmeiyou: null,
      jlpt: null,
      rank_news: null,
      stroke_count: null,
      stroke_counts: null,
      meanings: null,
      readings: null,
      components: null,
      structural: null,
      han_viet: null,
      score: null,
    });
    expect(e.strokeCount).toBe(0);
    expect(e.onyomi).toEqual([]);
    expect(e.kunyomi).toEqual([]);
    expect(e.meanings).toEqual([]);
    expect(e.components).toEqual([]);
    expect(e.jouyou).toBeUndefined();
    expect(e.jlpt).toBeUndefined();
    expect(e.nanori).toBeUndefined();
    expect(e.hanViet).toBeUndefined();
    expect(e.structuralCategory).toBeUndefined();
    expect(e.score).toBeUndefined();
  });

  it("jinmeiyou=true giữ nguyên; mảng rỗng coi như không có (bỏ trường)", () => {
    const e = assembleKanji({ ...fullRow, jinmeiyou: true, han_viet: [], components: [] });
    expect(e.jinmeiyou).toBe(true);
    expect(e.hanViet).toBeUndefined();
    expect(e.components).toEqual([]);
  });
});
