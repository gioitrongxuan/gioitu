import { describe, it, expect } from "vitest";
import { kanjiCharsOf, firstGloss, toExampleWord } from "@server/features/dictionary/kanjiStore";

describe("kanjiCharsOf", () => {
  it("lọc chữ Hán duy nhất, giữ thứ tự, bỏ kana/latin/trùng", () => {
    expect(kanjiCharsOf("学校がっこうabc学")).toEqual(["学", "校"]);
    expect(kanjiCharsOf("ひらがな")).toEqual([]);
  });
});

describe("firstGloss / toExampleWord", () => {
  it("gloss chuỗi hoặc {text}; thiếu → undefined", () => {
    expect(firstGloss([{ gloss: ["nước"] }])).toBe("nước");
    expect(firstGloss([{ gloss: [{ text: "water" }] }])).toBe("water");
    expect(firstGloss(null)).toBeUndefined();
    expect(firstGloss([{}])).toBeUndefined();
  });

  it("toExampleWord: headings[0] + gloss đầu", () => {
    expect(
      toExampleWord({
        headings: [{ base: "学校", reading: "がっこう", hanViet: "HỌC HIỆU" }],
        senses: [{ gloss: ["trường học"] }],
      }),
    ).toEqual({ base: "学校", reading: "がっこう", hanViet: "HỌC HIỆU", sense: "trường học" });
  });

  it("reading/hanViet rỗng → undefined (không để chuỗi rỗng)", () => {
    expect(toExampleWord({ headings: [{ base: "水" }], senses: null })).toEqual({
      base: "水",
      reading: undefined,
      hanViet: undefined,
      sense: undefined,
    });
  });
});
