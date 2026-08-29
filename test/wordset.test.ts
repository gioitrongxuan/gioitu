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
  it("tách bằng TAB theo thứ tự mặt chữ / cách đọc / nghĩa / ví dụ", () => {
    const r = parseWordset("食べる\tたべる\tăn\t毎朝パンを食べる :: Sáng nào tôi cũng ăn bánh mì");
    expect(r.words[0]).toEqual({
      term: "食べる",
      reading: "たべる",
      gloss: "ăn",
      example: "毎朝パンを食べる :: Sáng nào tôi cũng ăn bánh mì",
    });
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

describe("parseWordset — lối viết gõ tay", () => {
  it("dấu = tách cột", () => {
    expect(parseWordset("食べる = ăn").words[0]).toEqual({ term: "食べる", gloss: "ăn" });
  });

  it("dấu | tách được nhiều cột", () => {
    expect(parseWordset("請求書 | せいきゅうしょ | hoá đơn").words[0]).toEqual({
      term: "請求書",
      reading: "せいきゅうしょ",
      gloss: "hoá đơn",
    });
  });

  it("gạch ngang CÓ khoảng trắng tách làm đôi", () => {
    expect(parseWordset("犬 - con chó").words[0]).toEqual({ term: "犬", gloss: "con chó" });
  });

  it("gạch nối DÍNH LIỀN là một phần của từ, không phải dấu ngăn", () => {
    expect(parseWordset("mother-in-law").words[0]).toEqual({ term: "mother-in-law" });
  });

  it("dấu nào đứng trước thì thắng — phẩy trong nghĩa không cắt nhầm", () => {
    expect(parseWordset("食べる = ăn, uống").words[0]).toEqual({ term: "食べる", gloss: "ăn, uống" });
  });

  it("…và ngược lại: dấu = trong nghĩa không cắt nhầm dòng CSV", () => {
    expect(parseWordset("food,thức ăn = đồ ăn").words[0]).toEqual({ term: "food", gloss: "thức ăn = đồ ăn" });
  });

  it("kèm 【cách đọc】 vẫn chạy cùng dấu =", () => {
    expect(parseWordset("食べる【たべる】 = ăn").words[0]).toEqual({
      term: "食べる",
      reading: "たべる",
      gloss: "ăn",
    });
  });
});

describe("parseWordset — hai cột: cách đọc hay nghĩa", () => {
  it("ô thứ hai toàn kana → cách đọc", () => {
    expect(parseWordset("食べる,たべる").words[0]).toEqual({ term: "食べる", reading: "たべる" });
  });

  it("ô thứ hai không phải kana → nghĩa (không nhét bậy vào furigana)", () => {
    expect(parseWordset("食べる,ăn").words[0]).toEqual({ term: "食べる", gloss: "ăn" });
  });

  it("từ tiếng Anh hai cột cũng ra nghĩa", () => {
    expect(parseWordset("invoice,hoá đơn").words[0]).toEqual({ term: "invoice", gloss: "hoá đơn" });
  });

  it("ba cột trở lên thì theo đúng thứ tự, không đoán nữa", () => {
    expect(parseWordset("食べる,ăn,uống").words[0]).toEqual({ term: "食べる", reading: "ăn", gloss: "uống" });
  });
});

describe("parseWordset — dòng bổ sung nhiều dòng", () => {
  it("nghĩa/ví dụ/cách đọc gắn vào từ ngay trước", () => {
    const r = parseWordset(
      ["締め切り", "cách đọc: しめきり", "nghĩa: hạn chót", "ví dụ: 締め切りは明日です", "", "犬", "nghĩa: con chó"].join(
        "\n",
      ),
    );
    expect(r.words).toEqual([
      { term: "締め切り", reading: "しめきり", gloss: "hạn chót", example: "締め切りは明日です" },
      { term: "犬", gloss: "con chó" },
    ]);
  });

  it("tiền tố tiếng Anh cũng nhận", () => {
    const r = parseWordset("eat\nmeaning: ăn\nexample: I eat bread");
    expect(r.words).toEqual([{ term: "eat", gloss: "ăn", example: "I eat bread" }]);
  });

  it("đứng đầu văn bản (không có từ nào trước) thì vẫn là một dòng thường", () => {
    const r = parseWordset("nghĩa: ăn");
    expect(r.words.map((w) => w.term)).toEqual(["nghĩa: ăn"]);
  });
});

describe("parseWordset — dòng tiêu đề cột", () => {
  it("bỏ dòng tiêu đề của tệp xuất từ Excel/Sheets", () => {
    const r = parseWordset("Từ,Cách đọc,Nghĩa\n食べる,たべる,ăn");
    expect(r.words).toEqual([{ term: "食べる", reading: "たべる", gloss: "ăn" }]);
    expect(r.skipped).toBe(0); // người dùng không làm gì sai, đừng báo động
  });

  it("tiêu đề của cột ví dụ cũng nhận ra", () => {
    const r = parseWordset("mặt chữ,nghĩa,ví dụ\n犬,con chó,犬が好きです");
    expect(r.words.map((w) => w.term)).toEqual(["犬"]);
  });

  it("tiêu đề 'bài' của tệp cũ vẫn bị bỏ, không thành từ vựng ma", () => {
    const r = parseWordset("từ,nghĩa,bài\n犬,con chó,Bài 1");
    expect(r.words.map((w) => w.term)).toEqual(["犬"]);
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
      {
        term: "食べる",
        reading: "たべる",
        gloss: "ăn",
        example: "毎朝パンを食べる :: Sáng nào tôi cũng ăn bánh mì",
      },
      {
        term: "請求書",
        reading: "せいきゅうしょ",
        gloss: "hoá đơn",
        example: "請求書を送ってください :: Vui lòng gửi hoá đơn",
      },
      {
        term: "締め切り",
        reading: "しめきり",
        gloss: "hạn chót, kỳ hạn",
        example: "締め切りは明日です :: Hạn chót là ngày mai",
      },
    ]);
    expect(r.skipped).toBe(0);
  });

  it("đảo cặp thì đảo luôn vai trò mặt chữ / nghĩa", () => {
    const r = parseWordset(sampleWordsetCsv("vi", "ja"));
    expect(r.words[0]).toMatchObject({ term: "ăn", gloss: "食べる" });
  });

  it("en→vi: từ không có cách đọc thì bỏ trống cột, không sinh reading rỗng", () => {
    const r = parseWordset(sampleWordsetCsv("en", "vi"));
    expect(r.words[0]).toEqual({
      term: "eat",
      gloss: "ăn",
      example: "I eat bread every morning :: Sáng nào tôi cũng ăn bánh mì",
    });
  });

  it("câu ví dụ ở ngôn ngữ NGUỒN, bản dịch ở ngôn ngữ đích", () => {
    const jaVi = parseWordset(sampleWordsetCsv("ja", "vi")).words[0].example ?? "";
    const [source, translation] = jaVi.split("::").map((x) => x.trim());
    expect(source).toBe("毎朝パンを食べる");
    expect(translation).toBe("Sáng nào tôi cũng ăn bánh mì");
  });

  it("dòng tiêu đề cột không lọt vào danh sách từ", () => {
    const r = parseWordset(sampleWordsetCsv("ja", "vi"));
    expect(r.words.map((w) => w.term)).not.toContain("mặt chữ");
  });
});
