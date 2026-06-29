import { describe, it, expect } from "vitest";
import {
  encode,
  decode,
  encodeWord,
  extractReading,
  escapeSegment,
  fromSegments,
  Furigana,
} from "@/shared/furigana";

describe("furigana encode/decode (port jisho)", () => {
  // 召し上がる / めしあがる → 召(め)し上(あ)がる
  const meshiagaru: Furigana = [
    ["召", "め"],
    ["し", ""],
    ["上", "あ"],
    ["がる", ""],
  ];

  it("mã hoá đoạn trần thành reading rỗng", () => {
    expect(encode(meshiagaru)).toBe("召.し.上.がる;め..あ.");
  });

  it("decode là nghịch đảo của encode", () => {
    expect(decode(encode(meshiagaru))).toEqual(meshiagaru);
  });

  it("giữ nguyên reading thuần qua vòng mã hoá", () => {
    expect(extractReading(decode(encode(meshiagaru)))).toBe("めしあがる");
  });

  it("từ kana thuần: không có ruby", () => {
    const suru: Furigana = [["する", ""]];
    expect(encode(suru)).toBe("する;");
    expect(decode("する;")).toEqual([["する", ""]]);
  });

  it("báo lỗi khi chuỗi mã hoá sai định dạng", () => {
    expect(() => decode("không-có-dấu-chấm-phẩy")).toThrow();
    expect(() => decode("a.b;x")).toThrow(); // số đoạn lệch
  });

  it("escape ký tự phân tách trong dữ liệu", () => {
    expect(escapeSegment("a;b.c")).toBe("a；b．c");
  });
});

describe("encodeWord — sinh furigana từ (base, reading) bằng phân đoạn Yomitan", () => {
  it("okurigana giữa kanji: 食べ物 / たべもの", () => {
    expect(encodeWord("食べ物", "たべもの")).toBe("食.べ.物;た..もの");
  });

  it("召し上がる / めしあがる", () => {
    expect(encodeWord("召し上がる", "めしあがる")).toBe("召.し.上.がる;め..あ.");
  });

  it("kana thuần / không reading → một đoạn trần", () => {
    expect(encodeWord("ある")).toBe("ある;");
    expect(encodeWord("する", "する")).toBe("する;");
  });

  it("fromSegments đổi {text,reading?} sang [base,reading]", () => {
    expect(fromSegments([{ text: "食", reading: "た" }, { text: "べ" }])).toEqual([
      ["食", "た"],
      ["べ", ""],
    ]);
  });
});
