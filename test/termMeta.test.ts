import "fake-indexeddb/auto";
import { describe, it, expect, beforeAll } from "vitest";
import JSZip from "jszip";
import {
  importYomitanZip,
  findTerms,
  listLocalDictionaries,
  deleteLocalDictionary,
} from "@/features/dictionary/data/yomitan";
import { frequencyRanks, ipaPronunciations, TermMetaEntry } from "@/shared/term-meta";

const sc = (text: string) => ({
  type: "structured-content" as const,
  content: [{ tag: "div", content: [text] }],
});

// A gloss dictionary (term_bank) and a separate IPA dictionary (term_meta_bank)
// for the same pair — exactly the wty-ja-vi + wty-ja-vi-ipa split.
async function makeGlossZip(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file("index.json", JSON.stringify({ title: "JA Gloss", sourceLanguage: "ja", targetLanguage: "vi" }));
  zip.file("term_bank_1.json", JSON.stringify([["字典", "", "n", "", 0, [sc("từ điển chữ Hán")], 0, ""]]));
  return zip.generateAsync({ type: "arraybuffer" });
}

async function makeIpaZip(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file("index.json", JSON.stringify({ title: "JA IPA", sourceLanguage: "ja", targetLanguage: "vi" }));
  zip.file(
    "term_meta_bank_1.json",
    JSON.stringify([
      ["字典", "ipa", { reading: "字典", transcriptions: [{ ipa: "[d͡ʑitẽ̞ɴ]" }, { ipa: "[mo̞ʑitẽ̞ɴ]" }] }],
    ]),
  );
  return zip.generateAsync({ type: "arraybuffer" });
}

describe("ipaPronunciations (pure)", () => {
  const rows: TermMetaEntry[] = [
    { term: "x", reading: "x", mode: "ipa", data: { reading: "x", transcriptions: [{ ipa: "/a/" }] }, term_lang: "vi", native_lang: "en", dictionary: "D" },
    { term: "x", reading: "x", mode: "freq", data: { value: 3 }, term_lang: "vi", native_lang: "en" },
  ];

  it("keeps only IPA rows with usable transcriptions", () => {
    const out = ipaPronunciations(rows);
    expect(out).toEqual([{ dictionary: "D", transcriptions: [{ ipa: "/a/" }] }]);
  });

  it("falls back to every IPA row when no reading matches", () => {
    expect(ipaPronunciations(rows, "no-such-reading")).toHaveLength(1);
  });

  it("returns nothing when there is no IPA", () => {
    expect(ipaPronunciations(rows.filter((r) => r.mode === "freq"))).toEqual([]);
  });
});

describe("frequencyRanks (pure)", () => {
  const row = (data: unknown, reading = "", dictionary = "F"): TermMetaEntry => ({
    term: "猫", reading, mode: "freq", data, term_lang: "ja", native_lang: "vi", dictionary,
  });

  it("parses bare numbers, {value, displayValue} and reading-scoped wrappers", () => {
    expect(frequencyRanks([row(42)])).toEqual([{ dictionary: "F", display: "42", value: 42 }]);
    expect(frequencyRanks([row({ value: 300, displayValue: "300+" })])).toEqual([
      { dictionary: "F", display: "300+", value: 300 },
    ]);
    expect(frequencyRanks([row({ reading: "ねこ", frequency: 7 }, "ねこ")], "ねこ")).toEqual([
      { dictionary: "F", display: "7", value: 7 },
    ]);
  });

  it("keeps one chip per dictionary — the best (smallest) rank", () => {
    const out = frequencyRanks([row(500), row(100), row(9, "", "G")]);
    expect(out).toEqual([
      { dictionary: "F", display: "100", value: 100 },
      { dictionary: "G", display: "9", value: 9 },
    ]);
  });

  it("scopes reading-specific rows to the entry's reading; '' applies to any", () => {
    const rows = [row(1, "ねこ"), row(2, "びょう", "G"), row(3, "", "H")];
    const out = frequencyRanks(rows, "ねこ");
    expect(out.map((f) => f.dictionary).sort()).toEqual(["F", "H"]);
  });

  it("falls back to every row when none matches the reading (term-as-reading data)", () => {
    expect(frequencyRanks([row(5, "猫")], "ねこ")).toHaveLength(1);
  });

  it("skips rows it cannot parse and non-freq modes", () => {
    const ipa: TermMetaEntry = { term: "猫", reading: "", mode: "ipa", data: {}, term_lang: "ja", native_lang: "vi" };
    expect(frequencyRanks([row({}), ipa])).toEqual([]);
  });
});

