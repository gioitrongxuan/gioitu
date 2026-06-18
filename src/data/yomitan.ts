// Yomitan dictionary import (SPEC 2.A) + reverse index build (SPEC 2.B).
//
// A Yomitan `.zip` contains `term_bank_*.json` files. Each term bank is an
// array of entries shaped like:
//   [term, reading, definitionTags, rules, score, glossary[], sequence, termTags]
// `glossary` items are strings or Yomitan "structured content" objects.

import JSZip from "jszip";
import { getDb, DictEntry, ReverseToken } from "./db";

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
  reverseTokenCount: number;
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
 * Tokenize a native-language meaning into lowercased tokens for the reverse
 * index. Splits on whitespace and punctuation while keeping Unicode letters
 * (works for Vietnamese, accented Latin, CJK runs, etc.).
 */
export function tokenizeMeaning(text: string): string[] {
  const lowered = text.toLowerCase();
  const raw = lowered.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  // De-duplicate while preserving simple, short stop-token filtering.
  return Array.from(new Set(raw)).filter((t) => t.length >= 1);
}

/**
 * Import a Yomitan dictionary archive into IndexedDB, building both the forward
 * `terms` store and the `reverse_tokens` store. Falls back to the file/archive
 * languages when `index.json` does not declare them.
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
  const reverse = new Map<string, Set<string>>();

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

      for (const def of definitions) {
        for (const token of tokenizeMeaning(def)) {
          let set = reverse.get(token);
          if (!set) {
            set = new Set();
            reverse.set(token, set);
          }
          set.add(term);
        }
      }
    }
  }

  // Persist forward + reverse stores.
  const db = await getDb();
  {
    const tx = db.transaction("terms", "readwrite");
    for (const e of dictEntries) await tx.store.put(e);
    await tx.done;
  }
  {
    const tx = db.transaction("reverse_tokens", "readwrite");
    for (const [token, set] of reverse) {
      const existing = await tx.store.get(token);
      const merged = existing
        ? Array.from(new Set([...existing.terms, ...set]))
        : Array.from(set);
      const value: ReverseToken = { token, terms: merged };
      await tx.store.put(value);
    }
    await tx.done;
  }

  return {
    title: meta.title ?? "Yomitan dictionary",
    termCount: dictEntries.length,
    reverseTokenCount: reverse.size,
    term_lang,
    native_lang,
  };
}

/** Forward lookup (Case 1): term → definition. */
export async function lookupTerm(term: string): Promise<DictEntry | undefined> {
  const db = await getDb();
  return db.get("terms", term);
}

/** Live-suggestion prefix search over imported terms. */
export async function suggestTerms(prefix: string, limit = 10): Promise<DictEntry[]> {
  if (!prefix) return [];
  const db = await getDb();
  const range = IDBKeyRange.bound(prefix, prefix + "￿");
  const out: DictEntry[] = [];
  let cursor = await db.transaction("terms").store.openCursor(range);
  while (cursor && out.length < limit) {
    out.push(cursor.value);
    cursor = await cursor.continue();
  }
  return out;
}

/**
 * Reverse lookup (Case 2): native-language query → candidate target terms.
 * Tokenizes the query and intersects the per-token term lists, ranking by how
 * many query tokens each term matches.
 */
export async function reverseLookup(query: string, limit = 20): Promise<DictEntry[]> {
  const db = await getDb();
  const tokens = tokenizeMeaning(query);
  if (tokens.length === 0) return [];

  const score = new Map<string, number>();
  for (const token of tokens) {
    const rec = await db.get("reverse_tokens", token);
    if (!rec) continue;
    for (const term of rec.terms) {
      score.set(term, (score.get(term) ?? 0) + 1);
    }
  }

  const ranked = Array.from(score.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([term]) => term);

  const out: DictEntry[] = [];
  for (const term of ranked) {
    const e = await db.get("terms", term);
    if (e) out.push(e);
  }
  return out;
}

/** Whether any dictionary has been imported into IndexedDB. */
export async function hasLocalDictionary(): Promise<boolean> {
  const db = await getDb();
  const count = await db.count("terms");
  return count > 0;
}
