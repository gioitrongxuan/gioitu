import { describe, it, expect } from "vitest";
import {
  editableToSenses,
  patchPrimaryHeading,
  sensesToEditable,
  stampSenseSource,
} from "@server/features/dictionary/termEdit";

describe("editableToSenses — form → Sense lưu được", () => {
  it("giữ pos/misc/info/ví dụ, lọc dòng & ví dụ rỗng", () => {
    const [s] = editableToSenses([
      {
        pos: ["n"],
        misc: ["uk"],
        gloss: ["con mèo", " mèo ", ""],
        info: ["thân mật", "  "],
        examples: [{ ja: "猫だ", vi: "là mèo" }, { ja: "", vi: "" }],
      },
    ]);
    expect(s.pos).toEqual(["n"]);
    expect(s.misc).toEqual(["uk"]);
    expect(s.gloss).toEqual(["con mèo", "mèo"]);
    expect(s.info).toEqual(["thân mật"]);
    expect(s.examples).toEqual([{ ja: "猫だ", vi: "là mèo" }]);
  });

  it("bỏ nghĩa không còn dòng gloss nào", () => {
    expect(editableToSenses([{ pos: [], misc: [], gloss: ["  ", ""] }])).toEqual([]);
  });

  it("không đính mảng rỗng (misc/info/examples) khi trống", () => {
    const [s] = editableToSenses([{ pos: [], misc: [], gloss: ["x"] }]);
    expect(s).toEqual({ pos: [], gloss: ["x"] });
  });
});

describe("sensesToEditable — Sense đã lưu → form", () => {
  it("rút gloss thành chuỗi, giữ pos/misc", () => {
    const [e] = sensesToEditable([
      { pos: ["n"], gloss: ["mèo", { text: "cat", type: "lit" }], misc: ["uk"] },
    ]);
    expect(e).toMatchObject({ pos: ["n"], misc: ["uk"], gloss: ["mèo", "cat"] });
  });
});

describe("patchPrimaryHeading — vá thuộc tính cách viết chính", () => {
  it("đặt/ xoá Hán-Việt & JLPT theo giá trị nhập", () => {
    const out = patchPrimaryHeading([{ base: "猫", reading: "ねこ", hanViet: "MIÊU" }], {
      term: "猫",
      reading: "ねこ",
      hanViet: undefined, // bỏ trống → xoá
      jlpt: 5,
    });
    expect(out[0]).toEqual({ base: "猫", reading: "ねこ", jlpt: 5 });
  });

  it("từ mới (không có heading) → tạo heading từ patch", () => {
    expect(patchPrimaryHeading([], { term: "新語", reading: "しんご" })).toEqual([
      { base: "新語", reading: "しんご" },
    ]);
  });

  it("chỉ vá heading có base trùng, giữ các cách viết khác", () => {
    const out = patchPrimaryHeading(
      [{ base: "桜" }, { base: "櫻", reading: "さくら" }],
      { term: "櫻", reading: "さくら", hanViet: "ANH" },
    );
    expect(out[0]).toEqual({ base: "桜" });
    expect(out[1]).toEqual({ base: "櫻", reading: "さくら", hanViet: "ANH" });
  });
});

describe("stampSenseSource — đóng dấu lại tên nguồn sau khi sửa tay", () => {
  it("gắn dictionary lên mọi sense, kể cả sense đã mang tên khác", () => {
    const out = stampSenseSource(
      [
        { pos: ["n"], gloss: ["cat"] },
        { pos: [], gloss: ["feline"], dictionary: "cũ" },
      ],
      "JMdict",
    );
    expect(out.map((s) => s.dictionary)).toEqual(["JMdict", "JMdict"]);
  });

  it("không có tên nguồn (lớp thủ công) → giữ nguyên", () => {
    const senses = [{ pos: [], gloss: ["x"] }];
    expect(stampSenseSource(senses)).toBe(senses);
  });
});
