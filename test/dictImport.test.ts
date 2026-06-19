import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { parseYomitanZip, flattenGloss } from "../server/src/yomitan";

// Build an in-memory Yomitan-style .zip for the parser to consume.
async function makeZip(opts: {
  index?: object;
  banks: Record<string, unknown[][]>;
}): Promise<Uint8Array> {
  const zip = new JSZip();
  if (opts.index) zip.file("index.json", JSON.stringify(opts.index));
  for (const [name, bank] of Object.entries(opts.banks)) {
    zip.file(name, JSON.stringify(bank));
  }
  return zip.generateAsync({ type: "uint8array" });
}

const structured = (text: string) => ({
  type: "structured-content",
  content: [{ tag: "ol", content: [{ tag: "li", content: [{ tag: "div", content: [text] }] }] }],
});

describe("flattenGloss", () => {
  it("flattens plain strings, arrays and structured content", () => {
    expect(flattenGloss("hello")).toBe("hello");
    expect(flattenGloss(structured("con mèo")).trim()).toBe("con mèo");
  });
});

describe("parseYomitanZip", () => {
  it("reads the language pair from index.json and extracts glosses", async () => {
    const zip = await makeZip({
      index: { title: "wty-ja-vi", sourceLanguage: "ja", targetLanguage: "vi" },
      banks: {
        "term_bank_1.json": [
          ["猫", "ねこ", "n", "", 0, [structured("con mèo")], 0, ""],
        ],
      },
    });
    const parsed = await parseYomitanZip(zip);
    expect(parsed.title).toBe("wty-ja-vi");
    expect(parsed.term_lang).toBe("ja");
    expect(parsed.native_lang).toBe("vi");
    expect(parsed.entries).toEqual([
      { term: "猫", reading: "ねこ", definitions: ["con mèo"] },
    ]);
  });

  it("honors an explicit pair override over index.json", async () => {
    const zip = await makeZip({
      index: { sourceLanguage: "ja", targetLanguage: "vi" },
      banks: { "term_bank_1.json": [["x", "", "", "", 0, ["y"], 0, ""]] },
    });
    const parsed = await parseYomitanZip(zip, { term_lang: "en", native_lang: "vi" });
    expect(parsed.term_lang).toBe("en");
    expect(parsed.native_lang).toBe("vi");
  });

  it("merges duplicate terms across banks and dedupes glosses", async () => {
    const zip = await makeZip({
      index: { sourceLanguage: "ja", targetLanguage: "vi" },
      banks: {
        "term_bank_1.json": [["道", "みち", "", "", 0, ["đường"], 0, ""]],
        "term_bank_2.json": [
          ["道", "", "", "", 0, ["đường", "đạo lý"], 0, ""],
        ],
      },
    });
    const parsed = await parseYomitanZip(zip);
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]).toEqual({
      term: "道",
      reading: "みち",
      definitions: ["đường", "đạo lý"],
    });
  });

  it("skips entries with no term or no usable gloss", async () => {
    const zip = await makeZip({
      index: { sourceLanguage: "ja", targetLanguage: "vi" },
      banks: {
        "term_bank_1.json": [
          ["", "", "", "", 0, ["orphan gloss"], 0, ""],
          ["empty", "", "", "", 0, [], 0, ""],
          ["good", "", "", "", 0, ["ok"], 0, ""],
        ],
      },
    });
    const parsed = await parseYomitanZip(zip);
    expect(parsed.entries.map((e) => e.term)).toEqual(["good"]);
  });
});
