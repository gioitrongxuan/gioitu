import { describe, it, expect } from "vitest";
import {
  glossToText,
  glossaryToLines,
  sensesToLines,
  distributeFurigana,
  isStructured,
  GlossaryNode,
} from "../src/data/structured-content";

const structured = (text: string): GlossaryNode => ({
  type: "structured-content",
  content: [{ tag: "ol", content: [{ tag: "li", content: [{ tag: "div", content: [text] }] }] }],
});

describe("glossToText", () => {
  it("passes plain strings through", () => {
    expect(glossToText("hello")).toBe("hello");
  });
  it("reads { text } nodes", () => {
    expect(glossToText({ type: "text", text: "con mèo" })).toBe("con mèo");
  });
  it("flattens nested structured content", () => {
    expect(glossToText(structured("con mèo"))).toBe("con mèo");
  });
  it("joins list items onto separate lines", () => {
    const node: GlossaryNode = {
      type: "structured-content",
      content: [{ tag: "ul", content: [{ tag: "li", content: "a" }, { tag: "li", content: "b" }] }],
    };
    const text = glossToText(node);
    expect(text).toContain("a");
    expect(text).toContain("b");
  });
  it("degrades images to alt text", () => {
    expect(glossToText({ type: "image", alt: "biểu đồ" })).toBe("[biểu đồ]");
  });
});

describe("glossaryToLines / sensesToLines", () => {
  it("flattens and drops empties", () => {
    expect(glossaryToLines(["a", "", structured("b")])).toEqual(["a", "b"]);
    expect(glossaryToLines(undefined)).toEqual([]);
  });
  it("flattens grouped senses", () => {
    expect(
      sensesToLines([
        { tags: ["n"], glossary: ["con mèo"] },
        { tags: ["vs"], glossary: [structured("học")] },
      ]),
    ).toEqual(["con mèo", "học"]);
  });
});

describe("isStructured", () => {
  it("detects structured-content wrappers", () => {
    expect(isStructured(structured("x"))).toBe(true);
    expect(isStructured("x")).toBe(false);
  });
});

describe("distributeFurigana", () => {
  it("keeps okurigana out of the ruby", () => {
    expect(distributeFurigana("食べる", "たべる")).toEqual([
      { text: "食", reading: "た" },
      { text: "べる" },
    ]);
    expect(distributeFurigana("高い", "たかい")).toEqual([
      { text: "高", reading: "たか" },
      { text: "い" },
    ]);
  });
  it("rubies a whole all-kanji word", () => {
    expect(distributeFurigana("猫", "ねこ")).toEqual([{ text: "猫", reading: "ねこ" }]);
    expect(distributeFurigana("勉強", "べんきょう")).toEqual([
      { text: "勉強", reading: "べんきょう" },
    ]);
  });
  it("handles a leading kana prefix", () => {
    expect(distributeFurigana("お茶", "おちゃ")).toEqual([
      { text: "お" },
      { text: "茶", reading: "ちゃ" },
    ]);
  });
  it("returns the bare term when there is no/equal reading", () => {
    expect(distributeFurigana("hello")).toEqual([{ text: "hello" }]);
    expect(distributeFurigana("ねこ", "ねこ")).toEqual([{ text: "ねこ" }]);
  });
});
