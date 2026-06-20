import { describe, it, expect } from "vitest";
import {
  glossToText,
  glossaryToLines,
  sensesToLines,
  distributeFurigana,
  isStructured,
  GlossaryNode,
} from "@/shared/structured-content";

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

// A Wiktionary-to-Yomitan (wty-ja-vi) entry: etymology in a <details> preamble,
// the real senses in a labelled `glosses` list, an attribution backlink, and a
// per-sense register tag. Shaped exactly like the real archive.
const wtyEntry = (senses: string[]): GlossaryNode => ({
  type: "structured-content",
  content: [
    {
      tag: "div",
      data: { content: "preamble" },
      content: [
        {
          tag: "details",
          data: { content: "details-entry-Etymology" },
          content: [
            { tag: "summary", data: { content: "summary-entry" }, content: "Nguồn gốc từ" },
            { tag: "div", data: { content: "Etymology-content" }, content: "/kupu/ → */kuwu/ → /kuu/" },
          ],
        },
      ],
    },
    {
      tag: "ol",
      data: { content: "glosses" },
      content: senses.map((s) => ({ tag: "li", content: [{ tag: "div", content: [s] }] })),
    },
    {
      tag: "div",
      data: { content: "backlink" },
      content: [{ tag: "a", href: "https://vi.wiktionary.org/", content: "Wiktionary" }, " | ", { tag: "a", href: "https://kaikki.org/", content: "Kaikki" }],
    },
  ],
});

describe("Wiktionary/Kaikki (wty) structured-content extraction", () => {
  it("pulls just the glosses, dropping etymology and attribution", () => {
    // The old flattener returned "Nguồn gốc từ /kupu/ … Ăn. Wiktionary | Kaikki".
    expect(glossToText(wtyEntry(["Ăn."]))).toBe("Ăn.");
  });

  it("splits a multi-sense glosses list into one line per sense", () => {
    expect(glossaryToLines([wtyEntry(["Sự biến thái.", "Sự bất thường.", "Kẻ biến thái."])])).toEqual([
      "Sự biến thái.",
      "Sự bất thường.",
      "Kẻ biến thái.",
    ]);
  });

  it("drops inline register/POS tag chips from the meaning text", () => {
    const entry: GlossaryNode = {
      type: "structured-content",
      content: [
        {
          tag: "ol",
          data: { content: "glosses" },
          content: [
            {
              tag: "li",
              content: [
                { tag: "span", data: { content: "tags" }, content: "inf" },
                { tag: "div", content: ["Kẻ biến thái."] },
              ],
            },
          ],
        },
      ],
    };
    expect(glossToText(entry)).toBe("Kẻ biến thái.");
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

  // The old prefix/suffix-trim heuristic lumped any okurigana *between* kanji
  // into one big ruby. Yomitan's segmentiser assigns each kanji run its own
  // reading and leaves embedded kana bare.
  it("splits okurigana between kanji runs (Yomitan-style)", () => {
    expect(distributeFurigana("食べ物", "たべもの")).toEqual([
      { text: "食", reading: "た" },
      { text: "べ" },
      { text: "物", reading: "もの" },
    ]);
    expect(distributeFurigana("取り消す", "とりけす")).toEqual([
      { text: "取", reading: "と" },
      { text: "り" },
      { text: "消", reading: "け" },
      { text: "す" },
    ]);
    // 待ち合わせ → 待(ま)ち合(あ)わせ
    expect(distributeFurigana("待ち合わせ", "まちあわせ")).toEqual([
      { text: "待", reading: "ま" },
      { text: "ち" },
      { text: "合", reading: "あ" },
      { text: "わせ" },
    ]);
    // small っ (sokuon) stays bare between kanji
    expect(distributeFurigana("引っ越し", "ひっこし")).toEqual([
      { text: "引", reading: "ひ" },
      { text: "っ" },
      { text: "越", reading: "こ" },
      { text: "し" },
    ]);
  });

  it("keeps a multi-kanji compound as a single ruby", () => {
    expect(distributeFurigana("日本語", "にほんご")).toEqual([{ text: "日本語", reading: "にほんご" }]);
  });

  it("segments correctly even when the reading is katakana (matched via normalisation)", () => {
    // Normalisation lets 食 be split from べる despite the katakana reading; the
    // per-segment reading keeps its original kana form.
    expect(distributeFurigana("食べる", "タベル")).toEqual([
      { text: "食", reading: "タ" },
      { text: "べる", reading: "ベル" },
    ]);
  });
});
