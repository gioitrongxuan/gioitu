// Furigana mã hoá dạng chuỗi — port từ ref/jisho-open (common/src/furigana.ts).
//
// Một furigana là danh sách đoạn [base, reading]; ta LƯU SẴN nó dưới dạng chuỗi
// gọn trên mỗi Heading (vd 召し上がる/めしあがる → "召.し.上.がる;め..あ.") để
// khỏi tính lại lúc render. `encode`/`decode` là cặp nghịch đảo; `encodeWord`
// sinh chuỗi từ (base, reading) bằng thuật toán phân đoạn Yomitan sẵn có
// (japanese.ts), nên ta tái dùng phần khó thay vì port `match`/`revise` của jisho.

import { distributeFurigana, FuriganaSegment } from "./japanese";

/** Một đoạn furigana: [chữ gốc, âm đọc]. Âm rỗng ("") = đoạn kana trần. */
export type FuriSegment = [base: string, reading: string];
export type Furigana = FuriSegment[];

export const READING_SEPARATOR = ";";
export const SEGMENT_SEPARATOR = ".";

// Ký tự phân tách lỡ xuất hiện trong dữ liệu → thay bằng bản full-width để không vỡ chuỗi.
export function escapeSegment(segment: string): string {
  return segment.replaceAll(READING_SEPARATOR, "；").replaceAll(SEGMENT_SEPARATOR, "．");
}

/** "base1.base2…;read1.read2…" — reading để rỗng khi đoạn trần (reading === base). */
export function encode(furi: Furigana): string {
  const bases = furi.map((p) => escapeSegment(p[0])).join(SEGMENT_SEPARATOR);
  const readings = furi
    .map((p) => {
      const reading = p[1] || p[0];
      return escapeSegment(reading === p[0] ? "" : reading);
    })
    .join(SEGMENT_SEPARATOR);
  return bases + READING_SEPARATOR + readings;
}

export function decode(encoded: string): Furigana {
  const split = encoded.split(READING_SEPARATOR);
  if (split.length !== 2) throw new Error(`furigana mã hoá không hợp lệ: ${encoded}`);
  const bases = split[0].split(SEGMENT_SEPARATOR);
  const readings = split[1].split(SEGMENT_SEPARATOR);
  if (bases.length !== readings.length)
    throw new Error(`số đoạn base/reading lệch nhau: ${encoded}`);
  return bases.map((base, i): FuriSegment => [base, readings[i] === base ? "" : readings[i]]);
}

/** Âm đọc thuần (ghép reading, lùi về base khi đoạn trần) — vd để tra/đối chiếu. */
export function extractReading(furi: Furigana): string {
  return furi.map((p) => p[1] || p[0]).join("");
}

/** Đổi đoạn của Yomitan ({text, reading?}) sang cặp [base, reading]. */
export function fromSegments(segments: FuriganaSegment[]): Furigana {
  return segments.map((s): FuriSegment => [s.text, s.reading ?? ""]);
}

/** Sinh chuỗi furigana mã hoá từ (base, reading). Dùng lúc import từ điển. */
export function encodeWord(base: string, reading?: string): string {
  return encode(fromSegments(distributeFurigana(base, reading)));
}
