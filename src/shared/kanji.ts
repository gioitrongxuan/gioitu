// Mô hình kanji — kế thừa ref/jisho-open (common/src/api/kanji.ts), `meanings`
// đổi sang tiếng Việt. THIẾT KẾ SẴN để schema kế thừa trọn jisho; dữ liệu kanji
// nạp ở pha sau (cần nguồn KANJIDIC / Yomitan kanji bank).

import { JlptLevel, JouyouGrade, CommonnessIndex } from "./jisho-tags";

export interface KanjiReading {
  text: string;
  commonness?: CommonnessIndex;
}

export interface KanjiReadingScore {
  reading: string;
  score: number;
}

/** Phân loại cấu tạo chữ (lục thư). `keisei` (hình thanh) kèm phần nghĩa & phần âm. */
export type StructuralCategory =
  | { type: "unknown" | "shoukei" | "shiji" | "kaii" | "kokuji" | "shinjitai" | "derivative" | "rebus" }
  | { type: "keisei"; semantic: string; phonetic: string };

export interface KanjiEntry {
  literal: string;

  jouyou?: JouyouGrade;
  jinmeiyou?: boolean;
  jlpt?: JlptLevel;
  /** Hạng phổ biến trên báo. */
  rankNews?: number;

  strokeCount: number;
  /** Số nét theo các dị bản, nếu có. */
  strokeCounts?: number[];

  components: string[];
  meanings: string[]; // tiếng Việt

  kunyomi: KanjiReading[];
  onyomi: KanjiReading[];
  nanori?: string[];

  /** Mọi âm đọc (kể cả bất quy tắc) kèm điểm phổ biến. */
  readings: KanjiReadingScore[];
  /** Điểm phổ biến tổng của kanji. */
  score?: number;

  structuralCategory?: StructuralCategory;
  keiseiPhonetic?: string[];
  keiseiSemantic?: string[];

  // exampleWords (từ chứa kanji này): TÍNH lúc query qua heading_lookup, không lưu.
}
