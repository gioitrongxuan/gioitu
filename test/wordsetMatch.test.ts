import { describe, it, expect } from "vitest";
import {
  applySieve,
  buildKnownIndex,
  countUncertain,
  kanjiSkeleton,
  matchWord,
  normalizeTerm,
  readingKey,
  visibleCells,
} from "@/features/vocabstudy/domain/wordsetMatch";
import { VocabListWord } from "@/features/vocabstudy/domain/vocablist";
import { VocabEntry } from "@/shared/types";
import { makeEntry } from "./fixtures";

const NOW = 7_000_000;

function ja(over: Partial<VocabEntry>): VocabEntry {
  return makeEntry({ term_lang: "ja", native_lang: "vi", status: "LEARNED", ...over });
}

function word(term: string, reading?: string): VocabListWord {
  return { term, ...(reading ? { reading } : {}), term_lang: "ja", native_lang: "vi" };
}

/** Ghép một từ với một vốn từ nhỏ — trả về [mặt chữ entry khớp, độ tin cậy]. */
function match(w: VocabListWord, entries: VocabEntry[]): [string, string] | undefined {
  const hit = matchWord(w, buildKnownIndex(entries));
  return hit ? [hit.entry.term, hit.kind] : undefined;
}

describe("chuẩn hoá", () => {
  it("normalizeTerm gộp toàn/nửa rộng, bỏ dấu trang trí và hạ chữ thường", () => {
    expect(normalizeTerm("ＡＰＰＬＥ")).toBe("apple");
    expect(normalizeTerm("アイス・クリーム")).toBe("アイスクリーム");
    expect(normalizeTerm(" 食べる ")).toBe("食べる");
  });

  it("readingKey fold katakana về hiragana", () => {
    expect(readingKey("アメリカ")).toBe(readingKey("あめりか"));
  });

  it("kanjiSkeleton bỏ sạch kana", () => {
    expect(kanjiSkeleton("引っ越し")).toBe("引越");
    expect(kanjiSkeleton("たべる")).toBe("");
  });
});

describe("matchWord — bậc chắc chắn", () => {
  it("mặt chữ trùng đúng", () => {
    expect(match(word("食べる"), [ja({ term: "食べる" })])).toEqual(["食べる", "exact"]);
  });

  it("trùng sau chuẩn hoá (toàn rộng / dấu chấm giữa)", () => {
    expect(match(word("アイス・クリーム"), [ja({ term: "アイスクリーム" })])).toEqual([
      "アイスクリーム",
      "exact",
    ]);
  });

  it("không khớp gì thì trả undefined", () => {
    expect(match(word("憂鬱"), [ja({ term: "食べる" })])).toBeUndefined();
  });
});

describe("matchWord — bậc ngờ", () => {
  it("bộ ghi kanji, người dùng thuộc dạng kana → ngờ", () => {
    expect(match(word("林檎", "りんご"), [ja({ term: "りんご" })])).toEqual(["りんご", "loose"]);
  });

  it("bộ ghi kana, entry có cách đọc ấy → ngờ", () => {
    expect(match(word("たべる"), [ja({ term: "食べる", reading: "たべる" })])).toEqual([
      "食べる",
      "loose",
    ]);
  });

  it("khác okurigana (≥2 kanji) → ngờ", () => {
    expect(match(word("引越し"), [ja({ term: "引っ越し" })])).toEqual(["引っ越し", "loose"]);
  });

  it("KHÔNG ghép theo khung 1 kanji — 見せる không phải 見る", () => {
    expect(match(word("見せる"), [ja({ term: "見る" })])).toBeUndefined();
  });

  it("bộ còn ở dạng chia → ngờ", () => {
    expect(match(word("食べた"), [ja({ term: "食べる" })])).toEqual(["食べる", "loose"]);
  });

  it("cùng mặt chữ nhưng khai cách đọc khác nhau → hạ xuống ngờ (đồng âm dị nghĩa)", () => {
    expect(match(word("辛い", "からい"), [ja({ term: "辛い", reading: "つらい" })])).toEqual([
      "辛い",
      "loose",
    ]);
  });

  it("cùng mặt chữ, cùng cách đọc → vẫn chắc", () => {
    expect(match(word("辛い", "からい"), [ja({ term: "辛い", reading: "からい" })])).toEqual([
      "辛い",
      "exact",
    ]);
  });
});

