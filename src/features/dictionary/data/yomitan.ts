// Yomitan dictionary import + look-up (SPEC 2.A), client side / IndexedDB.
//
// Import (like Yomitan): read a Yomitan `.zip` (from a File or a URL), parse its
//   index.json metadata and term_bank_*.json entries, and store them PRESERVING
//   their structured-content glossary, part-of-speech tags and word-type rules.
//   Multiple senses of a term are merged. Each import is recorded in a local
//   dictionary registry so it can be listed / removed.
//
// Look-up (like Yomitan): `findTerms` deinflects the query (食べた → 食べる),
//   looks every candidate up, filters by word-type and returns ranked results
//   each annotated with the chain of inflection reasons.

import JSZip from "jszip";
import { getDb, DictEntry, LocalDictionary } from "@/shared/db";
import { GlossaryNode, Sense, glossaryToLines } from "@/shared/structured-content";
import { candidates, rulesMatchEntry } from "../domain/deinflect";

// A Yomitan term-bank row:
//   [term, reading, definitionTags, rules, score, glossary[], sequence, termTags]
type YomitanTermBankEntry = [
  string,
  string,
  string | null,
  string,
  number,
  GlossaryNode[],
  number,
  string,
];

interface IndexJson {
  title?: string;
  revision?: string;
  format?: number;
  version?: number;
  sourceLanguage?: string;
  targetLanguage?: string;
}

export interface ImportResult {
  id: string;
  title: string;
  termCount: number;
  term_lang: string;
  native_lang: string;
}

function uuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return "dict-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

function splitTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw.split(/\s+/).filter(Boolean);
}

/**
 * Parse a Yomitan archive into per-term entries, merging the multiple
 * term-bank rows of a term into grouped senses (Yomitan-style).
 */
async function parseArchive(
  file: Blob | ArrayBuffer | Uint8Array,
  opts: { term_lang?: string; native_lang?: string },
): Promise<{ meta: IndexJson; term_lang: string; native_lang: string; entries: Map<string, DictEntry> }> {
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
  const title = meta.title ?? "Từ điển Yomitan";

  const entries = new Map<string, DictEntry>();
  const bankFiles = Object.keys(zip.files)
    .filter((name) => /term_bank_\d+\.json$/.test(name))
    .sort();

  for (const name of bankFiles) {
    const bank = JSON.parse(await zip.files[name].async("string")) as YomitanTermBankEntry[];
    for (const row of bank) {
      const term = row[0];
      const reading = row[1] || undefined;
      const definitionTags = splitTags(row[2]);
      const rules = row[3] || undefined;
      const score = typeof row[4] === "number" ? row[4] : 0;
      const glossary = (row[5] ?? []) as GlossaryNode[];
      const termTags = splitTags(row[7]);

      if (!term || glossaryToLines(glossary).length === 0) continue;

      const sense: Sense = { tags: definitionTags, glossary, dictionary: title };
      const existing = entries.get(term);
      if (existing) {
        existing.senses!.push(sense);
        existing.definitions.push(...glossary);
        if (!existing.reading && reading) existing.reading = reading;
        if (!existing.rules && rules) existing.rules = rules;
        if (termTags.length) existing.termTags = [...new Set([...(existing.termTags ?? []), ...termTags])];
        if (score > (existing.score ?? 0)) existing.score = score;
      } else {
        entries.set(term, {
          term,
          reading,
          definitions: [...glossary],
          senses: [sense],
          rules,
          termTags: termTags.length ? termTags : undefined,
          score,
          dictionary: title,
          term_lang,
          native_lang,
        });
      }
    }
  }

  return { meta, term_lang, native_lang, entries };
}

/**
 * Import a Yomitan dictionary archive into IndexedDB's `terms` store, scoped to
 * a language pair, and register it in the local dictionary list.
 */
