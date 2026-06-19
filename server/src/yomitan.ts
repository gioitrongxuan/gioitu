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

/** Recursively flatten Yomitan structured content into plain text. */
export function flattenGloss(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(flattenGloss).join(" ");
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if ("content" in obj) return flattenGloss(obj.content);
    if ("text" in obj && typeof obj.text === "string") return obj.text;
  }
  return "";
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
      const definitions = glossary.map(flattenGloss).map((s) => s.trim()).filter(Boolean);
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
