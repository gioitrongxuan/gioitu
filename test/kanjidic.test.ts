import { describe, it, expect } from "vitest";
import { mapKanjidicEntry, iterateKanjidic, toStoredReadings, RawKanji } from "@server/features/dictionary/kanjidic";

const raw: RawKanji = {
  literal: ["学"],
  misc: [{ grade: ["1"], stroke_count: ["8"], freq: ["63"], jlpt: ["4"] }],
  reading_meaning: [
    {
      rmgroup: [
        {
          reading: [
            { text: "xue2", attr: { r_type: "pinyin" } },
            { text: "Học", attr: { r_type: "vietnam" } },
            { text: "ガク", attr: { r_type: "ja_on" } },
            { text: "まな.ぶ", attr: { r_type: "ja_kun" } },
          ],
          meaning: ["study", "learning", { text: "étudier", attr: { m_lang: "fr" } }],
        },
      ],
      nanori: ["たか", "のり"],
    },
  ],
};

describe("mapKanjidicEntry — KANJIDIC2 raw → KanjiEntry", () => {
  it("map on/kun/nanori, nghĩa EN, jouyou, JLPT cũ→mới, freq→rankNews", () => {
    const { entry } = mapKanjidicEntry(raw);
    expect(entry.literal).toBe("学");
    expect(entry.strokeCount).toBe(8);
    expect(entry.jouyou).toBe(1);
    expect(entry.jlpt).toBe(5); // KANJIDIC jlpt cũ 4 → mới 5
    expect(entry.rankNews).toBe(63);
    expect(entry.onyomi).toEqual([{ text: "ガク" }]);
    expect(entry.kunyomi).toEqual([{ text: "まな.ぶ" }]);
    expect(entry.nanori).toEqual(["たか", "のり"]);
    expect(entry.meanings).toEqual(["study", "learning"]); // bỏ nghĩa m_lang=fr
    expect(entry.score).toBeGreaterThan(0);
  });

  it("Hán-Việt fallback từ <reading vietnam>, viết hoa", () => {
    expect(mapKanjidicEntry(raw).vietnamReadings).toEqual(["HỌC"]);
  });

  it("grade 8 → jouyou 7; grade ≥9 → jinmeiyou", () => {
    const adv = mapKanjidicEntry({ literal: ["亜"], misc: [{ grade: ["8"], stroke_count: ["7"] }] });
    expect(adv.entry.jouyou).toBe(7);
    expect(adv.entry.jinmeiyou).toBeUndefined();
    const name = mapKanjidicEntry({ literal: ["丑"], misc: [{ grade: ["9"], stroke_count: ["4"] }] });
    expect(name.entry.jinmeiyou).toBe(true);
    expect(name.entry.jouyou).toBeUndefined();
  });

  it("kanji không reading_meaning → on/kun/meanings rỗng, không lỗi", () => {
    const e = mapKanjidicEntry({ literal: ["丂"], misc: [{ stroke_count: ["3"] }] });
    expect(e.entry.onyomi).toEqual([]);
    expect(e.entry.meanings).toEqual([]);
    expect(e.vietnamReadings).toEqual([]);
  });

  it("nét phụ → strokeCounts", () => {
    const e = mapKanjidicEntry({ literal: ["艹"], misc: [{ stroke_count: ["3", "4"] }] });
    expect(e.entry.strokeCount).toBe(3);
    expect(e.entry.strokeCounts).toEqual([4]);
  });

  it("toStoredReadings gói on/kun/nanori", () => {
    const { entry } = mapKanjidicEntry(raw);
    expect(toStoredReadings(entry)).toEqual({
      onyomi: [{ text: "ガク" }],
      kunyomi: [{ text: "まな.ぶ" }],
      nanori: ["たか", "のり"],
    });
  });
});

describe("iterateKanjidic — tách từng <character>", () => {
  it("bỏ header, yield đúng số entry + literal", async () => {
    const xml = `<?xml version="1.0"?>
      <kanjidic2><header><file_version>4</file_version></header>
      <character><literal>一</literal><misc><stroke_count>1</stroke_count></misc></character>
      <character><literal>二</literal><misc><stroke_count>2</stroke_count></misc></character>
      </kanjidic2>`;
    const literals: string[] = [];
    for await (const raw of iterateKanjidic(xml)) literals.push(raw.literal[0]);
    expect(literals).toEqual(["一", "二"]);
  });
});
