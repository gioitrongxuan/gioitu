import { describe, it, expect } from "vitest";
import {
  deinflect,
  deinflectEnglish,
  parseEntryRules,
  rulesMatchEntry,
  RULE,
} from "../src/domain/deinflect";

/** All candidate base forms produced for an inflected word. */
const bases = (x: string) => deinflect(x).map((d) => d.term);
/** The reason chain recorded for a particular base form (if produced). */
const reasonsFor = (x: string, base: string) =>
  deinflect(x).find((d) => d.term === base)?.reasons;

describe("Japanese deinflection", () => {
  it("walks common single inflections back to the dictionary form", () => {
    expect(bases("食べた")).toContain("食べる"); // past, ichidan
    expect(bases("食べない")).toContain("食べる"); // negative
    expect(bases("食べて")).toContain("食べる"); // -te
    expect(bases("食べれば")).toContain("食べる"); // provisional
    expect(bases("食べたい")).toContain("食べる"); // desiderative
    expect(bases("食べよう")).toContain("食べる"); // volitional
    expect(bases("食べろ")).toContain("食べる"); // imperative
  });

  it("handles godan euphonic past / te-forms", () => {
    expect(bases("書いた")).toContain("書く");
    expect(bases("泳いだ")).toContain("泳ぐ");
    expect(bases("話した")).toContain("話す");
    expect(bases("待った")).toContain("待つ");
    expect(bases("飲んだ")).toContain("飲む");
    expect(bases("行って")).toContain("行く"); // irregular って → く
  });

  it("handles godan negatives across columns", () => {
    expect(bases("飲まない")).toContain("飲む");
    expect(bases("書かない")).toContain("書く");
    expect(bases("買わない")).toContain("買う"); // う-verb uses わ
    expect(bases("待たない")).toContain("待つ");
  });

  it("handles polite, potential, passive and causative", () => {
    expect(bases("書きました")).toContain("書く"); // polite past
    expect(bases("話します")).toContain("話す"); // polite
    expect(bases("飲める")).toContain("飲む"); // potential
    expect(bases("書かれる")).toContain("書く"); // passive
    expect(bases("食べられる")).toContain("食べる"); // potential/passive (ichidan)
    expect(bases("書かせる")).toContain("書く"); // causative
    expect(bases("食べさせる")).toContain("食べる"); // causative (ichidan)
  });

  it("handles irregular する / 来る verbs", () => {
    expect(bases("した")).toContain("する");
    expect(bases("します")).toContain("する");
    expect(bases("勉強します")).toContain("勉強する");
    expect(bases("きた")).toContain("くる");
    expect(bases("こない")).toContain("くる");
  });

  it("handles i-adjective inflections", () => {
    expect(bases("高かった")).toContain("高い"); // past
    expect(bases("高くない")).toContain("高い"); // negative
    expect(bases("高くて")).toContain("高い"); // -te
    expect(bases("高ければ")).toContain("高い"); // provisional
    expect(bases("高く")).toContain("高い"); // adverb
  });

  it("chains multiple inflection layers", () => {
    // polite + passive + causative
    expect(bases("食べさせられました")).toContain("食べる");
    // progressive + polite
    expect(bases("食べています")).toContain("食べる");
    // progressive past
    expect(bases("食べていた")).toContain("食べる");
    // negative past (adjective-like ない)
    expect(bases("食べなかった")).toContain("食べる");
  });

  it("records the inflection reason chain (surface-first)", () => {
    expect(reasonsFor("食べた", "食べる")).toEqual(["past"]);
    expect(reasonsFor("食べない", "食べる")).toEqual(["negative"]);
    // 3-layer chain: polite (outermost) → られる → causative (innermost).
    // られる is potential/passive-ambiguous for ichidan verbs; we don't assert
    // which label the middle layer gets, only the shape of the chain.
    const chain = reasonsFor("食べさせられました", "食べる");
    expect(chain?.[0]).toBe("polite");
    expect(chain).toContain("causative");
    expect(chain).toHaveLength(3);
  });

  it("always includes the identity (exact match) first", () => {
    const d = deinflect("猫");
    expect(d[0]).toEqual({ term: "猫", reasons: [], rules: 0 });
  });
});

describe("word-type rule filtering", () => {
  it("parses Yomitan rule strings into flags", () => {
    expect(parseEntryRules("v1")).toBe(RULE.v1);
    expect(parseEntryRules("v5k vt") & RULE.v5).toBe(RULE.v5);
    expect(parseEntryRules("adj-i") & RULE.adji).toBe(RULE.adji);
    expect(parseEntryRules("vs-i") & RULE.vs).toBe(RULE.vs);
    expect(parseEntryRules(undefined)).toBe(0);
  });

  it("matches a candidate against an entry's word type (lenient on unknowns)", () => {
    const d = deinflect("食べた").find((x) => x.term === "食べる")!;
    expect(rulesMatchEntry(d.rules, "v1")).toBe(true); // ichidan ✓
    expect(rulesMatchEntry(d.rules, "v5k")).toBe(false); // not a godan verb
    expect(rulesMatchEntry(d.rules, undefined)).toBe(true); // unknown → allow
    expect(rulesMatchEntry(0, "v5k")).toBe(true); // identity → always
  });
});

describe("English deinflection", () => {
  const ebases = (x: string) => deinflectEnglish(x).map((d) => d.term);
  it("strips plurals, past tense and -ing", () => {
    expect(ebases("cats")).toContain("cat");
    expect(ebases("studies")).toContain("study");
    expect(ebases("liked")).toContain("like");
    expect(ebases("making")).toContain("make");
    expect(ebases("running")).toContain("run"); // doubled consonant
    expect(ebases("stopped")).toContain("stop");
    expect(ebases("faster")).toContain("fast");
  });
  it("lower-cases and keeps the identity", () => {
    expect(deinflectEnglish("Cats")[0].term).toBe("cats");
  });
});
