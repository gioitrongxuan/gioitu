import { describe, it, expect } from "vitest";
import { assembleEntry, groupByWordId, WordRow, EntryRow } from "@server/features/dictionary/assemble";

const word: WordRow = {
  id: "1",
  term_lang: "ja",
  native_lang: "vi",
  headings: [{ base: "緊急避難", reading: "きんきゅうひなん", hanViet: "KHẨN CẤP TỊ NAN" }],
  pitch: [{ kana: "きんきゅうひなん", accent: "LHHHHLL-L", moras: ["き", "ん"] }],
  freq_rank: 100,
  jlpt: 1,
  score: 5,
  verified: true,
};

describe("assembleEntry — ráp DictionaryEntry từ các dòng DB", () => {
  it("gộp senses từ nhiều nguồn, đính pitch/ảnh/bình luận", () => {
    const entries: EntryRow[] = [
      { word_id: "1", dict_id: "mazii", score: 0, senses: [{ pos: ["n"], gloss: ["sự sơ tán khẩn cấp"], dictionary: "Mazii" }] },
      { word_id: "1", dict_id: "jmdict", score: 0, senses: [{ pos: ["n"], gloss: [{ text: "emergency evacuation", type: "lit" }], dictionary: "JMdict" }] },
    ];
    const e = assembleEntry(word, entries, [{ word_id: "1", url: "http://x/a.png", source: "mazii" }], [
      { word_id: "1", mean: "hành động tự vệ", likes: 2, dislikes: 0, author: "Loc", avatar: null, source: "mazii", created_at: "1700000000000" },
    ]);

    expect(e.headings[0].hanViet).toBe("KHẨN CẤP TỊ NAN");
    expect(e.senses).toHaveLength(2);
    expect(e.senses[0].dictionary).toBe("Mazii");
    expect(e.pitch?.[0].accent).toBe("LHHHHLL-L");
    expect(e.images).toEqual([{ url: "http://x/a.png", source: "mazii" }]);
    expect(e.comments?.[0]).toMatchObject({ mean: "hành động tự vệ", likes: 2, createdAt: 1700000000000 });
    expect(e.score).toBe(5);
    expect(e.word_id).toBe("1");
    expect(e.verified).toBe(true);
  });

  it("không có ảnh/bình luận → bỏ trường (undefined)", () => {
    const e = assembleEntry(word, [{ word_id: "1", dict_id: null, score: 0, senses: [{ pos: [], gloss: ["x"] }] }]);
    expect(e.images).toBeUndefined();
    expect(e.comments).toBeUndefined();
  });

  it("groupByWordId nhóm đúng và giữ thứ tự", () => {
    const g = groupByWordId([
      { word_id: "2", url: "b" },
      { word_id: "1", url: "a" },
      { word_id: "2", url: "c" },
    ]);
    expect([...g.keys()]).toEqual(["2", "1"]);
    expect(g.get("2")).toHaveLength(2);
  });
});
