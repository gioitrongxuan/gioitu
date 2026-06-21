import { describe, expect, it } from "vitest";
import { romajiToHiragana } from "@/features/dictionary/domain/romaji";
import { candidates } from "@/features/dictionary/domain/deinflect";

describe("romajiToHiragana", () => {
  it("converts everyday romaji to hiragana", () => {
    expect(romajiToHiragana("sakura")).toBe("さくら");
    expect(romajiToHiragana("taberu")).toBe("たべる");
    expect(romajiToHiragana("konnichiwa")).toBe("こんにちわ"); // literal: wa → わ
    expect(romajiToHiragana("shinbun")).toBe("しんぶん");
  });

  it("handles sokuon (doubled consonant) and digraphs", () => {
    expect(romajiToHiragana("kitto")).toBe("きっと");
    expect(romajiToHiragana("matcha")).toBe("まっちゃ");
    expect(romajiToHiragana("kyou")).toBe("きょう");
  });

  it("is case-insensitive", () => {
    expect(romajiToHiragana("Sakura")).toBe("さくら");
  });

  it("returns '' for input that isn't clean romaji", () => {
    expect(romajiToHiragana("さくら")).toBe(""); // already kana
    expect(romajiToHiragana("桜")).toBe(""); // kanji
    expect(romajiToHiragana("")).toBe("");
    expect(romajiToHiragana("xq")).toBe(""); // unmappable fragment
  });
});

describe("candidates with romaji (ja)", () => {
  it("adds the kana form so a romaji reading resolves to the entry", () => {
    const terms = candidates("sakura", "ja").map((c) => c.term);
    expect(terms).toContain("さくら");
  });

  it("deinflects the converted kana (tabeta → 食べた → たべる)", () => {
    const terms = candidates("tabeta", "ja").map((c) => c.term);
    expect(terms).toContain("たべた");
    expect(terms).toContain("たべる"); // past-tense deinflection of the kana form
  });

  it("leaves kana/kanji input unchanged (no spurious candidates)", () => {
    const terms = candidates("さくら", "ja").map((c) => c.term);
    expect(terms).toContain("さくら");
  });
});
