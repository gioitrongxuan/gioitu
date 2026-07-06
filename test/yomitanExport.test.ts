import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import {
  buildYomitanFiles,
  entryToRows,
  extractExtras,
} from "@/features/dictionary/domain/yomitanExport";
import { DictEntry, LocalDictionary } from "@/shared/db";
import { createLocalDictionary, upsertCustomEntries } from "@/features/dictionary/data/customDict";
import { importYomitanZip, lookupTerm } from "@/features/dictionary/data/yomitan";
import { exportDictAsZip } from "@/features/dictionary/data/yomitanZip";
import { emptyDraft, type CustomDraft } from "@/features/dictionary/domain/customEntry";
import { pairById } from "@/shared/languages";

const JA_VI = pairById("ja-vi");

function draft(over: Partial<CustomDraft>): CustomDraft {
  return { ...emptyDraft(), ...over };
}

const registry: LocalDictionary = {
  id: "d1", title: "Sổ tay", term_lang: "ja", native_lang: "vi",
  termCount: 0, importedAt: 0, custom: true,
};

describe("yomitanExport (thuần)", () => {
  it("một entry một sense → một dòng term-bank đúng tuple", () => {
    const entry: DictEntry = {
      term: "猫", reading: "ねこ", definitions: ["con mèo"],
      senses: [{ tags: ["n"], glossary: ["con mèo"] }],
      term_lang: "ja", native_lang: "vi",
    };
    expect(entryToRows(entry, 1)).toEqual([["猫", "ねこ", "n", "", 0, ["con mèo"], 1, ""]]);
  });

  it("entry nhiều sense → nhiều dòng cùng sequence, kèm rules/score/termTags", () => {
    const entry: DictEntry = {
      term: "行く", reading: "いく", definitions: [],
      senses: [
        { tags: ["v5k"], glossary: ["đi"] },
        { tags: ["v5k", "vi"], glossary: ["chạy (xe)"] },
      ],
      rules: "v5k", score: 9, termTags: ["⭐", "common"],
      term_lang: "ja", native_lang: "vi",
    };
    const rows = entryToRows(entry, 3);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(["行く", "いく", "v5k", "v5k", 9, ["đi"], 3, "⭐ common"]);
    expect(rows[1][2]).toBe("v5k vi"); // tag join
    expect(rows[1][6]).toBe(3);        // cùng sequence với sense trước
  });

  it("entry cũ chỉ có definitions (không senses) → một dòng, tag rỗng", () => {
    const entry: DictEntry = {
      term: "空", reading: "", definitions: ["bầu trời", "không gian"],
      term_lang: "ja", native_lang: "vi",
    };
    expect(entryToRows(entry, 1)).toEqual([["空", "", "", "", 0, ["bầu trời", "không gian"], 1, ""]]);
  });

  it("bỏ qua sense có glossary rỗng", () => {
    const entry: DictEntry = {
      term: "x", definitions: [],
      senses: [{ tags: ["n"], glossary: [] }, { tags: ["n"], glossary: ["ok"] }],
      term_lang: "ja", native_lang: "vi",
    };
    expect(entryToRows(entry, 1)).toHaveLength(1);
  });

  it("nhúng ví dụ + info vào glossary rồi tách lại được (encode/decode)", () => {
    const entry: DictEntry = {
      term: "行く",
      reading: "いく",
      definitions: [],
      senses: [{ tags: ["v5k"], glossary: ["đi"], examples: [{ ja: "学校に行く", vi: "đi học" }], info: ["ghi chú"] }],
      term_lang: "ja",
      native_lang: "vi",
    };
    const [row] = entryToRows(entry, 1);
    const glossary = row[5];
    expect(glossary).toHaveLength(3); // "đi" + node ví dụ + node info
    const extracted = extractExtras(glossary);
    expect(extracted.glossary).toEqual(["đi"]);
    expect(extracted.examples).toEqual([{ ja: "学校に行く", vi: "đi học" }]);
    expect(extracted.info).toEqual(["ghi chú"]);
  });

  it("buildYomitanFiles: metadata index + sequence chạy từ 1 theo từng entry", () => {
    const entries: DictEntry[] = [
      { term: "a", definitions: ["x"], senses: [{ tags: [], glossary: ["x"] }], term_lang: "ja", native_lang: "vi" },
      { term: "b", definitions: ["y"], senses: [{ tags: [], glossary: ["y"] }], term_lang: "ja", native_lang: "vi" },
    ];
    const { index, termBank } = buildYomitanFiles(registry, entries, "rev-1");
    expect(index).toMatchObject({
      title: "Sổ tay", format: 3, revision: "rev-1",
      sequenced: true, sourceLanguage: "ja", targetLanguage: "vi",
    });
    expect(termBank.map((r) => r[6])).toEqual([1, 2]);
  });
});

describe("exportDictAsZip → importYomitanZip (round-trip qua IndexedDB)", () => {
  it("xuất rồi nhập lại giữ đủ term/reading/tag/nghĩa + ví dụ + giải thích + liên quan", async () => {
    const id = await createLocalDictionary({ title: "Xuất RT", term_lang: "ja", native_lang: "vi" });
    await upsertCustomEntries(id, "Xuất RT", JA_VI, [
      draft({
        term: "空",
        reading: "そら",
        pos: "n",
        gloss: "bầu trời; không gian",
        example: "空を見る :: ngắm trời",
        note: "thơ ca hay dùng",
        related: "宇宙",
      }),
    ]);

    const { blob, filename } = await exportDictAsZip(id);
    expect(filename).toBe("Xuất-RT.zip");

    const buf = await blob.arrayBuffer();
    const res = await importYomitanZip(buf, { term_lang: "ja", native_lang: "vi" });
    expect(res.termCount).toBe(1);

    const sora = await lookupTerm("空", "ja", "vi");
    expect(sora?.reading).toBe("そら");
    // Nghĩa vẫn sạch (không lẫn ví dụ/ghi chú), còn ví dụ + info được khôi phục đúng trường.
    expect(sora?.definitions).toEqual(["bầu trời", "không gian"]);
    expect(sora?.senses?.[0].tags).toEqual(["n"]);
    expect(sora?.senses?.[0].examples).toEqual([{ ja: "空を見る", vi: "ngắm trời" }]);
    expect(sora?.senses?.[0].info).toEqual(["thơ ca hay dùng", "Liên quan/dễ nhầm: 宇宙"]);
  });
});
