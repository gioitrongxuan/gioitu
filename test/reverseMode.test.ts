import { describe, expect, it } from "vitest";
import { cardFront } from "@/features/review/domain/reverseMode";

const card = { term: "食べる", meaning: JSON.stringify(["ăn", "dùng bữa"]) };

describe("cardFront", () => {
  it("chế độ mặc định → mặt trước là từ", () => {
    expect(cardFront(false, card)).toEqual({ kind: "term", text: "食べる" });
  });

  it("đảo chiều → mặt trước là các dòng nghĩa (JSON string[])", () => {
    expect(cardFront(true, card)).toEqual({ kind: "meaning", lines: ["ăn", "dùng bữa"] });
  });

  it("nghĩa plain text (legacy) → một dòng nghĩa", () => {
    expect(cardFront(true, { term: "犬", meaning: "con chó" })).toEqual({
      kind: "meaning",
      lines: ["con chó"],
    });
  });

  it("đảo chiều nhưng thẻ không có nghĩa đọc được → rơi về mặt từ", () => {
    expect(cardFront(true, { term: "犬", meaning: "" })).toEqual({ kind: "term", text: "犬" });
    expect(cardFront(true, { term: "犬", meaning: "[]" })).toEqual({ kind: "term", text: "犬" });
  });
});
