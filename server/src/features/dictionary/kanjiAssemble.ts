// Ráp KanjiEntry từ một dòng bảng `kanji`. Thuần (nhận object thường, không chạm
// DB) → test được không cần Postgres. Bảng chỉ có cột `readings`/`structural`
// dạng JSONB nên on/kun/nanori gộp trong `readings`, phân loại cấu tạo gộp trong
// `structural`. `readings` (điểm phổ biến mỗi âm) và exampleWords là dữ liệu TÍNH
// lúc query — không nằm ở đây.

import type {
  KanjiEntry,
  StoredReadings,
  StoredStructural,
} from "@/shared/kanji";
import type { JlptLevel, JouyouGrade } from "@/shared/jisho-tags";

// pg parse sẵn cột JSONB; BIGINT-like để số. Các cột rỗng về null.
export interface KanjiRow {
  literal: string;
  term_lang: string;
  native_lang: string;
  jouyou: number | null;
  jinmeiyou: boolean | null;
  jlpt: number | null;
  rank_news: number | null;
  stroke_count: number | null;
  stroke_counts: number[] | null;
  meanings: string[] | null;
  readings: StoredReadings | null;
  components: string[] | null;
  structural: StoredStructural | null;
  han_viet: string[] | null;
  score: number | null;
}

export function assembleKanji(row: KanjiRow): KanjiEntry {
  const readings = row.readings ?? { onyomi: [], kunyomi: [] };
  const structural = row.structural ?? {};

  const entry: KanjiEntry = {
    literal: row.literal,
    strokeCount: row.stroke_count ?? 0,
    components: row.components ?? [],
    meanings: row.meanings ?? [],
    onyomi: readings.onyomi ?? [],
    kunyomi: readings.kunyomi ?? [],
  };

  if (row.jouyou != null) entry.jouyou = row.jouyou as JouyouGrade;
  if (row.jinmeiyou != null) entry.jinmeiyou = row.jinmeiyou;
  if (row.jlpt != null) entry.jlpt = row.jlpt as JlptLevel;
  if (row.rank_news != null) entry.rankNews = row.rank_news;
  if (row.stroke_counts?.length) entry.strokeCounts = row.stroke_counts;
  if (readings.nanori?.length) entry.nanori = readings.nanori;
  if (row.han_viet?.length) entry.hanViet = row.han_viet;
  if (structural.category) entry.structuralCategory = structural.category;
  if (structural.keiseiPhonetic?.length) entry.keiseiPhonetic = structural.keiseiPhonetic;
  if (structural.keiseiSemantic?.length) entry.keiseiSemantic = structural.keiseiSemantic;
  if (row.score != null) entry.score = row.score;

  return entry;
}
