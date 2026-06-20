// Server-side Yomitan dictionary parsing (SPEC 2.A), forward-only.
//
// A Yomitan `.zip` contains `term_bank_*.json` files. Each term bank is an
// array of entries shaped like:
//   [term, reading, definitionTags, rules, score, glossary[], sequence, termTags]
// `glossary` items are either plain strings or Yomitan "structured content"
// objects; we flatten both to plain text glosses.
//
// This module is pure (no DB / no Express) so it can be unit-tested directly.

import JSZip from "jszip";

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
  sourceLanguage?: string;
  targetLanguage?: string;
}

export interface ParsedDictEntry {
  term: string;
  reading?: string;
  definitions: string[];
}

export interface ParsedDictionary {
  title: string;
  term_lang: string;
  native_lang: string;
  entries: ParsedDictEntry[];
}

// Wiktionary-to-Yomitan / Kaikki dictionaries (wty-ja-vi) label their structured
// content via `data.content`: the real definitions live in a `glosses` list,
// while etymology/examples sit in collapsible <details> and an attribution
// `backlink` trails each entry. Flattening the whole tree buried the meaning
// (e.g. "…Từ nguyên… Ăn. Wiktionary | Kaikki"), so we target the `glosses`
// section and drop the scaffolding. Mirrors src/shared/structured-content.ts.
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

/** Collect plain text, dropping attribution/tag chips and (optionally) <details>. */
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

/** Flatten one glossary node to clean plain text (definitions only). */
export function flattenGloss(node: unknown): string {
  if (node && typeof node === "object" && (node as { type?: string }).type === "structured-content") {
    const glosses = findSection((node as { content: unknown }).content, SECTION_GLOSSES);
    if (glosses) return normalizeText(collectText(glosses, true));
    return normalizeText(collectText((node as { content: unknown }).content, false));
  }
  return normalizeText(collectText(node, false));
}

/**
 * Extract clean definition lines from a glossary array — one line per sense when
 * the entry exposes a labelled `glosses` list, otherwise one line per node.
 */
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

/**
 * Parse a Yomitan archive into a flat list of dictionary entries. The language
 * pair comes from the explicit override first (the pair the user selected),
 * then from the archive's index.json, then a sane default.
 */
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

  const term_lang = opts.term_lang ?? meta.sourceLanguage ?? "en";
  const native_lang = opts.native_lang ?? meta.targetLanguage ?? "vi";

  // Collapse duplicate terms (multiple banks / sense rows) into one entry,
  // matching the single-row-per-term shape of the `dict` table.
  const byTerm = new Map<string, ParsedDictEntry>();

  const bankFiles = Object.keys(zip.files)
    .filter((name) => /term_bank_\d+\.json$/.test(name))
    .sort();

  for (const name of bankFiles) {
    const content = await zip.files[name].async("string");
    const bank = JSON.parse(content) as YomitanTermBankEntry[];
    for (const row of bank) {
      const term = row[0];
      const reading = row[1] || undefined;
      const glossary = (row[5] ?? []) as unknown[];
      const definitions = extractGlossLines(glossary);
      if (!term || definitions.length === 0) continue;

      const existing = byTerm.get(term);
      if (existing) {
        for (const d of definitions) {
          if (!existing.definitions.includes(d)) existing.definitions.push(d);
        }
        if (!existing.reading && reading) existing.reading = reading;
      } else {
        byTerm.set(term, { term, reading, definitions });
      }
    }
  }

  return {
    title: meta.title ?? "Từ điển Yomitan",
    term_lang,
    native_lang,
    entries: [...byTerm.values()],
  };
}
