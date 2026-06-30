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
  /** Nghĩa theo `native_lang` của dòng (EN từ KANJIDIC2, VI từ Mazii…). */
  meanings: string[];
  /** Âm Hán-Việt (Mazii chính, KANJIDIC2 `vietnam` làm fallback). Chỉ dòng tiếng Việt. */
  hanViet?: string[];

  kunyomi: KanjiReading[];
  onyomi: KanjiReading[];
  nanori?: string[];

  /** Điểm phổ biến mỗi âm đọc — TÍNH lúc query (cross-ref từ), không lưu. */
  readings?: KanjiReadingScore[];
  /** Điểm phổ biến tổng của kanji. */
  score?: number;

  structuralCategory?: StructuralCategory;
  keiseiPhonetic?: string[];
  keiseiSemantic?: string[];

  // exampleWords (từ chứa kanji này): TÍNH lúc query qua heading_lookup, không lưu.
}

/** Một từ ví dụ chứa kanji (tính lúc query, hiển thị ở trang kanji). */
export interface KanjiExampleWord {
  base: string;
  reading?: string;
  hanViet?: string;
  sense?: string;
}

/** Trả về cho GET /api/kanji/:literal — kanji + các từ ví dụ. */
export interface KanjiLookupResult {
  kanji: KanjiEntry;
  examples: KanjiExampleWord[];
}

// --- Shape JSONB lưu trong bảng `kanji` (bảng chỉ có 1 cột readings/structural) ---

/** Cột `kanji.readings`: gộp on/kun/nanori (âm đọc thô, không phải điểm phổ biến). */
export interface StoredReadings {
  onyomi: KanjiReading[];
  kunyomi: KanjiReading[];
  nanori?: string[];
}

/** Cột `kanji.structural`: gộp phân loại cấu tạo + phần nghĩa/âm của chữ hình thanh. */
export interface StoredStructural {
  category?: StructuralCategory;
  keiseiPhonetic?: string[];
  keiseiSemantic?: string[];
}
