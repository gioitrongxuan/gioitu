import { describe, it, expect } from "vitest";
import { MAX_WORDSET_WORDS, parseWordset, titleFromFilename } from "@/features/vocabstudy/domain/wordset";

describe("parseWordset — một cột", () => {
  it("mỗi dòng một từ, bỏ dòng rỗng và dòng chú thích", () => {
    const r = parseWordset("食べる\n\n# JLPT N1\n読む\n");
    expect(r.words.map((w) => w.term)).toEqual(["食べる", "読む"]);
    expect(r.skipped).toBe(0);
  });

  it("bóc cách đọc dính trong 【…】 và (…)", () => {
    const r = parseWordset("食べる【たべる】\n桜 (さくら)");
    expect(r.words).toEqual([
      { term: "食べる", reading: "たべる" },
      { term: "桜", reading: "さくら" },
    ]);
  });

  it("bỏ đánh số / gạch đầu dòng của danh sách chép về", () => {
    const r = parseWordset("1. 犬\n2) 猫\n- 鳥\n12、魚");
    expect(r.words.map((w) => w.term)).toEqual(["犬", "猫", "鳥", "魚"]);
  });
});

describe("parseWordset — nhiều cột", () => {
  it("tách bằng TAB theo thứ tự mặt chữ / cách đọc / nghĩa / bài", () => {
    const r = parseWordset("食べる\tたべる\tăn\tBài 1");
    expect(r.words[0]).toEqual({ term: "食べる", reading: "たべる", gloss: "ăn", group: "Bài 1" });
  });

  it("cột cách đọc để trống vẫn nhận được nghĩa", () => {
    const r = parseWordset("apple\t\tquả táo");
    expect(r.words[0]).toEqual({ term: "apple", gloss: "quả táo" });
  });

  it("tách bằng dấu phẩy nhưng tôn trọng nháy kép trong nghĩa", () => {
    const r = parseWordset('机,つくえ,"cái bàn, bàn học"');
    expect(r.words[0]).toEqual({ term: "机", reading: "つくえ", gloss: "cái bàn, bàn học" });
  });

  it("cột riêng thắng cách đọc dính trong mặt chữ", () => {
    const r = parseWordset("辛い【からい】\tつらい\tkhổ sở");
    expect(r.words[0]).toEqual({ term: "辛い【からい】", reading: "つらい", gloss: "khổ sở" });
  });
});

describe("parseWordset — đếm phần bỏ đi", () => {
  it("dòng trùng (term, reading) chỉ giữ dòng đầu và được đếm", () => {
    const r = parseWordset("犬\n犬\n犬\tいぬ");
    expect(r.words).toEqual([{ term: "犬" }, { term: "犬", reading: "いぬ" }]);
    expect(r.duplicates).toBe(1);
  });

  it("dòng không có mặt chữ tính vào skipped", () => {
    const r = parseWordset(",,nghĩa không có từ\n犬");
    expect(r.words.map((w) => w.term)).toEqual(["犬"]);
    expect(r.skipped).toBe(1);
  });

  it("cắt phần vượt trần và báo lại số dòng bị cắt", () => {
    const lines = Array.from({ length: MAX_WORDSET_WORDS + 3 }, (_, i) => `từ${i}`);
    const r = parseWordset(lines.join("\n"));
    expect(r.words).toHaveLength(MAX_WORDSET_WORDS);
    expect(r.truncated).toBe(3);
  });
});

describe("titleFromFilename", () => {
  it("bỏ đuôi và đổi dấu ngăn cách thành khoảng trắng", () => {
    expect(titleFromFilename("jlpt_n1-vocab.csv")).toBe("jlpt n1 vocab");
  });
});
