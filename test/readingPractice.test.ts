import { describe, expect, it } from "vitest";
import { isReadingMatch, normalizeReadingInput } from "@/features/review/domain/readingPractice";

describe("normalizeReadingInput", () => {
  it("quy romaji về hiragana", () => {
    expect(normalizeReadingInput("taberu")).toBe("たべる");
  });

  it("quy katakana về hiragana", () => {
    expect(normalizeReadingInput("タベル")).toBe("たべる");
  });

  it("giữ nguyên hiragana", () => {
    expect(normalizeReadingInput("たべる")).toBe("たべる");
  });

  it("chuỗi rỗng/toàn khoảng trắng → rỗng", () => {
    expect(normalizeReadingInput("")).toBe("");
    expect(normalizeReadingInput("   ")).toBe("");
  });
});

describe("isReadingMatch", () => {
  it("romaji khớp cách đọc kana của thẻ", () => {
    expect(isReadingMatch("taberu", "たべる")).toBe(true);
  });

  it("kana gõ trực tiếp khớp cách đọc", () => {
    expect(isReadingMatch("たべる", "たべる")).toBe(true);
  });

  it("katakana ở cách đọc thẻ vẫn khớp romaji người dùng gõ", () => {
    expect(isReadingMatch("taberu", "タベル")).toBe(true);
  });

  it("gõ sai → false", () => {
    expect(isReadingMatch("nomu", "たべる")).toBe(false);
  });

  it("chưa gõ gì → false (không tính đúng nếu để trống)", () => {
    expect(isReadingMatch("", "たべる")).toBe(false);
  });

  it("thẻ không có cách đọc → false", () => {
    expect(isReadingMatch("taberu", undefined)).toBe(false);
  });
});
