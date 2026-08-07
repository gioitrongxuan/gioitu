import { describe, expect, it } from "vitest";
import {
  buildListenPlaylist,
  cardSteps,
  findVoice,
  listenableEntries,
  speakableMeaning,
  speakableTerm,
  speechLocale,
} from "@/features/review/domain/listen";
import { parseListenSettings } from "@/features/review/domain/listenSettings";
import { makeEntry } from "./fixtures";

describe("speechLocale", () => {
  it("ánh xạ mã ngôn ngữ sang locale giọng đọc", () => {
    expect(speechLocale("ja")).toBe("ja-JP");
    expect(speechLocale("en")).toBe("en-US");
    expect(speechLocale("vi")).toBe("vi-VN");
  });

  it("mã lạ → trả về chính nó để trình duyệt tự xử", () => {
    expect(speechLocale("fr")).toBe("fr");
  });
});

describe("speakableTerm", () => {
  it("tiếng Nhật có kana → đọc kana để không sai âm Hán", () => {
    expect(speakableTerm({ term: "作", term_lang: "ja", reading: "さく" })).toBe("さく");
  });

  it("tiếng Nhật không có kana → đọc mặt chữ", () => {
    expect(speakableTerm({ term: "さくら", term_lang: "ja" })).toBe("さくら");
  });

  it("ngôn ngữ khác → luôn đọc mặt chữ, kể cả khi có reading", () => {
    expect(speakableTerm({ term: "cat", term_lang: "en", reading: "kæt" })).toBe("cat");
  });
});

describe("speakableMeaning", () => {
  it("lấy tối đa 2 dòng nghĩa đầu, nối bằng dấu phẩy", () => {
    expect(speakableMeaning(JSON.stringify(["ăn", "dùng bữa", "xơi"]))).toBe("ăn, dùng bữa");
  });

  it("một dòng nghĩa → chính nó", () => {
    expect(speakableMeaning(JSON.stringify(["con chó"]))).toBe("con chó");
  });

  it("nghĩa plain text (legacy) → chính nó", () => {
    expect(speakableMeaning("con mèo")).toBe("con mèo");
  });

  it("payload rỗng hoặc hỏng → chuỗi rỗng", () => {
    expect(speakableMeaning("")).toBe("");
    expect(speakableMeaning("[]")).toBe("");
  });
});

describe("cardSteps", () => {
  const card = { term: "作", term_lang: "ja", native_lang: "vi", reading: "さく", meaning: JSON.stringify(["làm"]) };

  it("đọc từ 2 lần, lặng, rồi đọc nghĩa", () => {
    expect(cardSteps(card, 4000)).toEqual([
      { kind: "speak", text: "さく", locale: "ja-JP" },
      { kind: "speak", text: "さく", locale: "ja-JP" },
      { kind: "pause", ms: 4000 },
      { kind: "speak", text: "làm", locale: "vi-VN" },
    ]);
  });
});

describe("buildListenPlaylist", () => {
  // rng luôn trả 0: Fisher–Yates đảo [A,B,C] thành [B,C,A] — tất định để test.
  const zeroRng = () => 0;

  const ja = (term: string, over = {}) =>
    makeEntry({ term, term_lang: "ja", meaning: JSON.stringify(["nghĩa"]), ...over });

  it("chỉ lấy từ đang học, bỏ từ đã thuộc và từ đã xoá", () => {
    const entries = [
      ja("A"),
      ja("B", { status: "LEARNED" }),
      ja("C", { deleted_at: 1 }),
      ja("D", { status: "RELAPSED" }),
    ];
    const terms = buildListenPlaylist(entries, "all", zeroRng).map((e) => e.term);
    expect(terms.sort()).toEqual(["A", "D"]);
  });

  it("lọc theo ngôn ngữ đang chọn", () => {
    const entries = [ja("日"), makeEntry({ term: "cat", term_lang: "en" })];
    expect(buildListenPlaylist(entries, "ja", zeroRng).map((e) => e.term)).toEqual(["日"]);
    expect(buildListenPlaylist(entries, "en", zeroRng).map((e) => e.term)).toEqual(["cat"]);
  });

  it("loại từ không có nghĩa đọc được — nghe một từ trống nghĩa là vô nghĩa", () => {
    const entries = [ja("A"), ja("B", { meaning: "" }), ja("C", { meaning: "[]" })];
    expect(buildListenPlaylist(entries, "all", zeroRng).map((e) => e.term)).toEqual(["A"]);
  });

  it("xáo trộn theo rng được truyền vào", () => {
    const entries = [ja("A"), ja("B"), ja("C")];
    expect(buildListenPlaylist(entries, "all", zeroRng).map((e) => e.term)).toEqual(["B", "C", "A"]);
  });

  it("listenableEntries giữ nguyên thứ tự gốc — nút Nghe chỉ cần đếm", () => {
    const entries = [ja("A"), ja("B", { status: "LEARNED" }), ja("C")];
    expect(listenableEntries(entries, "all").map((e) => e.term)).toEqual(["A", "C"]);
  });
});

describe("parseListenSettings", () => {
  const DEFAULTS = { rate: 1, gapMs: 4000 };

  it("chưa từng lưu → mặc định", () => {
    expect(parseListenSettings(null)).toEqual(DEFAULTS);
  });

  it("giá trị đã lưu hợp lệ → giữ nguyên", () => {
    expect(parseListenSettings(JSON.stringify({ rate: 0.75, gapMs: 6000 }))).toEqual({
      rate: 0.75,
      gapMs: 6000,
    });
  });

  it("tốc độ lạ → về mặc định, vẫn giữ khoảng lặng hợp lệ", () => {
    expect(parseListenSettings(JSON.stringify({ rate: 9, gapMs: 2000 }))).toEqual({
      rate: 1,
      gapMs: 2000,
    });
  });

  it("khoảng lặng lạ → về mặc định, vẫn giữ tốc độ hợp lệ", () => {
    expect(parseListenSettings(JSON.stringify({ rate: 1.25, gapMs: 999 }))).toEqual({
      rate: 1.25,
      gapMs: 4000,
    });
  });

  it("payload hỏng → mặc định", () => {
    expect(parseListenSettings("{")).toEqual(DEFAULTS);
    expect(parseListenSettings("[]")).toEqual(DEFAULTS);
  });
});

describe("findVoice", () => {
  const voices = [{ lang: "en-US" }, { lang: "ja_JP" }, { lang: "vi" }];

  it("khớp đúng locale (chuẩn hoá gạch dưới của một số hệ điều hành)", () => {
    expect(findVoice(voices, "ja-JP")).toEqual({ lang: "ja_JP" });
  });

  it("không có locale đầy đủ thì khớp theo gốc ngôn ngữ", () => {
    expect(findVoice(voices, "vi-VN")).toEqual({ lang: "vi" });
  });

  it("máy không có giọng nào của ngôn ngữ đó → undefined", () => {
    expect(findVoice(voices, "fr-FR")).toBeUndefined();
  });
});
