import "fake-indexeddb/auto";
import { describe, it, expect, beforeAll } from "vitest";
import JSZip from "jszip";
import {
  importYomitanZip,
  findTerms,
  listLocalDictionaries,
  deleteLocalDictionary,
} from "@/features/dictionary/data/yomitan";
import { ipaPronunciations, TermMetaEntry } from "@/shared/term-meta";

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