describe("matchWord — biên", () => {
  it("entry đã xoá (tombstone) không tính là đã biết", () => {
    expect(match(word("食べる"), [ja({ term: "食べる", deleted_at: NOW })])).toBeUndefined();
  });

  it("không lẫn sang ngôn ngữ khác", () => {
    const en = makeEntry({ term: "cook", term_lang: "en", native_lang: "vi", status: "LEARNED" });
    expect(match(word("cook"), [en])).toBeUndefined();
  });
});

describe("applySieve", () => {
  const entries = [
    ja({ term: "食べる", status: "LEARNED" }),
    ja({ term: "引っ越し", status: "LEARNED" }),
    ja({ term: "読む", status: "LEARNING", card_state: "REVIEW", next_review: NOW - 1 }),
  ];
  const words = [word("食べる"), word("引越し"), word("読む"), word("憂鬱"), word("食べる")];

  it("phân trạng thái học và độ tin cậy cho từng từ, bỏ từ trùng", () => {
    const cells = applySieve(words, entries, NOW);
    expect(cells.map((c) => [c.word.term, c.progress, c.match ?? "-"])).toEqual([
      ["食べる", "learned", "exact"],
      ["引越し", "learned", "loose"],
      ["読む", "due", "exact"],
      ["憂鬱", "missing", "-"],
    ]);
  });

  it("đếm được nhóm cần duyệt", () => {
    expect(countUncertain(applySieve(words, entries, NOW))).toBe(1);
  });

  it("ẩn từ đã thuộc chỉ ẩn phần CHẮC — phần ngờ vẫn hiện để duyệt", () => {
    const cells = applySieve(words, entries, NOW);
    expect(visibleCells(cells, "all", true).map((c) => c.word.term)).toEqual(["引越し", "読む", "憂鬱"]);
  });

  it("bộ lọc uncertain lấy đúng nhóm ngờ", () => {
    const cells = applySieve(words, entries, NOW);
    expect(visibleCells(cells, "uncertain", true).map((c) => c.word.term)).toEqual(["引越し"]);
  });

  it("bộ lọc trạng thái vẫn chạy như lưới thường", () => {
    const cells = applySieve(words, entries, NOW);
    expect(visibleCells(cells, "missing", false).map((c) => c.word.term)).toEqual(["憂鬱"]);
  });
});

describe("khử trùng ô của lưới sàng", () => {
  const w = (term: string, reading?: string): VocabListWord => ({
    term,
    ...(reading ? { reading } : {}),
    term_lang: "ja",
    native_lang: "vi",
  });

  it("giữ RIÊNG hai từ đồng tự khác cách đọc", () => {
    // 分別 ぶんべつ ("phân loại") và ふんべつ ("suy xét") là hai từ khác hẳn nhau.
    // Gộp theo mặt chữ là lặng lẽ nuốt mất một từ — bộ JLPT N1 có 5 cặp như vậy
    // và trước đây chúng chỉ hiện 5 ô thay vì 10.
    const cells = applySieve([w("分別", "ぶんべつ"), w("分別", "ふんべつ")], [], 0);
    expect(cells.map((c) => c.word.reading)).toEqual(["ぶんべつ", "ふんべつ"]);
  });

  it("vẫn bỏ dòng trùng hoàn toàn", () => {
    expect(applySieve([w("犬", "いぬ"), w("犬", "いぬ")], [], 0)).toHaveLength(1);
  });

  it("dòng không có cách đọc trùng nhau cũng chỉ giữ một", () => {
    expect(applySieve([w("犬"), w("犬")], [], 0)).toHaveLength(1);
  });
});
