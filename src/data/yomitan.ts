// Yomitan dictionary import (SPEC 2.A), forward-only, scoped per language pair.
//
// A Yomitan `.zip` contains `term_bank_*.json` files. Each term bank is an
// array of entries shaped like:
//   [term, reading, definitionTags, rules, score, glossary[], sequence, termTags]
// `glossary` items are strings or Yomitan "structured content" objects.

import JSZip from "jszip";
import { getDb, DictEntry } from "./db";

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

export interface ImportResult {
  title: string;
  termCount: number;
  term_lang: string;
  native_lang: string;
}

/** Recursively flatten Yomitan structured content into plain text. */
function flattenGloss(node: unknown): string {
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
 * Import a Yomitan dictionary archive into IndexedDB's `terms` store, scoped to
 * a language pair. `term_lang`/`native_lang` come from the explicit options
 * first (the pair the user selected), then the archive's index.json.
 */
export async function importYomitanZip(
  file: Blob | ArrayBuffer | Uint8Array,
  opts: { term_lang?: string; native_lang?: string } = {},
): Promise<ImportResult> {
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

  const dictEntries: DictEntry[] = [];

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
      dictEntries.push({ term, reading, definitions, term_lang, native_lang });
    }
  }

  const db = await getDb();
  const tx = db.transaction("terms", "readwrite");
  for (const e of dictEntries) await tx.store.put(e);
  await tx.done;

  return {
    title: meta.title ?? "Yomitan dictionary",
    termCount: dictEntries.length,
    term_lang,
    native_lang,
  };
}

/** Forward lookup within a language pair: term → definition. */
export async function lookupTerm(
  term: string,
  term_lang: string,
  native_lang: string,
): Promise<DictEntry | undefined> {
  const db = await getDb();
  return db.get("terms", [term_lang, native_lang, term]);
}

/** Live-suggestion prefix search within a language pair. */
export async function suggestTerms(
  prefix: string,
  term_lang: string,
  native_lang: string,
  limit = 10,
): Promise<DictEntry[]> {
  if (!prefix) return [];
  const db = await getDb();
  const range = IDBKeyRange.bound(
    [term_lang, native_lang, prefix],
    [term_lang, native_lang, prefix + "￿"],
  );
  const out: DictEntry[] = [];
  let cursor = await db.transaction("terms").store.openCursor(range);
  while (cursor && out.length < limit) {
    out.push(cursor.value);
    cursor = await cursor.continue();
  }
  return out;
}

/** Whether a dictionary for the given pair has been imported into IndexedDB. */
export async function hasLocalDictionary(term_lang: string, native_lang: string): Promise<boolean> {
  const db = await getDb();
  const count = await db.countFromIndex("terms", "by_pair", IDBKeyRange.only([term_lang, native_lang]));
  return count > 0;
}

/** Count of locally imported terms for a pair. */
export async function localTermCount(term_lang: string, native_lang: string): Promise<number> {
  const db = await getDb();
  return db.countFromIndex("terms", "by_pair", IDBKeyRange.only([term_lang, native_lang]));
}
