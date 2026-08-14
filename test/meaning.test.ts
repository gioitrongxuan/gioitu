import { describe, it, expect } from "vitest";
import { glossSummary } from "@/shared/meaning";

describe("glossSummary (rút gọn dòng nghĩa cho thẻ tóm tắt)", () => {
  it("lột khối chú thích mở đầu, kể cả ngoặc lồng nhau", () => {
    expect(glossSummary("(exp, Mazii (Vietnamese)) chật hẹp, nhồi nhét."))
      .toBe("chật hẹp, nhồi nhét.");
  });

  it("lột nhiều khối liên tiếp", () => {
    expect(glossSummary("(n) (vs) sự học")).toBe("sự học");
  });

  it("bỏ số thứ tự nghĩa đứng đầu", () => {
    expect(glossSummary("(n) 1. cái bàn")).toBe("cái bàn");
    expect(glossSummary("2) cái ghế")).toBe("cái ghế");
  });

  it("giữ nguyên dòng không có nhiễu", () => {
    expect(glossSummary("ăn")).toBe("ăn");
    expect(glossSummary("  đi bộ  ")).toBe("đi bộ");
  });

  it("giữ ngoặc nằm giữa câu", () => {
    expect(glossSummary("ăn (lịch sự)")).toBe("ăn (lịch sự)");
  });

  it("trả lại dòng gốc khi lột xong chẳng còn gì", () => {
    expect(glossSummary("(chào hỏi)")).toBe("(chào hỏi)");
  });

  it("không cắt bừa khi ngoặc không đóng", () => {
    expect(glossSummary("(exp chật hẹp")).toBe("(exp chật hẹp");
  });
});
