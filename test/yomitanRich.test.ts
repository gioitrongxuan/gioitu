import "fake-indexeddb/auto";
import { describe, it, expect, beforeAll, vi, afterEach } from "vitest";
import JSZip from "jszip";
import {
  importYomitanZip,
  importYomitanUrl,
  lookupTerm,
  findTerms,
  listLocalDictionaries,
  deleteLocalDictionary,
  hasLocalDictionary,
} from "@/features/dictionary/data/yomitan";
import { glossaryToLines, isStructured } from "@/shared/structured-content";

const sc = (text: string) => ({
  type: "structured-content" as const,
  content: [{ tag: "div", content: [text] }],
});

// A Yomitan ja→vi archive with structured content, tags, rules and a term that
// appears in two banks (so its senses must be merged).
async function makeRichZip(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file("index.json", JSON.stringify({ title: "JA Test", revision: "v1", sourceLanguage: "ja", targetLanguage: "vi" }));
  zip.file("tag_bank_1.json", JSON.stringify([["v1", "pos", 0, "ngoại động từ nhóm 1", 0]]));
  zip.file(
    "term_bank_1.json",
    JSON.stringify([
      ["食べる", "たべる", "v1 vt", "v1", 8, [sc("ăn")], 1, "⭐"],
      ["飲む", "のむ", "v5m vt", "v5m", 5, ["uống"], 2, ""],
    ]),
  );
  zip.file("term_bank_2.json", JSON.stringify([["食べる", "", "", "v1", 0, ["xơi (thân mật)"], 3, ""]]));
  return zip.generateAsync({ type: "arraybuffer" });
}

describe("Yomitan-rich client import", () => {
  beforeAll(async () => {
    const buf = await makeRichZip();
    await importYomitanZip(buf, { term_lang: "ja", native_lang: "vi" });
  });

  it("registers the imported dictionary", async () => {
    const dicts = await listLocalDictionaries("ja", "vi");
    expect(dicts).toHaveLength(1);
    expect(dicts[0].title).toBe("JA Test");
    expect(dicts[0].revision).toBe("v1");
    expect(dicts[0].termCount).toBe(2); // 食べる (merged) + 飲む
  });

  it("preserves structured content, tags and word-type rules", async () => {
    const e = await lookupTerm("食べる", "ja", "vi");
    expect(e?.reading).toBe("たべる");
    expect(e?.rules).toBe("v1");
    expect(e?.termTags).toContain("⭐");
    // structured content is kept (not flattened) …
    expect(e?.definitions.some(isStructured)).toBe(true);
    // … but still flattens to readable text.
    expect(glossaryToLines(e?.definitions)).toEqual(["ăn", "xơi (thân mật)"]);
  });

  it("merges multiple banks into grouped senses", async () => {
    const e = await lookupTerm("食べる", "ja", "vi");
    expect(e?.senses).toHaveLength(2);
    expect(e?.senses?.[0].tags).toEqual(["v1", "vt"]);
    expect(e?.senses?.[0].dictionary).toBe("JA Test");
  });

  it("finds inflected words via deinflection, with reasons", async () => {
    const r1 = await findTerms("食べた", "ja", "vi");
    expect(r1.map((r) => r.entry.term)).toEqual(["食べる"]);
    expect(r1[0].reasons).toEqual(["past"]);
    expect(r1[0].source).toBe("食べた");

    const r2 = await findTerms("飲まない", "ja", "vi");
    expect(r2[0].entry.term).toBe("飲む");
    expect(r2[0].reasons).toEqual(["negative"]);

    // exact match → no reasons
    const r3 = await findTerms("食べる", "ja", "vi");
    expect(r3[0].reasons).toEqual([]);

    // not in the dictionary → nothing
    expect(await findTerms("存在しない語", "ja", "vi")).toEqual([]);
  });

  it("filters deinflections by word type", async () => {
    // 食べた deinflects to the ichidan 食べる only; it must not surface 飲む etc.
    const r = await findTerms("食べた", "ja", "vi");
    expect(r).toHaveLength(1);
  });

  it("can delete an installed dictionary and its terms", async () => {
    const dicts = await listLocalDictionaries("ja", "vi");
    await deleteLocalDictionary(dicts[0].id);
    expect(await hasLocalDictionary("ja", "vi")).toBe(false);
    expect(await lookupTerm("食べる", "ja", "vi")).toBeUndefined();
    expect(await listLocalDictionaries("ja", "vi")).toEqual([]);
  });
});

describe("import from URL", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("downloads the archive then imports it", async () => {
    const buf = await makeRichZip();
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => buf,
    }));

    const res = await importYomitanUrl("https://example.com/ja.zip", { term_lang: "ja", native_lang: "vi" });
    expect(res.termCount).toBe(2);
    expect(await lookupTerm("飲む", "ja", "vi")).toBeDefined();
  });

  it("reports a clear error on HTTP failure", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 404 }));
    await expect(importYomitanUrl("https://example.com/missing.zip")).rejects.toThrow(/404/);
  });
});
