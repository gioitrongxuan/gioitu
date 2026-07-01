// Server-side Yomitan dictionary parsing (SPEC 2.A), forward-only.
//
// Một `.zip` Yomitan chứa các `term_bank_*.json`. Mỗi dòng:
//   [term, reading, definitionTags, rules, score, glossary[], sequence, termTags]
// `glossary` là chuỗi hoặc "structured content". TRƯỚC ĐÂY ta làm phẳng tất cả về
// chuỗi; giờ GIỮ NGUYÊN cây structured content theo từng sense (để UI render giàu
// như jisho), đồng thời vẫn xuất bản phẳng `definitions` để tìm kiếm/fallback.
//
// Module thuần (no DB / no Express) — test trực tiếp được. Đọc từ thư mục (Yomitan
// đã giải nén, vd ref/data_mazii/JMdict_english) qua parseYomitanDir.

import JSZip from "jszip";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

type YomitanTermBankEntry = [
  string, // term
  string, // reading
  string | null, // definition tags
  string, // rules
  number, // score
  unknown[], // glossary
  number, // sequence
  string, // term tags
];

interface IndexJson {
  title?: string;
  revision?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
}

/** Một sense: mã POS/định-nghĩa + các node glossary (giữ structured content). */
export interface ParsedSense {
  tags: string[];
  glossary: unknown[];
}

export interface ParsedDictEntry {
  term: string;
  reading?: string;
  senses: ParsedSense[];
  /** Bản phẳng (mỗi sense một/nhiều dòng) cho tìm kiếm / fallback. */
  definitions: string[];
  termTags: string[];
  /** Điểm phổ biến Yomitan (row[4]); một entry gộp nhiều dòng → lấy MAX. Dùng xếp hạng. */
  score: number;
}

export interface ParsedDictionary {
  title: string;
  revision?: string;
  term_lang: string;
  native_lang: string;
  entries: ParsedDictEntry[];
}

const SECTION_GLOSSES = "glosses";
const NOISE_SECTIONS = new Set(["backlink", "attribution", "tag", "tags"]);
const BLOCK_TAGS = new Set(["div", "p", "ol", "ul", "li", "tr", "table", "thead", "tbody", "br", "details"]);

function dataContent(obj: Record<string, unknown>): string | undefined {
  const data = obj.data;
  if (data && typeof data === "object") {
    const c = (data as Record<string, unknown>).content;
    if (typeof c === "string") return c;
  }
  return undefined;
}

function findSection(node: unknown, label: string): Record<string, unknown> | null {
  if (node == null || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const c of node) {
      const f = findSection(c, label);
      if (f) return f;
    }
    return null;
  }
  const obj = node as Record<string, unknown>;
  if (dataContent(obj) === label) return obj;
  return "content" in obj ? findSection(obj.content, label) : null;
}

function collectText(node: unknown, skipDetails: boolean): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map((c) => collectText(c, skipDetails)).join("");
  const obj = node as Record<string, unknown>;
  if (obj.type === "image") return obj.alt ? `[${String(obj.alt)}]` : "";
  if (typeof obj.text === "string") return obj.text;
  const label = dataContent(obj);
  if (label && NOISE_SECTIONS.has(label)) return "";
  if (skipDetails && obj.tag === "details") return "";
  if ("content" in obj) {
    const sep = typeof obj.tag === "string" && BLOCK_TAGS.has(obj.tag) ? "\n" : "";
    return collectText(obj.content, skipDetails) + sep;
  }
  return "";
}

function normalizeText(s: string): string {
  return s.replace(/[ \t]+\n/g, "\n").replace(/\n{2,}/g, "\n").trim();
}

export function flattenGloss(node: unknown): string {
  if (node && typeof node === "object" && (node as { type?: string }).type === "structured-content") {
    const glosses = findSection((node as { content: unknown }).content, SECTION_GLOSSES);
    if (glosses) return normalizeText(collectText(glosses, true));
    return normalizeText(collectText((node as { content: unknown }).content, false));
  }
  return normalizeText(collectText(node, false));
}

/** Tách các dòng nghĩa sạch từ một mảng glossary (một dòng/sense khi có list `glosses`). */
export function extractGlossLines(glossary: unknown[]): string[] {
  const out: string[] = [];
  for (const g of glossary) {
    if (g && typeof g === "object" && (g as { type?: string }).type === "structured-content") {
      const glosses = findSection((g as { content: unknown }).content, SECTION_GLOSSES);
      if (glosses && "content" in glosses) {
        const items = Array.isArray(glosses.content) ? glosses.content : [glosses.content];
        for (const li of items) {
          const line = normalizeText(collectText(li, true));
          if (line) out.push(line);
        }
        continue;
      }
    }
    const line = flattenGloss(g).trim();
    if (line) out.push(line);
  }
  return out;
}

