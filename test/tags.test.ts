import { describe, it, expect } from "vitest";
import {
  buildTagBank,
  resolveTag,
  resolveTags,
  normalizeCategory,
  tagSymbol,
  TagBankEntry,
} from "@/features/dictionary/domain/tags";

describe("tag category normalisation", () => {
  it("maps common aliases to Yomitan categories", () => {
    expect(normalizeCategory("pos")).toBe("partOfSpeech");
    expect(normalizeCategory("partOfSpeech")).toBe("partOfSpeech");
    expect(normalizeCategory("usage")).toBe("expression");
    expect(normalizeCategory(undefined)).toBe("default");
    expect(normalizeCategory("custom")).toBe("custom"); // unknown → verbatim
  });
});

describe("resolveTag", () => {
  it("prefers the dictionary tag bank, with the author's wording", () => {
    const bank = buildTagBank([["v1", "pos", 0, "ngoại động từ nhóm 1", 0]] as TagBankEntry[]);
    expect(resolveTag("v1", bank)).toEqual({
      code: "v1",
      name: "ngoại động từ nhóm 1",
      category: "partOfSpeech", // normalised from "pos"
      notes: "ngoại động từ nhóm 1",
    });
  });

  it("falls back to the built-in table for common JMdict codes", () => {
    const t = resolveTag("n");
    expect(t?.code).toBe("n");
    expect(t?.category).toBe("partOfSpeech");
    expect(t?.name).toContain("danh từ");

    expect(resolveTag("uk")?.category).toBe("expression");
    expect(resolveTag("P")?.category).toBe("popular");
    expect(resolveTag("arch")?.category).toBe("archaism");
  });

  it("returns null for an unknown code (UI keeps the bare code)", () => {
    expect(resolveTag("☆nonsense☆")).toBeNull();
  });
});

describe("tagSymbol", () => {
  it("maps common codes to Vietnamese dictionary abbreviations", () => {
    expect(tagSymbol("n")).toBe("d.");
    expect(tagSymbol("v5k")).toBe("đg.");
    expect(tagSymbol("vs")).toBe("đg.");
    expect(tagSymbol("adj-i")).toBe("t.");
    expect(tagSymbol("adv")).toBe("p.");
    expect(tagSymbol("P")).toBe("★");
    expect(tagSymbol("common")).toBe("★");
  });

  it("leaves less common codes without a symbol (UI keeps the bare code)", () => {
    expect(tagSymbol("uk")).toBeUndefined();
    expect(tagSymbol("on-mim")).toBeUndefined();
    expect(tagSymbol("☆nonsense☆")).toBeUndefined();
  });
});

describe("resolveTags", () => {
  it("resolves a set, skipping unknown codes", () => {
    const bank = buildTagBank([["v1", "pos", 0, "động từ nhất đoạn", 0]] as TagBankEntry[]);
    const map = resolveTags(["v1", "vt", "⭐"], bank);
    expect(Object.keys(map).sort()).toEqual(["v1", "vt"]); // ⭐ unknown → omitted
    expect(map.v1.name).toBe("động từ nhất đoạn");
    expect(map.vt.category).toBe("partOfSpeech");
  });
});
