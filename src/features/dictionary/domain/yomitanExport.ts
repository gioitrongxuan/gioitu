// Xuất một từ điển local ra archive Yomitan chuẩn (#70 — 5.1). Đối xứng với phần
// import trong data/yomitan.ts: dựng `index.json` + các dòng `term_bank` từ
// `DictEntry`. Thuần — không chạm IndexedDB/DOM — nên test được không cần môi trường.
//
// Mỗi `Sense` → một dòng term-bank (đúng cách importer gộp dòng → sense). Lưu ý:
// `examples`/`info` là phần app tự làm giàu, KHÔNG thuộc bộ tuple Yomitan nên
// không xuất ra được; glossary + tag từ loại + rules mới là dữ liệu chuẩn.

import { DictEntry, LocalDictionary } from "@/shared/db";
import { GlossaryNode, Sense } from "@/shared/structured-content";

// Ví dụ (examples) và giải thích/từ liên quan (info) KHÔNG thuộc bộ tuple Yomitan.
// Để export không mất chúng, ta nhét vào glossary dưới dạng structured-content có
// GẮN NHÃN riêng; importer nhận nhãn thì khôi phục lại đúng trường, và loại khỏi
// phần nghĩa hiển thị. Từ điển Yomitan thật không có nhãn này nên không bị ảnh hưởng.
export const EXTRA_EXAMPLE = "gioitu-example";
export const EXTRA_INFO = "gioitu-note";
const EXTRA_EXAMPLE_SEP = "::";

/** Nhãn `data.content` của một node structured-content, nếu có. */
function extraMarker(node: GlossaryNode): string | undefined {
  if (typeof node !== "object" || node === null) return undefined;
  const outer = node as { type?: string; content?: unknown };
  if (outer.type !== "structured-content" || typeof outer.content !== "object" || outer.content === null) {
    return undefined;
  }
  const inner = outer.content as { data?: { content?: unknown } };
  const label = inner.data?.content;
  return typeof label === "string" ? label : undefined;
}

/** Nội dung văn bản của một node extras (đã biết là có nhãn). */
function extraText(node: GlossaryNode): string {
  const inner = (node as { content?: { content?: unknown } }).content;
  const text = inner && typeof inner === "object" ? (inner as { content?: unknown }).content : undefined;
  return typeof text === "string" ? text : "";
}

/** Các node glossary mang ví dụ + info của một sense (rỗng nếu không có). */
function extraGlossary(sense: Sense): GlossaryNode[] {
  const nodes: GlossaryNode[] = [];
  for (const ex of sense.examples ?? []) {
    const text = ex.vi ? `${ex.ja} ${EXTRA_EXAMPLE_SEP} ${ex.vi}` : ex.ja;
    nodes.push({ type: "structured-content", content: { tag: "div", data: { content: EXTRA_EXAMPLE }, content: text } });
  }
  for (const line of sense.info ?? []) {
    nodes.push({ type: "structured-content", content: { tag: "div", data: { content: EXTRA_INFO }, content: line } });
  }
  return nodes;
}

export interface ExtractedExtras {
  /** Glossary còn lại (đã bỏ node ví dụ/info) — phần nghĩa thật. */
  glossary: GlossaryNode[];
  examples: { ja: string; vi: string }[];
  info: string[];
}

/** Tách ví dụ + info do gioitu nhúng ra khỏi glossary (dùng khi import lại). */
export function extractExtras(glossary: GlossaryNode[]): ExtractedExtras {
  const rest: GlossaryNode[] = [];
  const examples: { ja: string; vi: string }[] = [];
  const info: string[] = [];
  for (const node of glossary) {
    const marker = extraMarker(node);
    if (marker === EXTRA_EXAMPLE) {
      const text = extraText(node);
      const at = text.indexOf(EXTRA_EXAMPLE_SEP);
      examples.push(
        at >= 0
          ? { ja: text.slice(0, at).trim(), vi: text.slice(at + EXTRA_EXAMPLE_SEP.length).trim() }
          : { ja: text.trim(), vi: "" },
      );
    } else if (marker === EXTRA_INFO) {
      const line = extraText(node).trim();
      if (line) info.push(line);
    } else {
      rest.push(node);
    }
  }
  return { glossary: rest, examples, info };
}

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
      // Nghĩa + ví dụ/info nhúng kèm (nhãn riêng) để export không mất trường nào.
      [...sense.glossary, ...extraGlossary(sense)],
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
