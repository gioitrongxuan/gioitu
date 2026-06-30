import { describe, it, expect } from "vitest";
import { mapMaziiRecord, parseJlpt, parseMaziiLine, MAX_IMAGES_PER_WORD } from "@server/features/dictionary/mazii";

const rec = {
  word: "緊急避難",
  search: [
    {
      word: "緊急避難",
      han: "KHẨN CẤP TỊ NAN",
      level: "N1",
      phonetic: "きんきゅうひなん",
      pronunciation: [
        { kana: "きんきゅうひなん", accent: "LHHHHLL-L", tokenizedKana: [{ value: "き" }, { value: "ん" }] },
      ],
      means: [
        {
          kind: "n",
          mean: "sự sơ tán khẩn cấp",
          examples: [{ content: "緊急避難する。", mean: "Sơ tán khẩn cấp.", transcription: "きんきゅう…" }],
        },
      ],
      opposite_word: ["否運", "非運"],
    },
  ],
  comments: [
    { mean: "hành động tự vệ", like: 2, dislike: 0, username: "Loc", avatar: "http://a", reportId: 585798, status: 1 },
    { mean: "spam", like: 0, dislike: 0, reportId: 999, status: 0 },
  ],
  images: Array.from({ length: 20 }, (_, i) => `http://x/${i}.png`),
};

describe("mapMaziiRecord", () => {
  const m = mapMaziiRecord(rec);
  const w = m.words[0];

  it("một search → một word với trường cấp từ", () => {
    expect(m.words).toHaveLength(1);
    expect(w.base).toBe("緊急避難");
    expect(w.reading).toBe("きんきゅうひなん");
    expect(w.hanViet).toBe("KHẨN CẤP TỊ NAN");
    expect(w.jlpt).toBe(1);
    expect(w.pitch?.[0]).toMatchObject({ accent: "LHHHHLL-L", moras: ["き", "ん"] });
  });

  it("means → senses (pos/gloss/examples/dictionary) + opposite_word → xref antonym", () => {
    expect(w.senses[0]).toMatchObject({ pos: ["n"], gloss: ["sự sơ tán khẩn cấp"], dictionary: "Mazii" });
    expect(w.senses[0].examples?.[0]).toEqual({ ja: "緊急避難する。", vi: "Sơ tán khẩn cấp." });
    expect(w.senses[0].xref).toEqual([
      { base: "否運", type: "antonym" },
      { base: "非運", type: "antonym" },
    ]);
  });

  it("ảnh bị cắt theo MAX_IMAGES_PER_WORD; bình luận chỉ giữ status=1", () => {
    expect(m.images).toHaveLength(MAX_IMAGES_PER_WORD);
    expect(m.images[0]).toMatchObject({ url: "http://x/0.png", ord: 0, base: "緊急避難" });
    expect(m.comments).toHaveLength(1);
    expect(m.comments[0]).toMatchObject({ mean: "hành động tự vệ", likes: 2, author: "Loc", sourceId: "585798" });
  });
});

describe("parseJlpt", () => {
  it("nhận chuỗi, mảng, dạng phẩy; bỏ qua không hợp lệ", () => {
    expect(parseJlpt("N3")).toBe(3);
    expect(parseJlpt(["N3", "N1"])).toBe(3);
    expect(parseJlpt("N3,N1")).toBe(3);
    expect(parseJlpt(null)).toBeUndefined();
    expect(parseJlpt("foo")).toBeUndefined();
  });
});

describe("đồng âm: nhiều search → nhiều word", () => {
  it("hai reading cho cùng base → hai word-unit", () => {
    const r = {
      word: "辛い",
      search: [
        { word: "辛い", pronunciation: [{ kana: "からい" }], means: [{ kind: "adj-i", mean: "cay" }] },
        { word: "辛い", pronunciation: [{ kana: "つらい" }], means: [{ kind: "adj-i", mean: "khổ" }] },
      ],
    };
    const m = mapMaziiRecord(r);
    expect(m.words.map((w) => w.reading)).toEqual(["からい", "つらい"]);
  });
});

describe("parseMaziiLine", () => {
  it("bỏ qua dòng rỗng/hỏng", () => {
    expect(parseMaziiLine("")).toBeNull();
    expect(parseMaziiLine("{ broken")).toBeNull();
    expect(parseMaziiLine('{"word":"x"}')?.word).toBe("x");
  });
});