export async function importYomitanZip(
  file: Blob | ArrayBuffer | Uint8Array,
  opts: { term_lang?: string; native_lang?: string } = {},
): Promise<ImportResult> {
  const { meta, term_lang, native_lang, entries } = await parseArchive(file, opts);
  const id = uuid();
  const title = meta.title ?? "Từ điển Yomitan";

  const db = await getDb();
  const tx = db.transaction(["terms", "dictionaries"], "readwrite");
  for (const entry of entries.values()) {
    await tx.objectStore("terms").put({ ...entry, dictId: id });
  }
  const dict: LocalDictionary = {
    id,
    title,
    term_lang,
    native_lang,
    termCount: entries.size,
    importedAt: Date.now(),
    revision: meta.revision,
  };
  await tx.objectStore("dictionaries").put(dict);
  await tx.done;

  return { id, title, termCount: entries.size, term_lang, native_lang };
}

/**
 * Import a Yomitan dictionary from a URL (downloads the `.zip`, then imports).
 * The host must allow cross-origin downloads (CORS) for browser fetches.
 */
export async function importYomitanUrl(
  url: string,
  opts: { term_lang?: string; native_lang?: string } = {},
): Promise<ImportResult> {
  let res: Response;
  try {
    res = await fetch(url, { redirect: "follow" });
  } catch {
    throw new Error("Không tải được URL (mạng hoặc CORS bị chặn)");
  }
  if (!res.ok) throw new Error(`Tải URL thất bại (HTTP ${res.status})`);
  const buf = await res.arrayBuffer();
  if (buf.byteLength === 0) throw new Error("URL trả về dữ liệu rỗng");
  return importYomitanZip(buf, opts);
}

/** List locally imported dictionaries (optionally for one pair). */
export async function listLocalDictionaries(
  term_lang?: string,
  native_lang?: string,
): Promise<LocalDictionary[]> {
  const db = await getDb();
  const all =
    term_lang && native_lang
      ? await db.getAllFromIndex("dictionaries", "by_pair", IDBKeyRange.only([term_lang, native_lang]))
      : await db.getAll("dictionaries");
  return all.sort((a, b) => b.importedAt - a.importedAt);
}

/** Remove a locally imported dictionary and all of its terms. */
export async function deleteLocalDictionary(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(["terms", "dictionaries"], "readwrite");
  const idx = tx.objectStore("terms").index("by_dict");
  let cursor = await idx.openCursor(IDBKeyRange.only(id));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.objectStore("dictionaries").delete(id);
  await tx.done;
}

/** Forward exact look-up within a language pair: term → entry. */
export async function lookupTerm(
  term: string,
  term_lang: string,
  native_lang: string,
): Promise<DictEntry | undefined> {
  const db = await getDb();
  return db.get("terms", [term_lang, native_lang, term]);
}

export interface TermResult {
  /** The dictionary entry found. */
  entry: DictEntry;
  /** Inflection reasons applied to reach it (empty for an exact match). */
  reasons: string[];
  /** The original text that was searched. */
  source: string;
}

/**
 * Yomitan-style look-up: deinflect the query, look every candidate up, keep the
 * grammatically valid matches and rank them (exact first, then by score, then
 * by the shortest inflection chain). Returns [] if nothing is found locally.
 */
export async function findTerms(
  text: string,
  term_lang: string,
  native_lang: string,
): Promise<TermResult[]> {
  const query = text.trim();
  if (!query) return [];

  const cands = candidates(query, term_lang);

  const db = await getDb();
  const byTerm = new Map<string, TermResult>();
  for (const cand of cands) {
    const entry = await db.get("terms", [term_lang, native_lang, cand.term]);
    if (!entry) continue;
    if (!rulesMatchEntry(cand.rules, entry.rules)) continue;
    const prev = byTerm.get(entry.term);
    // Prefer the candidate with the fewest reasons (closest to an exact match).
    if (!prev || cand.reasons.length < prev.reasons.length) {
      byTerm.set(entry.term, { entry, reasons: cand.reasons, source: query });
    }
  }

  return [...byTerm.values()].sort((a, b) => {
    if (a.reasons.length !== b.reasons.length) return a.reasons.length - b.reasons.length;
    return (b.entry.score ?? 0) - (a.entry.score ?? 0);
  });
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
