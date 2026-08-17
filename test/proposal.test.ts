// Dựng payload đề xuất từ điển (#70 — 6.1) từ hai nguồn: một mục từ điển và một
// từ trong kho của người dùng (thêm nhanh / Yomitan / tự định nghĩa).

import { describe, it, expect } from "vitest";
import {
  proposalFromDictEntry,
  proposalFromVocabEntry,
} from "@/features/contribute/domain/proposal";
import { DictEntry } from "@/shared/db";
import { makeEntry } from "./fixtures";

function dictEntry(over: Partial<DictEntry> = {}): DictEntry {
  return { term: "猫", definitions: [], term_lang: "ja", native_lang: "vi", ...over };
}

describe("proposalFromDictEntry", () => {
  it("lấy nghĩa theo sense và khử trùng từ loại", () => {
    const payload = proposalFromDictEntry(
      dictEntry({
        reading: "ねこ",
        senses: [
          { tags: ["n"], glossary: ["con mèo"] },
          { tags: ["n"], glossary: ["mèo nhà"] },
        ],
      }),
    );
    expect(payload).toEqual({
      term: "猫",
      reading: "ねこ",
      term_lang: "ja",
      native_lang: "vi",
      gloss: ["con mèo", "mèo nhà"],
      pos: ["n"],
    });
  });

  it("không có sense thì rơi về definitions phẳng", () => {
    const payload = proposalFromDictEntry(dictEntry({ definitions: ["con mèo"] }));
    expect(payload.gloss).toEqual(["con mèo"]);
    expect(payload.pos).toEqual([]);
  });
});

describe("proposalFromVocabEntry", () => {
  it("lấy ghi chú đã lưu làm nghĩa và tách từ loại thành danh sách", () => {
    const payload = proposalFromVocabEntry(
      makeEntry({
        term: "勉強",
        term_lang: "ja",
        reading: "べんきょう",
        meaning: JSON.stringify(["học tập", "sự học"]),
        pos: "noun, suru verb",
      }),
    );
    expect(payload).toEqual({
      term: "勉強",
      reading: "べんきょう",
      term_lang: "ja",
      native_lang: "vi",
      gloss: ["học tập", "sự học"],
      pos: ["noun", "suru verb"],
    });
  });

  it("nghĩa lưu dạng văn bản thuần vẫn thành một dòng gloss", () => {
    const payload = proposalFromVocabEntry(makeEntry({ meaning: "nghĩa tự gõ" }));
    expect(payload.gloss).toEqual(["nghĩa tự gõ"]);
  });

  it("không có từ loại thì trả danh sách rỗng (không phải [\"\"])", () => {
    const payload = proposalFromVocabEntry(makeEntry({ pos: undefined }));
    expect(payload.pos).toEqual([]);
  });
});
