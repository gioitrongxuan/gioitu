// Xuất một từ điển local ra archive Yomitan chuẩn (#70 — 5.1). Đối xứng với phần
// import trong data/yomitan.ts: dựng `index.json` + các dòng `term_bank` từ
// `DictEntry`. Thuần — không chạm IndexedDB/DOM — nên test được không cần môi trường.
//
// Mỗi `Sense` → một dòng term-bank (đúng cách importer gộp dòng → sense). Lưu ý:
// `examples`/`info` là phần app tự làm giàu, KHÔNG thuộc bộ tuple Yomitan nên
// không xuất ra được; glossary + tag từ loại + rules mới là dữ liệu chuẩn.

import { DictEntry, LocalDictionary } from "@/shared/db";
import { GlossaryNode, Sense } from "@/shared/structured-content";

/**
 * Một dòng term-bank Yomitan, đối xứng với `YomitanTermBankEntry` bên importer:
 * [term, reading, definitionTags, rules, score, glossary, sequence, termTags].
 */
export type YomitanTermBankRow = [
  string,
  string,
  string,
  string,
  number,
  GlossaryNode[],
  number,
  string,
];

/** Nội dung `index.json` của một archive Yomitan (format 3). */
export interface YomitanIndex {
  title: string;
  format: 3;
  revision: string;
  sequenced: boolean;
  sourceLanguage: string;
  targetLanguage: string;
}

export interface YomitanArchiveFiles {
  index: YomitanIndex;
  termBank: YomitanTermBankRow[];
}

/** Các sense của một entry; entry cũ chỉ có `definitions` → coi như một sense. */
function sensesOf(entry: DictEntry): Sense[] {
  if (entry.senses && entry.senses.length) return entry.senses;
  return [{ tags: [], glossary: entry.definitions ?? [] }];
}

/**
 * Đổi một entry thành các dòng term-bank (một dòng mỗi sense), cùng chung
 * `sequence` để client Yomitan gộp lại thành một mục. Bỏ sense glossary rỗng vì
 * importer cũng loại dòng không có gloss.
 */
export function entryToRows(entry: DictEntry, sequence: number): YomitanTermBankRow[] {
  const reading = entry.reading ?? "";
  const rules = entry.rules ?? "";
  const score = entry.score ?? 0;
  const termTags = (entry.termTags ?? []).join(" ");
  return sensesOf(entry)
    .filter((sense) => (sense.glossary ?? []).length > 0)
    .map((sense) => [
      entry.term,
      reading,
      sense.tags.join(" "),
      rules,
      score,
      sense.glossary,
      sequence,
      termTags,
    ]);
}

/** Toàn bộ dòng term-bank cho một danh sách entry (sequence chạy từ 1). */
export function buildTermBank(entries: DictEntry[]): YomitanTermBankRow[] {
  const rows: YomitanTermBankRow[] = [];
  entries.forEach((entry, i) => rows.push(...entryToRows(entry, i + 1)));
  return rows;
}

export function buildIndex(dict: LocalDictionary, revision: string): YomitanIndex {
  return {
    title: dict.title,
    format: 3,
    revision,
    sequenced: true,
    sourceLanguage: dict.term_lang,
    targetLanguage: dict.native_lang,
  };
}

/** Dựng nội dung hai file của một archive Yomitan (chưa nén). */
export function buildYomitanFiles(
  dict: LocalDictionary,
  entries: DictEntry[],
  revision: string,
): YomitanArchiveFiles {
  return { index: buildIndex(dict, revision), termBank: buildTermBank(entries) };
}
