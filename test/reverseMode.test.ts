import { describe, expect, it } from "vitest";
import { cardFront, highlightTerm } from "@/features/review/domain/reverseMode";

const card = { term: "食べる", meaning: JSON.stringify(["ăn", "dùng bữa"]) };

describe("cardFront", () => {
  it("chế độ mặc định → mặt trước là từ", () => {
    expect(cardFront("term", card)).toEqual({ kind: "term", text: "食べる" });
  });

  it("đảo chiều → mặt trước là các dòng nghĩa (JSON string[])", () => {
    expect(cardFront("meaning", card)).toEqual({ kind: "meaning", lines: ["ăn", "dùng bữa"] });
  });

  it("nghĩa plain text (legacy) → một dòng nghĩa", () => {
    expect(cardFront("meaning", { term: "犬", meaning: "con chó" })).toEqual({
      kind: "meaning",
      lines: ["con chó"],
    });
  });

  it("đảo chiều nhưng thẻ không có nghĩa đọc được → rơi về mặt từ", () => {
    expect(cardFront("meaning", { term: "犬", meaning: "" })).toEqual({ kind: "term", text: "犬" });
    expect(cardFront("meaning", { term: "犬", meaning: "[]" })).toEqual({ kind: "term", text: "犬" });
  });
});

describe("mặt trước kiểu câu (bộ Tango)", () => {
  const card = { term: "身内", meaning: "Bà con", example: "身内に医者がいると安心だ。 :: Có bác sĩ trong họ thì yên tâm." };

  it("chỉ lấy phần câu, bỏ bản dịch", () => {
    // Bản dịch nằm sẵn ở mặt trước thì thẻ tự trả lời hộ.
    expect(cardFront("sentence", card)).toEqual({
      kind: "sentence",
      sentence: "身内に医者がいると安心だ。",
      term: "身内",
    });
  });

  it("câu không chứa từ thì rơi về mặt từ", () => {
    // Không chứa thì không tô đậm được, mà người học cũng chẳng có manh mối nào.
    expect(cardFront("sentence", { ...card, example: "犬が走る。" })).toEqual({ kind: "term", text: "身内" });
  });

  it("thẻ không có ví dụ thì rơi về mặt từ", () => {
    expect(cardFront("sentence", { term: "身内", meaning: "Bà con" })).toEqual({ kind: "term", text: "身内" });
  });

  it("ví dụ không có dấu ngăn thì cả chuỗi là câu", () => {
    expect(cardFront("sentence", { ...card, example: "身内に医者がいる。" })).toMatchObject({
      sentence: "身内に医者がいる。",
    });
  });
});

describe("tô đậm từ trong câu", () => {
  it("chia câu thành trước · từ · sau", () => {
    expect(highlightTerm("身内に医者がいる", "身内")).toEqual([
      { text: "身内", isTerm: true },
      { text: "に医者がいる", isTerm: false },
    ]);
  });

  it("tô mọi lần xuất hiện", () => {
    expect(highlightTerm("犬と犬", "犬")).toEqual([
      { text: "犬", isTerm: true },
      { text: "と", isTerm: false },
      { text: "犬", isTerm: true },
    ]);
  });

  it("từ không có trong câu thì trả nguyên câu", () => {
    expect(highlightTerm("猫がいる", "犬")).toEqual([{ text: "猫がいる", isTerm: false }]);
  });
});
