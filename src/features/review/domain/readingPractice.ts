// Chế độ luyện chủ động tuỳ chọn (BACKLOG GĐ3): gõ cách đọc trước khi lật thẻ,
// để tự kiểm tra thay vì chỉ tự chấm "đã biết" (dễ "ảo giác đã biết"). Thuần —
// không phụ thuộc React/DOM, test độc lập.

import { romajiToHiragana } from "@/features/dictionary/domain/romaji";
import { katakanaToHiragana } from "@/shared/japanese";

/** Quy input người dùng (romaji hoặc kana) về hiragana để so khớp. */
export function normalizeReadingInput(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  const romaji = romajiToHiragana(trimmed);
  return katakanaToHiragana(romaji || trimmed);
}

/**
 * Input người dùng có khớp cách đọc của thẻ không. Chỉ là gợi ý mềm (không
 * chặn lật thẻ) nên không cần xử các biến thể okurigana/nhiều cách đọc — so
 * khớp đúng nguyên văn (đã quy về hiragana) là đủ cho v1.
 */
export function isReadingMatch(input: string, reading: string | undefined): boolean {
  if (!reading) return false;
  const normalizedInput = normalizeReadingInput(input);
  if (!normalizedInput) return false;
  return normalizedInput === katakanaToHiragana(reading.trim());
}