describe("term-meta import + look-up attach", () => {
  beforeAll(async () => {
    await importYomitanZip(await makeGlossZip(), { term_lang: "ja", native_lang: "vi" });
    await importYomitanZip(await makeIpaZip(), { term_lang: "ja", native_lang: "vi" });
  });

  it("registers a meta-only dictionary with metaCount and no headwords", async () => {
    const dicts = await listLocalDictionaries("ja", "vi");
    const ipa = dicts.find((d) => d.title === "JA IPA");
    expect(ipa).toBeDefined();
    expect(ipa!.termCount).toBe(0);
    expect(ipa!.metaCount).toBe(1);
  });

  it("attaches IPA pronunciations from the meta dict to a gloss look-up", async () => {
    const [result] = await findTerms("字典", "ja", "vi");
    expect(result.entry.term).toBe("字典");
    expect(result.pronunciations).toBeDefined();
    const ipas = result.pronunciations!.flatMap((p) => p.transcriptions.map((t) => t.ipa));
    expect(ipas).toEqual(["[d͡ʑitẽ̞ɴ]", "[mo̞ʑitẽ̞ɴ]"]);
  });

  it("drops the pronunciations when the meta dict is removed", async () => {
    const dicts = await listLocalDictionaries("ja", "vi");
    const ipa = dicts.find((d) => d.title === "JA IPA")!;
    await deleteLocalDictionary(ipa.id);

    const [result] = await findTerms("字典", "ja", "vi");
    expect(result.entry.term).toBe("字典"); // gloss still found
    expect(result.pronunciations).toBeUndefined(); // but no IPA now
  });
});

describe("frequency meta import + look-up attach", () => {
  async function makeFreqGlossZip(): Promise<ArrayBuffer> {
    const zip = new JSZip();
    zip.file("index.json", JSON.stringify({ title: "JA Gloss 2", sourceLanguage: "ja", targetLanguage: "vi" }));
    zip.file("term_bank_1.json", JSON.stringify([["勉強", "べんきょう", "n", "", 0, [sc("sự học")], 0, ""]]));
    return zip.generateAsync({ type: "arraybuffer" });
  }

  // Hai kiểu dữ liệu freq hay gặp: số trần và {reading, frequency} có displayValue.
  async function makeFreqZip(): Promise<ArrayBuffer> {
    const zip = new JSZip();
    zip.file("index.json", JSON.stringify({ title: "JA Freq", sourceLanguage: "ja", targetLanguage: "vi" }));
    zip.file(
      "term_meta_bank_1.json",
      JSON.stringify([
        ["勉強", "freq", 1234],
        ["勉強", "freq", { reading: "べんきょう", frequency: { value: 999, displayValue: "999+" } }],
      ]),
    );
    return zip.generateAsync({ type: "arraybuffer" });
  }

  beforeAll(async () => {
    await importYomitanZip(await makeFreqGlossZip(), { term_lang: "ja", native_lang: "vi" });
    await importYomitanZip(await makeFreqZip(), { term_lang: "ja", native_lang: "vi" });
  });

  it("registers the freq rows as meta", async () => {
    const dicts = await listLocalDictionaries("ja", "vi");
    const freq = dicts.find((d) => d.title === "JA Freq");
    expect(freq).toBeDefined();
    expect(freq!.termCount).toBe(0);
    expect(freq!.metaCount).toBe(2);
  });

  it("attaches the best rank per dictionary to a gloss look-up", async () => {
    const [result] = await findTerms("勉強", "ja", "vi");
    expect(result.entry.term).toBe("勉強");
    expect(result.frequencies).toEqual([{ dictionary: "JA Freq", display: "999+", value: 999 }]);
  });
});
