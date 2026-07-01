import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { parseYomitanZip, flattenGloss } from "@server/features/dictionary/yomitan";

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

// A wty-ja-vi entry: etymology + glosses list + attribution backlink.
const wtyEntry = (senses: string[]) => ({
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
            { tag: "summary", content: "Nguồn gốc từ" },
            { tag: "div", data: { content: "Etymology-content" }, content: "/kupu/ → /kuu/" },
          ],
        },
      ],
    },
    { tag: "ol", data: { content: "glosses" }, content: senses.map((s) => ({ tag: "li", content: [{ tag: "div", content: [s] }] })) },
    { tag: "div", data: { content: "backlink" }, content: [{ tag: "a", href: "https://kaikki.org/", content: "Kaikki" }] },
  ],
});

describe("flattenGloss", () => {
  it("flattens plain strings, arrays and structured content", () => {
    expect(flattenGloss("hello")).toBe("hello");
    expect(flattenGloss(structured("con mèo")).trim()).toBe("con mèo");
  });

  it("extracts only the glosses from a Wiktionary (wty) entry", () => {
    // Not "Nguồn gốc từ /kupu/ → /kuu/ Ăn. Kaikki" — just the definition.
    expect(flattenGloss(wtyEntry(["Ăn."]))).toBe("Ăn.");
  });
});

describe("parseYomitanZip — Wiktionary (wty) entries", () => {
  it("splits a glosses list into one definition per sense, dropping scaffolding", async () => {
    const zip = await makeZip({
      index: { title: "wty-ja-vi", sourceLanguage: "ja", targetLanguage: "vi" },
      banks: {
        "term_bank_1.json": [["変態", "", "n", "", 0, [wtyEntry(["Sự biến thái.", "Sự bất thường."])], 0, ""]],
      },
    });
    const parsed = await parseYomitanZip(zip);
    expect(parsed.entries).toHaveLength(1);
    const e = parsed.entries[0];
    expect(e.term).toBe("変態");
    expect(e.definitions).toEqual(["Sự biến thái.", "Sự bất thường."]);
    expect(e.senses).toHaveLength(1);
    expect(e.senses[0].tags).toEqual(["n"]);
    expect(e.senses[0].glossary.length).toBeGreaterThan(0); // structured content GIỮ nguyên
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
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]).toMatchObject({ term: "猫", reading: "ねこ", definitions: ["con mèo"] });
    expect(parsed.entries[0].senses[0].tags).toEqual(["n"]);
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
    expect(parsed.entries[0]).toMatchObject({
      term: "道",
      reading: "みち",
      definitions: ["đường", "đạo lý"],
    });
    // Hai dòng (hai bank) gộp vào một entry; reading rỗng fold vào みち.
    expect(parsed.entries[0].senses).toHaveLength(2);
  });

  it("tách từ đồng âm: cùng term, reading khác nhau → entry riêng", async () => {
    const zip = await makeZip({
      index: { sourceLanguage: "ja", targetLanguage: "vi" },
      banks: {
        "term_bank_1.json": [
          ["辛い", "からい", "adj-i", "", 0, ["cay"], 0, ""],
          ["辛い", "つらい", "adj-i", "", 0, ["khổ"], 0, ""],
        ],
      },
    });
    const parsed = await parseYomitanZip(zip);
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries.map((e) => e.reading)).toEqual(["からい", "つらい"]);
  });

  it("bỏ qua file AppleDouble ._term_bank_*.json (rác từ tar macOS)", async () => {
    const zip = await makeZip({
      index: { sourceLanguage: "ja", targetLanguage: "en" },
      banks: {
        "term_bank_1.json": [["猫", "ねこ", "n", "", 0, ["cat"], 0, ""]],
        // Regex không neo đầu sẽ bắt nhầm file này (thực tế nó là rác nhị phân → crash).
        "._term_bank_1.json": [["KHÔNG_ĐƯỢC_LẤY", "", "n", "", 0, ["nope"], 0, ""]],
      },
    });
    const parsed = await parseYomitanZip(zip);
    expect(parsed.entries.map((e) => e.term)).toEqual(["猫"]);
  });

  it("bắt score Yomitan (row[4]) — MAX qua các dòng gộp; kèm revision", async () => {
    const zip = await makeZip({
      index: { title: "JMdict", revision: "JMdict.2026-06-24", sourceLanguage: "ja", targetLanguage: "en" },
      banks: {
        "term_bank_1.json": [["語", "ご", "", "", 3, ["word"], 0, ""]],
        "term_bank_2.json": [["語", "", "", "", 9, ["term"], 0, ""]],
      },
    });
    const parsed = await parseYomitanZip(zip);
    expect(parsed.revision).toBe("JMdict.2026-06-24");
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].score).toBe(9); // max(3, 9)
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
