import { describe, it, expect } from "vitest";
import {
  buildDictEntry,
  buildAiPrompt,
  dedupe,
  emptyDraft,
  parseAiResponse,
  termReadingKey,
  type CustomDraft,
} from "@/features/dictionary/domain/customEntry";
import { pairById } from "@/shared/languages";

const JA_VI = pairById("ja-vi");

function draft(over: Partial<CustomDraft> = {}): CustomDraft {
  return { ...emptyDraft(), ...over };
}

describe("buildDictEntry", () => {
  it("dựng một sense thủ công với từ loại, nhiều nghĩa và cặp ngôn ngữ", () => {
    const entry = buildDictEntry(
      draft({ term: "猫", reading: "ねこ", pos: "n", gloss: "con mèo; mèo nhà" }),
      JA_VI,
      "Sổ tay của tôi",
    );
    expect(entry.term).toBe("猫");
    expect(entry.reading).toBe("ねこ");
    expect(entry.term_lang).toBe("ja");
    expect(entry.native_lang).toBe("vi");
    expect(entry.dictionary).toBe("Sổ tay của tôi");
    expect(entry.senses).toHaveLength(1);
    expect(entry.senses![0].tags).toEqual(["n"]);
    expect(entry.senses![0].glossary).toEqual(["con mèo", "mèo nhà"]);
    // definitions phẳng dùng chung cho preview/SRS.
    expect(entry.definitions).toEqual(["con mèo", "mèo nhà"]);
  });

  it("tách nhiều mã từ loại và resolve tagMeta", () => {
    const entry = buildDictEntry(draft({ term: "勉強", pos: "n vs", gloss: "học tập" }), JA_VI, "d");
    expect(entry.senses![0].tags).toEqual(["n", "vs"]);
    expect(entry.tagMeta?.n).toBeTruthy();
  });

  it('phân tích ví dụ "câu :: dịch"', () => {
    const entry = buildDictEntry(
      draft({ term: "猫", gloss: "mèo", example: "猫が好き :: Tôi thích mèo" }),
      JA_VI,
      "d",
    );
    expect(entry.senses![0].examples).toEqual([{ ja: "猫が好き", vi: "Tôi thích mèo" }]);
  });

  it("ví dụ không có dấu :: thì toàn bộ là câu nguồn", () => {
    const entry = buildDictEntry(draft({ term: "猫", gloss: "mèo", example: "猫が好き" }), JA_VI, "d");
    expect(entry.senses![0].examples).toEqual([{ ja: "猫が好き", vi: "" }]);
  });

  it("không có ví dụ thì không đặt trường examples", () => {
    const entry = buildDictEntry(draft({ term: "猫", gloss: "mèo" }), JA_VI, "d");
    expect(entry.senses![0].examples).toBeUndefined();
  });

  it("giải thích và từ liên quan đi vào sense.info (từ liên quan có nhãn)", () => {
    const entry = buildDictEntry(
      draft({ term: "猫", gloss: "mèo", note: "loài vật nuôi", related: "犬; 虎" }),
      JA_VI,
      "d",
    );
    expect(entry.senses![0].info).toEqual(["loài vật nuôi", "Liên quan/dễ nhầm: 犬; 虎"]);
  });

  it("không có giải thích/liên quan thì không đặt trường info", () => {
    const entry = buildDictEntry(draft({ term: "猫", gloss: "mèo" }), JA_VI, "d");
    expect(entry.senses![0].info).toBeUndefined();
  });
});

describe("dedupe", () => {
  it("chia fresh / duplicates theo khoá (term, reading)", () => {
    const existing = new Set([termReadingKey("猫", "ねこ")]);
    const rows = [
      draft({ term: "猫", reading: "ねこ", gloss: "mèo" }), // trùng
      draft({ term: "犬", reading: "いぬ", gloss: "chó" }), // mới
    ];
    const { fresh, duplicates } = dedupe(rows, existing);
    expect(fresh.map((r) => r.term)).toEqual(["犬"]);
    expect(duplicates.map((r) => r.term)).toEqual(["猫"]);
  });

  it("khử trùng nội bộ — dòng sau cùng khoá thắng", () => {
    const rows = [
      draft({ term: "猫", reading: "ねこ", gloss: "mèo cũ" }),
      draft({ term: "猫", reading: "ねこ", gloss: "mèo mới" }),
    ];
    const { fresh } = dedupe(rows, new Set());
    expect(fresh).toHaveLength(1);
    expect(fresh[0].gloss).toBe("mèo mới");
  });

  it("bỏ qua dòng chưa điền đủ (thiếu từ hoặc nghĩa)", () => {
    const rows = [draft({ term: "猫" }), draft({ gloss: "mèo" }), draft({ term: "犬", gloss: "chó" })];
    const { fresh } = dedupe(rows, new Set());
    expect(fresh.map((r) => r.term)).toEqual(["犬"]);
  });

  it("cùng term khác reading là hai mục khác nhau", () => {
    const rows = [
      draft({ term: "辛い", reading: "からい", gloss: "cay" }),
      draft({ term: "辛い", reading: "つらい", gloss: "khổ" }),
    ];
    const { fresh } = dedupe(rows, new Set());
    expect(fresh).toHaveLength(2);
  });
});

