import { describe, it, expect } from "vitest";
import {
  matchingKanji,
  availableRadicals,
  groupByStrokes,
  RadicalData,
} from "@/features/dictionary/domain/radicals";

// Bảng bộ thủ nhỏ có kiểm soát:
//   明 = 日 ; 村 = 木+寸 ; 林 = 木 ; 杳 = 木+日 ; 三 = 一 (không giao 木/日)
const data: RadicalData = {
  radicals: [
    { r: "一", s: 1 },
    { r: "日", s: 4 },
    { r: "木", s: 4 },
    { r: "寸", s: 3 },
  ],
  map: {
    "一": "三",
    "日": "明杳",
    "木": "村林杳",
    "寸": "村",
  },
};

describe("matchingKanji", () => {
  it("chưa chọn bộ nào → rỗng", () => {
    expect(matchingKanji(data, [])).toEqual([]);
  });

  it("một bộ → toàn bộ danh sách của bộ đó", () => {
    expect(matchingKanji(data, ["木"])).toEqual(["村", "林", "杳"]);
  });

  it("nhiều bộ → giao (kanji chứa đủ mọi bộ)", () => {
    expect(matchingKanji(data, ["木", "日"])).toEqual(["杳"]);
  });

  it("giao rỗng khi các bộ không cùng xuất hiện", () => {
    expect(matchingKanji(data, ["一", "木"])).toEqual([]);
  });

  it("không phụ thuộc thứ tự các bộ đã chọn", () => {
    expect(matchingKanji(data, ["日", "木"])).toEqual(matchingKanji(data, ["木", "日"]));
  });
});

describe("availableRadicals", () => {
  it("chưa chọn gì → mọi bộ đều chọn được", () => {
    expect(availableRadicals(data, [])).toEqual(new Set(["一", "日", "木", "寸"]));
  });

  it("đã chọn → chỉ bộ còn chung kanji với kết quả (kèm bộ đã chọn)", () => {
    expect(availableRadicals(data, ["木"])).toEqual(new Set(["木", "日", "寸"]));
  });

  it("giao thu hẹp làm mờ thêm bộ", () => {
    expect(availableRadicals(data, ["木", "日"])).toEqual(new Set(["木", "日"]));
  });

  it("kết quả rỗng → chỉ giữ các bộ đã chọn", () => {
    expect(availableRadicals(data, ["一", "木"])).toEqual(new Set(["一", "木"]));
  });
});

describe("groupByStrokes", () => {
  it("gộp các bộ liền nhau cùng số nét, giữ thứ tự", () => {
    expect(groupByStrokes(data.radicals)).toEqual([
      { strokes: 1, radicals: [{ r: "一", s: 1 }] },
      { strokes: 4, radicals: [{ r: "日", s: 4 }, { r: "木", s: 4 }] },
      { strokes: 3, radicals: [{ r: "寸", s: 3 }] },
    ]);
  });
});