const splitTags = (s: string | null | undefined): string[] =>
  (s ?? "").split(/\s+/).map((t) => t.trim()).filter(Boolean);

/**
 * Gộp dòng term-bank thành entry theo (term, reading), GIỮ structured content.
 * Reading rỗng (Yomitan: "không xác định") fold vào entry cùng term có reading;
 * reading khác nhau → entry riêng (giữ phân biệt từ đồng âm). O(số reading/term).
 */
function buildEntries(banks: YomitanTermBankEntry[][]): ParsedDictEntry[] {
  const out: ParsedDictEntry[] = [];
  const byTerm = new Map<string, ParsedDictEntry[]>();

  const findTarget = (term: string, reading: string): ParsedDictEntry | null => {
    const list = byTerm.get(term);
    if (!list) return null;
    if (reading) {
      const same = list.find((e) => (e.reading ?? "") === reading);
      if (same) return same;
      const empty = list.find((e) => !e.reading);
      if (empty) {
        empty.reading = reading;
        return empty;
      }
      return null;
    }
    return list[0];
  };

  for (const bank of banks) {
    for (const row of bank) {
      const term = row[0];
      const reading = row[1] || "";
      const glossary = (row[5] ?? []) as unknown[];
      const lines = extractGlossLines(glossary);
      if (!term || lines.length === 0) continue;

      const sense: ParsedSense = { tags: splitTags(row[2]), glossary };
      const termTags = splitTags(row[7]);
      const score = typeof row[4] === "number" ? row[4] : 0;

      const target = findTarget(term, reading);
      if (target) {
        target.senses.push(sense);
        for (const d of lines) if (!target.definitions.includes(d)) target.definitions.push(d);
        for (const t of termTags) if (!target.termTags.includes(t)) target.termTags.push(t);
        if (score > target.score) target.score = score;
      } else {
        const entry: ParsedDictEntry = {
          term,
          reading: reading || undefined,
          senses: [sense],
          definitions: lines,
          termTags,
          score,
        };
        out.push(entry);
        const list = byTerm.get(term);
        if (list) list.push(entry);
        else byTerm.set(term, [entry]);
      }
    }
  }
  return out;
}

function resolveLangs(meta: IndexJson, opts: { term_lang?: string; native_lang?: string }) {
  return {
    title: meta.title ?? "Từ điển Yomitan",
    revision: meta.revision,
    term_lang: opts.term_lang ?? meta.sourceLanguage ?? "en",
    native_lang: opts.native_lang ?? meta.targetLanguage ?? "vi",
  };
}

/** Parse một archive .zip Yomitan. */
export async function parseYomitanZip(
  file: Buffer | ArrayBuffer | Uint8Array,
  opts: { term_lang?: string; native_lang?: string } = {},
): Promise<ParsedDictionary> {
  const zip = await JSZip.loadAsync(file);

  let meta: IndexJson = {};
  const indexFile = zip.file("index.json");
  if (indexFile) {
    try {
      meta = JSON.parse(await indexFile.async("string"));
    } catch {
      /* ignore malformed index */
    }
  }

  const bankNames = Object.keys(zip.files)
    .filter((name) => /term_bank_\d+\.json$/.test(name))
    .sort();
  const banks: YomitanTermBankEntry[][] = [];
  for (const name of bankNames) {
    banks.push(JSON.parse(await zip.files[name].async("string")) as YomitanTermBankEntry[]);
  }

  return { ...resolveLangs(meta, opts), entries: buildEntries(banks) };
}

/** Parse một thư mục Yomitan đã giải nén (index.json + term_bank_*.json). */
export async function parseYomitanDir(
  dir: string,
  opts: { term_lang?: string; native_lang?: string } = {},
): Promise<ParsedDictionary> {
  let meta: IndexJson = {};
  try {
    meta = JSON.parse(await readFile(join(dir, "index.json"), "utf8"));
  } catch {
    /* ignore */
  }
  const files = (await readdir(dir)).filter((f) => /term_bank_\d+\.json$/.test(f)).sort();
  const banks: YomitanTermBankEntry[][] = [];
  for (const f of files) {
    banks.push(JSON.parse(await readFile(join(dir, f), "utf8")) as YomitanTermBankEntry[]);
  }
  return { ...resolveLangs(meta, opts), entries: buildEntries(banks) };
}
