import { describe, it, expect } from "vitest";
import { VocabEntry } from "@/shared/types";
import { isOnWordMap, isVisibleOnCloud } from "@/features/review/domain/wordcloud";
import { newWordsetEntry, registerLookup } from "@/features/review/domain/lookup";
import {
  buildWordsetEntry,
  dueEntriesOf,
  isTeachable,
  studyCounts,
  unstartedCells,
} from "@/features/vocabstudy/domain/wordsetSrs";
import { applySieve, SieveCell } from "@/features/vocabstudy/domain/wordsetMatch";
import { makeEntry } from "./fixtures";

const NOW = 5_000_000;
const SET_ID = "bo-n1";

/**
 * Một ô lưới tối thiểu — chỉ những trường phần chọn mẻ thật sự đọc.
 *
 * Ô có entry mặc định là ghép CHẮC: đó là ca thường. Ca ghép *ngờ* phải khai
 * `match: "loose"` một cách rõ ràng, vì nó là ranh giới quyết định của cả phiên.
 */
function cell(
  term: string,
  progress: SieveCell["progress"],
  entry?: VocabEntry,
  match: SieveCell["match"] = entry ? "exact" : undefined,
): SieveCell {
  return {
    word: { term, term_lang: "ja", native_lang: "vi" },
    progress,
    ...(entry ? { entry } : {}),
    ...(match ? { match } : {}),
  } as SieveCell;
}

describe("đếm việc còn lại của một bộ", () => {
  const cells = [
    cell("身内", "missing"),
    cell("肉親", "due", makeEntry({ term: "肉親" })),
    cell("配偶者", "learning", makeEntry({ term: "配偶者" })),
    cell("遺産", "learned", makeEntry({ term: "遺産" })),
    cell("縁", "missing"),
  ];

  it("đếm riêng thẻ đến hạn và từ chưa đưa vào học", () => {
    expect(studyCounts(cells)).toEqual({ due: 1, unstarted: 2 });
  });

  it("từ chỉ ghép NGỜ được kể là chưa biết, để còn đem ra dạy", () => {
    // Ngược lại thì 箸 (ghép ngờ với 橋 đã tra) im lặng biến mất khỏi bộ: không
    // vào hàng đợi, cũng không bao giờ được đưa ra học.
    const ngo = cell("箸", "learned", makeEntry({ term: "橋", term_lang: "ja" }), "loose");
    expect(studyCounts([ngo])).toEqual({ due: 0, unstarted: 1 });
    expect(unstartedCells([ngo], 5).map((c) => c.word.term)).toEqual(["箸"]);
  });

  it("từ đang học nhưng chưa đến hạn không tính vào đâu cả", () => {
    // Nó không cần ôn bây giờ, mà cũng không phải "chưa bắt đầu" — đếm vào bên
    // nào cũng là nói dối người dùng về việc còn phải làm.
    expect(studyCounts([cell("配偶者", "learning", makeEntry({ term: "配偶者" }))])).toEqual({
      due: 0,
      unstarted: 0,
    });
  });
});

describe("chọn từ mới cho một phiên", () => {
  const cells = [
    cell("một", "learned", makeEntry({ term: "một" })),
    cell("hai", "missing"),
    cell("ba", "due", makeEntry({ term: "ba" })),
    cell("bốn", "missing"),
    cell("năm", "missing"),
  ];

  it("lấy đúng số lượng, theo thứ tự trong bộ", () => {
    // Thứ tự bộ = thứ tự bài của giáo trình. Xáo trộn là mất một nửa giá trị của
    // một bộ dạy theo chủ đề.
    expect(unstartedCells(cells, 2).map((c) => c.word.term)).toEqual(["hai", "bốn"]);
  });

  it("chỉ lấy từ chưa có thẻ", () => {
    expect(unstartedCells(cells, 10).map((c) => c.word.term)).toEqual(["hai", "bốn", "năm"]);
  });

  it("xin 0 hoặc số âm thì không lấy gì", () => {
    expect(unstartedCells(cells, 0)).toEqual([]);
    expect(unstartedCells(cells, -5)).toEqual([]);
  });

  it("gom đúng thẻ đến hạn của bộ", () => {
    expect(dueEntriesOf(cells).map((e) => e.term)).toEqual(["ba"]);
  });

  it("thẻ đến hạn gồm cả thẻ vốn sinh ra từ tra cứu", () => {
    // Nó cũng là từ của bộ này; đến hạn thì ôn, không phân biệt xuất xứ.
    const tuTraCuu = makeEntry({ term: "ba" });
    expect(tuTraCuu.from_wordset).toBeUndefined();
    expect(dueEntriesOf([cell("ba", "due", tuTraCuu)])).toHaveLength(1);
  });
});