describe("buildAiPrompt", () => {
  it("chứa danh sách từ, số lượng ngẫu nhiên, yêu cầu thêm và cặp ngôn ngữ", () => {
    const prompt = buildAiPrompt({
      words: ["猫", "犬"],
      randomCount: 5,
      wantExamples: true,
      extra: "chủ đề động vật",
      pair: JA_VI,
    });
    expect(prompt).toContain("猫");
    expect(prompt).toContain("犬");
    expect(prompt).toContain("5");
    expect(prompt).toContain("chủ đề động vật");
    expect(prompt).toContain("tiếng Nhật");
    expect(prompt).toContain("tiếng Việt");
    expect(prompt).toContain("example");
  });

  it("bỏ trường example khỏi schema khi không cần ví dụ", () => {
    const prompt = buildAiPrompt({ words: ["猫"], randomCount: 0, wantExamples: false, extra: "", pair: JA_VI });
    expect(prompt).not.toContain('"example"');
  });

  it("thêm trường note/related vào schema khi bật các tuỳ chọn", () => {
    const on = buildAiPrompt({
      words: ["猫"],
      randomCount: 0,
      wantExamples: false,
      wantExplanation: true,
      wantRelated: true,
      extra: "",
      pair: JA_VI,
    });
    expect(on).toContain('"note"');
    expect(on).toContain('"related"');

    const off = buildAiPrompt({ words: ["猫"], randomCount: 0, wantExamples: true, extra: "", pair: JA_VI });
    expect(off).not.toContain('"note"');
    expect(off).not.toContain('"related"');
  });

  it("đưa tên từ điển, chủ đề và mô tả vào prompt khi có", () => {
    const prompt = buildAiPrompt({
      words: [],
      randomCount: 10,
      wantExamples: false,
      extra: "",
      pair: JA_VI,
      dictTitle: "Sổ tay bếp núc",
      topic: "Ẩm thực",
      description: "Từ vựng nhà bếp cho N4",
    });
    expect(prompt).toContain("Sổ tay bếp núc");
    expect(prompt).toContain("Ẩm thực");
    expect(prompt).toContain("Từ vựng nhà bếp cho N4");
  });

  it("bỏ qua metadata trống", () => {
    const prompt = buildAiPrompt({
      words: ["猫"],
      randomCount: 0,
      wantExamples: false,
      extra: "",
      pair: JA_VI,
      dictTitle: "  ",
      topic: "",
    });
    expect(prompt).not.toContain("Tên bộ từ vựng");
    expect(prompt).not.toContain("Chủ đề/lĩnh vực");
  });
});

describe("parseAiResponse", () => {
  it("đọc JSON object có mảng words", () => {
    const { rows, errors } = parseAiResponse(
      JSON.stringify({
        words: [
          { term: "猫", reading: "ねこ", pos: "n", meanings: ["con mèo"], example: { source: "猫だ", translation: "Là mèo" } },
        ],
      }),
    );
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ term: "猫", reading: "ねこ", pos: "n", gloss: "con mèo" });
    expect(rows[0].example).toContain("猫だ");
    expect(rows[0].example).toContain("Là mèo");
  });

  it("đọc mảng trần", () => {
    const { rows } = parseAiResponse(JSON.stringify([{ term: "犬", meanings: ["chó"] }]));
    expect(rows.map((r) => r.term)).toEqual(["犬"]);
  });

  it("gỡ hàng rào ```json", () => {
    const { rows } = parseAiResponse('```json\n{"words":[{"term":"鳥","meaning":"chim"}]}\n```');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ term: "鳥", gloss: "chim" });
  });

  it("gom lỗi cho mục thiếu term nhưng vẫn giữ mục hợp lệ", () => {
    const { rows, errors } = parseAiResponse(JSON.stringify({ words: [{ meanings: ["x"] }, { term: "猫", meanings: ["mèo"] }] }));
    expect(rows.map((r) => r.term)).toEqual(["猫"]);
    expect(errors).toHaveLength(1);
  });

  it("JSON hỏng → báo lỗi, không ném", () => {
    const { rows, errors } = parseAiResponse("đây không phải json");
    expect(rows).toEqual([]);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("gộp nhiều pos dạng mảng thành chuỗi", () => {
    const { rows } = parseAiResponse(JSON.stringify({ words: [{ term: "勉強", pos: ["n", "vs"], meanings: ["học"] }] }));
    expect(rows[0].pos).toBe("n vs");
  });

  it("đọc note và related (mảng → chuỗi ngăn bởi ;)", () => {
    const { rows } = parseAiResponse(
      JSON.stringify({
        words: [{ term: "猫", meanings: ["mèo"], note: "vật nuôi", related: ["犬", "虎"] }],
      }),
    );
    expect(rows[0].note).toBe("vật nuôi");
    expect(rows[0].related).toBe("犬; 虎");
  });
});
