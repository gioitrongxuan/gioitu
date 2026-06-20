import "fake-indexeddb/auto";
import { describe, it, expect, beforeAll } from "vitest";
import JSZip from "jszip";
import {
  importYomitanZip,
  lookupTerm,
  findTerms,
  suggestTerms,
} from "@/features/dictionary/data/yomitan";
import { glossaryToLines } from "@/shared/structured-content";

// 辛い is a classic homograph: からい "spicy" vs つらい "painful". Both are
// i-adjectives. A third row repeats からい to prove same-reading rows still
// merge into one entry's senses.
async function makeHomographZip(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file(
    "index.json",
    JSON.stringify({ title: "Homographs", sourceLanguage: "ja", targetLanguage: "vi" }),
  );
  zip.file(
    "term_bank_1.json",
    JSON.stringify([
      ["辛い", "からい", "adj-i", "adj-i", 10, ["cay"], 1, ""],
      ["辛い", "つらい", "adj-i", "adj-i", 5, ["đau khổ", "vất vả"], 2, ""],
      ["辛い", "からい", "adj-i", "adj-i", 0, ["mặn (phương ngữ)"], 3, ""],
    ]),
  );
  return zip.generateAsync({ type: "arraybuffer" });
}

describe("homographs: same term, different readings", () => {
  beforeAll(async () => {
    await importYomitanZip(await makeHomographZip(), { term_lang: "ja", native_lang: "vi" });
  });

  it("keeps one entry per distinct reading instead of overwriting", async () => {
    const results = await findTerms("辛い", "ja", "vi");
    expect(results.map((r) => r.entry.reading).sort()).toEqual(["からい", "つらい"]);
  });

  it("merges rows that share a reading into that reading's senses", async () => {
    const results = await findTerms("辛い", "ja", "vi");
    const karai = results.find((r) => r.entry.reading === "からい")!;
    const tsurai = results.find((r) => r.entry.reading === "つらい")!;
    expect(glossaryToLines(karai.entry.definitions)).toEqual(["cay", "mặn (phương ngữ)"]);
    expect(glossaryToLines(tsurai.entry.definitions)).toEqual(["đau khổ", "vất vả"]);
  });

  it("lookupTerm returns the highest-scoring reading", async () => {
    const e = await lookupTerm("辛い", "ja", "vi");
    expect(e?.reading).toBe("からい"); // score 10 beats つらい's 5
  });

  it("suggests each reading of a homograph separately", async () => {
    const s = await suggestTerms("辛", "ja", "vi");
    expect(s.map((x) => x.reading).sort()).toEqual(["からい", "つらい"]);
  });
});
