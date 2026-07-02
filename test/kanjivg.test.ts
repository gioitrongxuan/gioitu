import { describe, it, expect } from "vitest";
import { kanjiVgFilename, parseKanjiVgStrokes } from "@/features/dictionary/domain/kanjivg";

// Rút gọn từ file 098df.svg (食) thật của KanjiVG: path lồng trong <g>, có
// attribute đứng trước d, số thập phân và toạ độ phân tách bằng dấu phẩy.
const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="109" height="109" viewBox="0 0 109 109">
<g id="kvg:StrokePaths_098df" style="fill:none;stroke:#000000;stroke-width:3">
<g id="kvg:098df" kvg:element="食">
\t<g id="kvg:098df-g1" kvg:element="𠆢" kvg:position="top">
\t\t<path id="kvg:098df-s1" kvg:type="㇒" d="M54.38,10.25c0.12,0.95-0.24,2.21-0.85,3.42C49.5,21.75,39.5,34.5,20.75,44.75"/>
\t\t<path id="kvg:098df-s2" kvg:type="㇏" d="M57.25,13.5c6.5,7.5,20.5,20.25,28.75,25.5"/>
\t</g>
\t<path id="kvg:098df-s3" kvg:type="㇐" d="M 37.5,32.5 h 34"/>
</g>
</g>
</svg>`;

describe("kanjiVgFilename", () => {
  it("codepoint hex 5 chữ số + .svg", () => {
    expect(kanjiVgFilename("食")).toBe("098df.svg");
    expect(kanjiVgFilename("水")).toBe("06c34.svg");
  });
  it("chữ ngoài BMP dùng codepoint đầy đủ", () => {
    expect(kanjiVgFilename("𠮷")).toBe("20bb7.svg");
  });
  it("chuỗi rỗng → null", () => {
    expect(kanjiVgFilename("")).toBeNull();
  });
});

describe("parseKanjiVgStrokes", () => {
  it("lấy đủ nét theo thứ tự trong file, kể cả path lồng trong <g>", () => {
    const strokes = parseKanjiVgStrokes(SAMPLE);
    expect(strokes).toHaveLength(3);
    expect(strokes[0].d.startsWith("M54.38,10.25")).toBe(true);
    expect(strokes[1].d.startsWith("M57.25,13.5")).toBe(true);
  });

  it("đọc điểm đặt bút từ lệnh M — cả dạng phẩy lẫn dạng cách", () => {
    const strokes = parseKanjiVgStrokes(SAMPLE);
    expect(strokes[0].startX).toBeCloseTo(54.38);
    expect(strokes[0].startY).toBeCloseTo(10.25);
    // "M 37.5,32.5" có khoảng trắng sau M
    expect(strokes[2].startX).toBeCloseTo(37.5);
    expect(strokes[2].startY).toBeCloseTo(32.5);
  });

  it("input không phải SVG → mảng rỗng", () => {
    expect(parseKanjiVgStrokes("not svg at all")).toEqual([]);
    expect(parseKanjiVgStrokes("")).toEqual([]);
  });
});
