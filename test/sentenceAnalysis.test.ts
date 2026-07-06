import { describe, it, expect } from "vitest";
import { buildSentenceAnalysisPrompt, parseSentenceAnalysis } from "@server/features/ai/sentenceAnalysis";

const INPUT = { term: "猫", reading: "ねこ", sentence: "猫が好きです。", term_lang: "ja", native_lang: "vi" };

describe("buildSentenceAnalysisPrompt", () => {
  it("đưa từ, cách đọc và câu vào prompt", () => {
    const p = buildSentenceAnalysisPrompt(INPUT);
    expect(p).toContain("猫");
    expect(p).toContain("ねこ");
    expect(p).toContain("猫が好きです。");
  });

  it("yêu cầu schema JSON { usage, meaning }", () => {
    expect(buildSentenceAnalysisPrompt(INPUT)).toContain('"usage"');
    expect(buildSentenceAnalysisPrompt(INPUT)).toContain('"meaning"');
  });

  it("không thêm phần đọc khi vắng", () => {
    const p = buildSentenceAnalysisPrompt({ ...INPUT, reading: undefined });
    expect(p).not.toContain("đọc:");
  });
});

describe("parseSentenceAnalysis", () => {
  it("đọc JSON { usage, meaning }", () => {
    expect(parseSentenceAnalysis(JSON.stringify({ usage: "chủ ngữ", meaning: "Tôi thích mèo." }))).toEqual({
      usage: "chủ ngữ",
      meaning: "Tôi thích mèo.",
    });
  });

  it("chấp nhận thiếu một trong hai trường", () => {
    expect(parseSentenceAnalysis(JSON.stringify({ meaning: "Tôi thích mèo." }))).toEqual({
      usage: "",
      meaning: "Tôi thích mèo.",
    });
  });

  it("trả null khi cả hai trường rỗng", () => {
    expect(parseSentenceAnalysis(JSON.stringify({ usage: "  ", meaning: "" }))).toBeNull();
  });

  it("trả null khi JSON hỏng", () => {
    expect(parseSentenceAnalysis("không phải json")).toBeNull();
  });

  it("trả null khi nội dung rỗng", () => {
    expect(parseSentenceAnalysis("")).toBeNull();
  });

  it("trả null khi parse ra mảng/số thay vì object", () => {
    expect(parseSentenceAnalysis('["a","b"]')).toBeNull();
    expect(parseSentenceAnalysis("123")).toBeNull();
  });
});
