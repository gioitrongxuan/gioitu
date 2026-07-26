import { describe, expect, it } from "vitest";
import { guessPairForText } from "@/features/dictionary/domain/quickadd";

describe("guessPairForText", () => {
  it("từ có kanji → Nhật→Việt", () => {
    expect(guessPairForText("勉強").id).toBe("ja-vi");
  });

  it("từ có hiragana → Nhật→Việt", () => {
    expect(guessPairForText("たべる").id).toBe("ja-vi");
  });

  it("từ có katakana → Nhật→Việt", () => {
    expect(guessPairForText("コーヒー").id).toBe("ja-vi");
  });

  it("chữ Latin thuần → Anh→Việt", () => {
    expect(guessPairForText("serendipity").id).toBe("en-vi");
  });

  it("lẫn Latin + kanji vẫn coi là tiếng Nhật", () => {
    expect(guessPairForText("iPhoneの設定").id).toBe("ja-vi");
  });
});
