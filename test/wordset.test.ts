import { describe, it, expect } from "vitest";
import {
  MAX_WORDSET_WORDS,
  parseWordset,
  sampleWordsetCsv,
  titleFromFilename,
} from "@/features/vocabstudy/domain/wordset";

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

describe("parseWordset — dòng tiêu đề cột", () => {
  it("bỏ dòng tiêu đề của tệp xuất từ Excel/Sheets", () => {
    const r = parseWordset("Từ,Cách đọc,Nghĩa\n食べる,たべる,ăn");
    expect(r.words).toEqual([{ term: "食べる", reading: "たべる", gloss: "ăn" }]);
    expect(r.skipped).toBe(0); // người dùng không làm gì sai, đừng báo động
  });

  it("tiêu đề tiếng Anh cũng nhận ra", () => {
    const r = parseWordset("word\treading\tmeaning\n犬\tいぬ\tcon chó");
    expect(r.words.map((w) => w.term)).toEqual(["犬"]);
  });

  it("KHÔNG đụng danh sách một cột — 'word' ở đó là từ vựng thật", () => {
    const r = parseWordset("word\nreading\nmeaning");
    expect(r.words.map((w) => w.term)).toEqual(["word", "reading", "meaning"]);
  });

  it("chỉ một ô trùng nhãn cột thì vẫn là từ thật, không bỏ", () => {
    const r = parseWordset("từ,cái gì đó\n犬,con chó");
    expect(r.words.map((w) => w.term)).toEqual(["từ", "犬"]);
  });

  it("chỉ xét dòng đầu — giữa bộ có dòng trông như tiêu đề vẫn là từ", () => {
    const r = parseWordset("犬,con chó\ntừ,nghĩa");
    expect(r.words.map((w) => w.term)).toEqual(["犬", "từ"]);
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

// Tệp mẫu phải đi qua ĐÚNG trình phân tích thật — nếu không, một ngày nào đó ta
// đổi luật tách cột và người dùng tải về một tệp mẫu mà app tự chối.
describe("sampleWordsetCsv", () => {
  it("ja→vi: mặt chữ tiếng Nhật, nghĩa tiếng Việt, đọc lại được đủ 3 từ", () => {
    const r = parseWordset(sampleWordsetCsv("ja", "vi"));
    expect(r.words).toEqual([
      { term: "食べる", reading: "たべる", gloss: "ăn", group: "Bài 1" },
      { term: "請求書", reading: "せいきゅうしょ", gloss: "hoá đơn", group: "Bài 2" },
      { term: "締め切り", reading: "しめきり", gloss: "hạn chót, kỳ hạn", group: "Bài 3" },
    ]);
    expect(r.skipped).toBe(0);
  });

  it("đảo cặp thì đảo luôn vai trò mặt chữ / nghĩa", () => {
    const r = parseWordset(sampleWordsetCsv("vi", "ja"));
    expect(r.words[0]).toMatchObject({ term: "ăn", gloss: "食べる" });
  });

  it("en→vi: từ không có cách đọc thì bỏ trống cột, không sinh reading rỗng", () => {
    const r = parseWordset(sampleWordsetCsv("en", "vi"));
    expect(r.words[0]).toEqual({ term: "eat", gloss: "ăn", group: "Bài 1" });
  });

  it("dòng tiêu đề cột không lọt vào danh sách từ", () => {
    const r = parseWordset(sampleWordsetCsv("ja", "vi"));
    expect(r.words.map((w) => w.term)).not.toContain("mặt chữ");
  });
});
