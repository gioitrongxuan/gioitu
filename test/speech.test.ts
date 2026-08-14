// Phần thuần của giọng đọc dùng chung (`@/shared/speech`): chọn locale, chọn
// giọng, và mặt chữ đem đi đọc. Trước ở test/listen.test.ts, dời sang cùng lúc
// code dời khỏi feature review để từ điển dùng chung (#246).

import { describe, expect, it } from "vitest";
import { findVoice, speakableTerm, speechLocale } from "@/shared/speech";

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

  // Kết quả từ điển để `reading: null` khi không có cách đọc, khác với vắng mặt.
  it("reading rỗng hoặc null → đọc mặt chữ", () => {
    expect(speakableTerm({ term: "桜", term_lang: "ja", reading: null })).toBe("桜");
    expect(speakableTerm({ term: "桜", term_lang: "ja", reading: "" })).toBe("桜");
  });

  it("ngôn ngữ khác → luôn đọc mặt chữ, kể cả khi có reading", () => {
    expect(speakableTerm({ term: "cat", term_lang: "en", reading: "kæt" })).toBe("cat");
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