describe("dựng thẻ từ một dòng bộ từ", () => {
  const row = {
    setId: SET_ID,
    term: "身内",
    reading: "みうち",
    gloss: "Bà con",
    example: "身内に医者がいる。 :: Trong họ có bác sĩ.",
  };

  it("chép nghĩa, cách đọc và ví dụ sang thẻ", () => {
    // Chép chứ không tham chiếu: bộ từ chỉ nằm trên máy này, còn thẻ thì đi khắp
    // các thiết bị. Không chép thì mở trên điện thoại là một thẻ trống rỗng.
    const entry = buildWordsetEntry(cell("身内", "missing"), row, SET_ID, "u1", "vi", NOW);
    expect(entry).toMatchObject({
      term: "身内",
      meaning: "Bà con",
      example: "身内に医者がいる。 :: Trong họ có bác sĩ.",
      from_wordset: SET_ID,
    });
  });

  it("không đếm khống một lượt tra chưa từng xảy ra", () => {
    const entry = buildWordsetEntry(cell("身内", "missing"), row, SET_ID, "u1", "vi", NOW);
    expect(entry.lookup_count).toBe(0);
  });

  it("thẻ vào thẳng hàng đợi, đến hạn ngay", () => {
    const entry = buildWordsetEntry(cell("身内", "missing"), row, SET_ID, "u1", "vi", NOW);
    expect(entry.card_state).toBe("NEW");
    expect(entry.next_review).toBe(NOW);
  });

  it("dòng không có nghĩa lẫn ví dụ thì không dạy được", () => {
    // Mặt sau trống trơn: lật ra không có gì để đối chiếu.
    expect(isTeachable({ setId: SET_ID, term: "犬", reading: "" })).toBe(false);
    expect(isTeachable(undefined)).toBe(false);
    expect(isTeachable({ setId: SET_ID, term: "犬", reading: "", gloss: "con chó" })).toBe(true);
    expect(isTeachable({ setId: SET_ID, term: "犬", reading: "", example: "犬が走る" })).toBe(true);
  });
});

describe("bộ từ và Bản đồ từ", () => {
  const fromWordset = newWordsetEntry(
    { user_id: "u1", term: "身内", term_lang: "ja", native_lang: "vi", meaning: "Bà con" },
    SET_ID,
    NOW,
  );

  it("thẻ của bộ không lên bản đồ", () => {
    // Bản đồ là bức tranh những từ đã phải TRA. Đổ cả bộ JLPT vào là xoá sạch ý
    // nghĩa của nó.
    expect(isOnWordMap(fromWordset)).toBe(false);
  });

  it("nhưng vẫn là thẻ đang học bình thường ở mọi chỗ khác", () => {
    // Chế độ Nghe và chế độ Ảnh dùng `isVisibleOnCloud`; lọc ở đó là lặng lẽ rút
    // hết chất liệu của chúng.
    expect(isVisibleOnCloud(fromWordset)).toBe(true);
  });

  it("tra chính từ đó thì cờ được gỡ và nó lên bản đồ", () => {
    const later = NOW + 10 * 60 * 1000;
    const { entry, events } = registerLookup(
      fromWordset,
      { user_id: "u1", term: "身内", term_lang: "ja", native_lang: "vi", meaning: "Bà con" },
      later,
    );
    expect(events.counted).toBe(true);
    expect(entry.from_wordset).toBeUndefined();
    expect(isOnWordMap(entry)).toBe(true);
  });

  it("mở lại trong cửa sổ debounce KHÔNG gỡ cờ", () => {
    // Lần mở ấy không được đếm là một tín hiệu quên mới, nên cũng không đủ tư
    // cách đưa từ lên bản đồ.
    const { entry, events } = registerLookup(
      fromWordset,
      { user_id: "u1", term: "身内", term_lang: "ja", native_lang: "vi", meaning: "Bà con" },
      NOW + 1000,
    );
    expect(events.counted).toBe(false);
    expect(entry.from_wordset).toBe(SET_ID);
  });

  it("thẻ đến từ tra cứu không bao giờ mang cờ", () => {
    const { entry } = registerLookup(
      undefined,
      { user_id: "u1", term: "犬", term_lang: "ja", native_lang: "vi", meaning: "con chó" },
      NOW,
    );
    expect(entry.from_wordset).toBeUndefined();
    expect(isOnWordMap(entry)).toBe(true);
  });
});

describe("hàng đợi chỉ được chứa từ CỦA bộ", () => {
  /** Vốn từ của người dùng: một thẻ đến hạn, không nằm trong bộ N1. */
  const cauDaTra = makeEntry({ term: "橋", term_lang: "ja", reading: "はし", next_review: NOW - 1000, card_state: "REVIEW" });

  it("không kéo thẻ chỉ ghép NGỜ vào phiên", () => {
    // 箸 (đũa) trong bộ ghép với 橋 (cầu) đã tra trước đó chỉ vì trùng cách đọc
    // はし — bậc 3, "ngờ". Chính wordsetMatch.ts nói bậc 3–5 không được tự coi
    // là cùng một từ. Kéo 橋 vào phiên "học bộ N1" là bắt người dùng ôn một từ
    // họ không hề chọn học, và nó chiếm chỗ của từ N1 thật.
    const cells = applySieve(
      [{ term: "箸", reading: "はし", term_lang: "ja", native_lang: "vi" }],
      [cauDaTra],
      NOW,
    );
    expect(cells[0].match).toBe("loose");
    expect(dueEntriesOf(cells)).toEqual([]);
  });

  it("vẫn lấy thẻ ghép CHẮC — đó đúng là từ của bộ", () => {
    const daTra = makeEntry({ term: "身内", term_lang: "ja", reading: "みうち", next_review: NOW - 1000, card_state: "REVIEW" });
    const cells = applySieve(
      [{ term: "身内", reading: "みうち", term_lang: "ja", native_lang: "vi" }],
      [daTra],
      NOW,
    );
    expect(cells[0].match).toBe("exact");
    expect(dueEntriesOf(cells).map((e) => e.term)).toEqual(["身内"]);
  });
});
