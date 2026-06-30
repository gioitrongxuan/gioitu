// KANJIDIC2 XML → KanjiEntry (thuần phần map; phần đọc file/DB ở kanjidicImport.ts).
// Port chuẩn hoá của ref/jisho-open (importing/kanjidic.ts) NHƯNG bỏ cross-ref từ
// (gioitu tính ví dụ-từ lúc query). Parse theo từng chunk <character> để tránh
// DOCTYPE và chặn bộ nhớ — KANJIDIC2 ~15MB, một lần nhập.
//
// Hai dữ liệu phụ thuộc ngôn ngữ tách riêng cho importer xử lý theo (native_lang):
//   - entry.meanings = nghĩa TIẾNG ANH (meaning không có m_lang).
//   - vietnamReadings = âm <reading r_type="vietnam"> (quốc ngữ) → fallback Hán-Việt.

import { parseStringPromise } from "xml2js";
import type { KanjiEntry, KanjiReading, StoredReadings } from "@/shared/kanji";
import type { JlptLevel, JouyouGrade } from "@/shared/jisho-tags";

// --- Shape thô từ xml2js (explicitArray: mọi node là mảng; attr/text theo key dưới) ---
const XML_OPTS = { attrkey: "attr", charkey: "text", explicitArray: true } as const;

interface RawReading {
  text: string;
  attr: { r_type: string };
}
type RawMeaning = string | { text: string; attr?: { m_lang?: string } };

export interface RawKanji {
  literal: [string];
  misc: [
    {
      grade?: [string];
      stroke_count: string[];
      freq?: [string];
      jlpt?: [string];
    },
  ];
  reading_meaning?: [
    {
      rmgroup?: [{ reading?: RawReading[]; meaning?: RawMeaning[] }];
      nanori?: string[];
    },
  ];
}

export interface MappedKanji {
  /** Phần cấu trúc (không phụ thuộc ngôn ngữ) + nghĩa EN; components/structural thêm sau. */
  entry: KanjiEntry;
  /** Âm Hán-Việt quốc ngữ từ KANJIDIC2, đã VIẾT HOA cho khớp Mazii (fallback). */
  vietnamReadings: string[];
}

/** Tách từng <character>…</character> rồi parse riêng (bỏ qua header/DOCTYPE). */
export async function* iterateKanjidic(xml: string): AsyncGenerator<RawKanji> {
  const open = "<character>";
  const close = "</character>";
  let i = xml.indexOf(open);
  while (i >= 0) {
    const end = xml.indexOf(close, i);
    if (end < 0) break;
    const chunk = xml.slice(i, end + close.length);
    const obj = await parseStringPromise(chunk, XML_OPTS);
    yield obj.character as RawKanji;
    i = xml.indexOf(open, end);
  }
}

// KANJIDIC dùng "-" cho tiền/hậu tố okurigana; chuẩn hoá sang "～" như jisho.
const normalizeReading = (r: string) => r.replace(/-/g, "～");

export function mapKanjidicEntry(raw: RawKanji): MappedKanji {
  const misc = raw.misc[0];
  const onyomi: KanjiReading[] = [];
  const kunyomi: KanjiReading[] = [];
  const meanings: string[] = [];
  const vietnamReadings: string[] = [];
  let nanori: string[] | undefined;

  const rm = raw.reading_meaning?.[0];
  const group = rm?.rmgroup?.[0];
  for (const reading of group?.reading ?? []) {
    switch (reading.attr.r_type) {
      case "ja_on":
        onyomi.push({ text: normalizeReading(reading.text) });
        break;
      case "ja_kun":
        kunyomi.push({ text: normalizeReading(reading.text) });
        break;
      case "vietnam":
        vietnamReadings.push(reading.text.toUpperCase());
        break;
    }
  }
  for (const meaning of group?.meaning ?? []) {
    // Chỉ giữ nghĩa tiếng Anh (meaning không có thuộc tính m_lang → là chuỗi thuần).
    if (typeof meaning === "string") meanings.push(meaning);
  }
  if (rm?.nanori?.length) nanori = [...rm.nanori];

  const strokes = misc.stroke_count.map((s) => parseInt(s, 10));

  const entry: KanjiEntry = {
    literal: raw.literal[0],
    strokeCount: strokes[0],
    components: [],
    meanings,
    onyomi,
    kunyomi,
  };
  if (strokes.length > 1) entry.strokeCounts = strokes.slice(1);
  if (nanori) entry.nanori = nanori;

  // Cấp lớp (jouyou 1-6, "8"=thường dùng nâng cao→7, "9/10"=tên người).
  const grade = misc.grade ? parseInt(misc.grade[0], 10) : undefined;
  if (grade !== undefined) {
    if (grade <= 6) entry.jouyou = grade as JouyouGrade;
    else if (grade === 8) entry.jouyou = 7;
    else if (grade >= 9) entry.jinmeiyou = true;
  }

  // JLPT cũ (thang 4 mức) → thang 5 mức mới (port jisho): 1→1, 2→3, 3→4, 4→5.
  if (misc.jlpt) {
    const old = parseInt(misc.jlpt[0], 10);
    entry.jlpt = (old >= 2 ? old + 1 : 1) as JlptLevel;
  }

  if (misc.freq) entry.rankNews = parseInt(misc.freq[0], 10);

  const score = scoreEntry(entry);
  if (score !== 0) entry.score = score;

  return { entry, vietnamReadings };
}

/** Đóng gói on/kun/nanori vào shape cột JSONB `kanji.readings`. */
export function toStoredReadings(entry: KanjiEntry): StoredReadings {
  const stored: StoredReadings = { onyomi: entry.onyomi, kunyomi: entry.kunyomi };
  if (entry.nanori?.length) stored.nanori = entry.nanori;
  return stored;
}

// --- Điểm phổ biến (port scoreCurve/scoreEntry của jisho, bỏ phần phụ thuộc từ) ---

function scoreCurve(n: number, min: number, max: number, minScore: number, maxScore: number): number {
  const t = Math.max(0, Math.min(1, (n - min) / (max - min)));
  const curve = t * t * t;
  return Math.max(0, Math.ceil(minScore + (maxScore - minScore) * curve));
}

function scoreEntry(entry: KanjiEntry): number {
  let score = 0;
  if (entry.jlpt !== undefined) score += scoreCurve(entry.jlpt, 5, 1, 35000, 1000);
  if (entry.jouyou !== undefined) score += scoreCurve(entry.jouyou, 1, 7, 10000, 1000);
  if (entry.jinmeiyou) score += 250;
  if (entry.rankNews !== undefined) score += scoreCurve(entry.rankNews, 1, 2501, 5000, 100);
  if (entry.meanings.length > 0) score += 1;
  return Math.round(score);
}
