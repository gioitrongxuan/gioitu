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
import {
  Pronunciation,
  TermFrequency,
  TermMetaEntry,
  TermMetaMode,
  TermMetaRow,
  frequencyRanks,
  ipaPronunciations,
} from "@/shared/term-meta";
import { candidates, rulesMatchEntry } from "../domain/deinflect";
import { fuzzyMatchDistance, fuzzyThreshold } from "../domain/fuzzy";
import { TagBankEntry, TagInfo, buildTagBank, resolveTags } from "../domain/tags";

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
  /** IPA/pitch/freq rows imported (a meta-only dict has termCount 0). */
  metaCount: number;
  term_lang: string;
  native_lang: string;
}

export function uuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return "dict-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

function splitTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw.split(/\s+/).filter(Boolean);
}

/**
 * Parse a Yomitan archive into entries keyed by term + reading: rows for the
 * same (term, reading) merge into grouped senses (Yomitan-style), while
 * homographs with different readings stay separate. A row with an empty reading
 * is "unspecified" and folds into the term's existing entry.
 */
async function parseArchive(
  file: Blob | ArrayBuffer | Uint8Array,
  opts: { term_lang?: string; native_lang?: string },
): Promise<{
  meta: IndexJson;
  term_lang: string;
  native_lang: string;
  entries: Map<string, DictEntry>;
  metaEntries: TermMetaEntry[];
}> {
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

  // Tag banks (like Yomitan): code → full name / category / notes. Used to
  // enrich each entry's part-of-speech & term tags for display.
  let tagBank: Map<string, TagInfo> | undefined;
  const tagFiles = Object.keys(zip.files)
    .filter((name) => /tag_bank_\d+\.json$/.test(name))
    .sort();
  if (tagFiles.length) {
    const rows: TagBankEntry[] = [];
    for (const name of tagFiles) {
      try {
        const bank = JSON.parse(await zip.files[name].async("string")) as TagBankEntry[];
        if (Array.isArray(bank)) rows.push(...bank);
      } catch {
        /* ignore a malformed tag bank — fall back to the built-in table */
      }
    }
    if (rows.length) tagBank = buildTagBank(rows);
  }

  // Entries keyed by JSON [term, reading]; `byTerm` indexes them by term alone so
  // an empty-reading row can fold into an existing entry and a later populated
  // reading can back-fill a reading-less one. Readings are normalised to a
  // string ("") so they are always a valid component of the `terms` key path.
  const entries = new Map<string, DictEntry>();
  const byTerm = new Map<string, DictEntry[]>();
  const keyOf = (t: string, r: string) => JSON.stringify([t, r]);
  const addEntry = (e: DictEntry) => {
    entries.set(keyOf(e.term, e.reading ?? ""), e);
    const list = byTerm.get(e.term);
    if (list) list.push(e);
    else byTerm.set(e.term, [e]);
  };

  const bankFiles = Object.keys(zip.files)
    .filter((name) => /term_bank_\d+\.json$/.test(name))
    .sort();

  for (const name of bankFiles) {
    const bank = JSON.parse(await zip.files[name].async("string")) as YomitanTermBankEntry[];
    for (const row of bank) {
      const term = row[0];
      const reading = row[1] || "";
      const definitionTags = splitTags(row[2]);
      const rules = row[3] || undefined;
      const score = typeof row[4] === "number" ? row[4] : 0;
      const glossary = (row[5] ?? []) as GlossaryNode[];
      const termTags = splitTags(row[7]);

      if (!term || glossaryToLines(glossary).length === 0) continue;

      // Which entry should this row merge into?
      let target: DictEntry | undefined;
      if (reading) {
        target = entries.get(keyOf(term, reading));
        if (!target) {
          // Back-fill a prior reading-less entry of the same term.
          const blank = entries.get(keyOf(term, ""));
          if (blank) {
            entries.delete(keyOf(term, ""));
            blank.reading = reading;
            entries.set(keyOf(term, reading), blank);
            target = blank;
          }
        }
      } else {
        // Empty reading is unspecified → fold into any existing entry.
        target = byTerm.get(term)?.[0];
      }

      const sense: Sense = { tags: definitionTags, glossary, dictionary: title };
      if (target) {
        target.senses!.push(sense);
        target.definitions.push(...glossary);
        if (!target.rules && rules) target.rules = rules;
        if (termTags.length) target.termTags = [...new Set([...(target.termTags ?? []), ...termTags])];
        if (score > (target.score ?? 0)) target.score = score;
      } else {
        addEntry({
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

  // Resolve every entry's tag codes (sense part-of-speech + term tags) against
  // the tag bank / built-in table, so the UI can show full names and colours.
  for (const entry of entries.values()) {
    const codes = new Set<string>();
    for (const sense of entry.senses ?? []) for (const t of sense.tags) codes.add(t);
    for (const t of entry.termTags ?? []) codes.add(t);
    const tagMeta = resolveTags(codes, tagBank);
    if (Object.keys(tagMeta).length) entry.tagMeta = tagMeta;
  }

  // Term-meta banks (IPA / pitch / freq): unlike term banks they add no
  // headwords; each row annotates a term that is looked up from a term bank.
  const metaEntries = await parseMetaBanks(zip, term_lang, native_lang, title);

  return { meta, term_lang, native_lang, entries, metaEntries };
}

const META_MODES: ReadonlySet<string> = new Set(["ipa", "pitch", "freq"]);

/** Read `term_meta_bank_*.json` rows into stored-meta entries (without dictId). */
async function parseMetaBanks(
  zip: JSZip,
  term_lang: string,
  native_lang: string,
  title: string,
): Promise<TermMetaEntry[]> {
  const metaFiles = Object.keys(zip.files)
    .filter((name) => /term_meta_bank_\d+\.json$/.test(name))
    .sort();

  const out: TermMetaEntry[] = [];
  for (const name of metaFiles) {
    let bank: TermMetaRow[];
    try {
      bank = JSON.parse(await zip.files[name].async("string")) as TermMetaRow[];
    } catch {
      continue; // skip a malformed meta bank rather than failing the whole import
    }
    if (!Array.isArray(bank)) continue;
    for (const row of bank) {
      const term = row[0];
      const mode = row[1];
      const data = row[2];
      if (!term || !META_MODES.has(mode)) continue;
      // The wty data carries its own `reading`; default to "" so it is always a
      // valid component of the composite key.
      const reading = typeof (data as { reading?: unknown })?.reading === "string"
        ? (data as { reading: string }).reading
        : "";
      out.push({ term, reading, mode: mode as TermMetaMode, data, term_lang, native_lang, dictionary: title });
    }
  }
  return out;
}

/**
 * Import a Yomitan dictionary archive into IndexedDB's `terms` store, scoped to
 * a language pair, and register it in the local dictionary list.
 */
export async function importYomitanZip(
  file: Blob | ArrayBuffer | Uint8Array,
  opts: { term_lang?: string; native_lang?: string } = {},
): Promise<ImportResult> {
  const { meta, term_lang, native_lang, entries, metaEntries } = await parseArchive(file, opts);
  const id = uuid();
  const title = meta.title ?? "Từ điển Yomitan";

  const db = await getDb();
  const tx = db.transaction(["terms", "dictionaries", "term_meta"], "readwrite");
  for (const entry of entries.values()) {
    await tx.objectStore("terms").put({ ...entry, dictId: id });
  }
  for (const metaEntry of metaEntries) {
    await tx.objectStore("term_meta").put({ ...metaEntry, dictId: id });
  }
  const dict: LocalDictionary = {
    id,
    title,
    term_lang,
    native_lang,
    termCount: entries.size,
    metaCount: metaEntries.length,
    importedAt: Date.now(),
    revision: meta.revision,
  };
  await tx.objectStore("dictionaries").put(dict);
  await tx.done;

  return { id, title, termCount: entries.size, metaCount: metaEntries.length, term_lang, native_lang };
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
  // Bỏ tombstone (từ điển cá nhân đã xoá, giữ lại chỉ để lan truyền qua sync).
  return all.filter((d) => !d.deletedAt).sort((a, b) => b.importedAt - a.importedAt);
}

/**
 * Xoá một từ điển local cùng toàn bộ term/meta của nó. Giữ registry làm tombstone
 * (deletedAt) thay vì xoá hẳn, để việc xoá lan truyền qua đồng bộ — nay cả bản
 * nhập nhỏ cũng đồng bộ, nên tombstone cho mọi loại để máy khác không hồi sinh
 * (#70). Re-import tạo id mới nên tombstone cũ không gây vướng.
 */
export async function deleteLocalDictionary(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(["terms", "dictionaries", "term_meta"], "readwrite");
  const dictStore = tx.objectStore("dictionaries");
  const dict = await dictStore.get(id);
  for (const store of ["terms", "term_meta"] as const) {
    const idx = tx.objectStore(store).index("by_dict");
    let cursor = await idx.openCursor(IDBKeyRange.only(id));
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
  }
  if (dict) {
    const now = Date.now();
    await dictStore.put({ ...dict, termCount: 0, metaCount: 0, deletedAt: now, updatedAt: now });
  }
  await tx.done;
}

/**
 * Every stored entry for an exact term within a pair — one per reading. The key
 * range spans all `[term_lang, native_lang, term, <any reading>]` keys.
 */
async function entriesForTerm(
  term: string,
  term_lang: string,
  native_lang: string,
): Promise<DictEntry[]> {
  const db = await getDb();
  const range = IDBKeyRange.bound(
    [term_lang, native_lang, term],
    [term_lang, native_lang, term, "￿"],
  );
  return db.getAll("terms", range);
}

/**
 * Every stored entry whose *reading* equals `reading` within a pair, so typing a
 * word's reading (kana, or romaji converted to kana) finds entries keyed under
 * their kanji term (さくら → 桜). Uses the `by_reading` index.
 */
async function entriesForReading(
  reading: string,
  term_lang: string,
  native_lang: string,
): Promise<DictEntry[]> {
  const db = await getDb();
  return db.getAllFromIndex("terms", "by_reading", IDBKeyRange.only([term_lang, native_lang, reading]));
}

/**
 * Forward exact look-up within a language pair. A term may have several readings
 * (homographs); this returns the highest-scoring entry. Use `findTerms` to get
 * every reading.
 */
export async function lookupTerm(
  term: string,
  term_lang: string,
  native_lang: string,
): Promise<DictEntry | undefined> {
  const all = await entriesForTerm(term, term_lang, native_lang);
  if (all.length === 0) return undefined;
  return all.reduce((best, e) => ((e.score ?? 0) > (best.score ?? 0) ? e : best));
}

export interface TermResult {
  /** The dictionary entry found. */
  entry: DictEntry;
  /** Inflection reasons applied to reach it (empty for an exact match). */
  reasons: string[];
  /** The original text that was searched. */
  source: string;
  /** IPA pronunciations attached from term-meta dictionaries (if any). */
  pronunciations?: Pronunciation[];
  /** Corpus frequency ranks attached from term-meta dictionaries (if any). */
  frequencies?: TermFrequency[];
  /** A near-miss surfaced by edit-distance, not an exact/deinflected match. */
  fuzzy?: boolean;
}

/** Every stored term-meta row for a term within a pair (across all meta dicts). */
async function metaForTerm(
  term: string,
  term_lang: string,
  native_lang: string,
): Promise<TermMetaEntry[]> {
  const db = await getDb();
  return db.getAllFromIndex("term_meta", "by_lookup", IDBKeyRange.only([term_lang, native_lang, term]));
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

  // Key by term + reading so homographs (same term, different readings) surface
  // as separate results instead of collapsing into one.
  const byKey = new Map<string, TermResult>();
  for (const cand of cands) {
    // Match the candidate against both the term and the reading, so typing a
    // reading (kana, or romaji converted to kana) finds an entry keyed under its
    // kanji term (さくら → 桜).
    const matches = [
      ...(await entriesForTerm(cand.term, term_lang, native_lang)),
      ...(await entriesForReading(cand.term, term_lang, native_lang)),
    ];
    for (const entry of matches) {
      if (!rulesMatchEntry(cand.rules, entry.rules)) continue;
      const key = JSON.stringify([entry.term, entry.reading ?? ""]);
      const prev = byKey.get(key);
      // Prefer the candidate with the fewest reasons (closest to an exact match).
      if (!prev || cand.reasons.length < prev.reasons.length) {
        byKey.set(key, { entry, reasons: cand.reasons, source: query });
      }
    }
  }

  const ranked = [...byKey.values()].sort((a, b) => {
    if (a.reasons.length !== b.reasons.length) return a.reasons.length - b.reasons.length;
    return (b.entry.score ?? 0) - (a.entry.score ?? 0);
  });

  // Enrich each result with IPA + frequency from the pair's term-meta dicts.
  for (const result of ranked) {
    const meta = await metaForTerm(result.entry.term, term_lang, native_lang);
    if (!meta.length) continue;
    const pronunciations = ipaPronunciations(meta, result.entry.reading);
    if (pronunciations.length) result.pronunciations = pronunciations;
    const frequencies = frequencyRanks(meta, result.entry.reading);
    if (frequencies.length) result.frequencies = frequencies;
  }

  return ranked;
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

/** Stable key for a (term, reading) pair — matches `findTerms`'s dedupe key. */
function termReadingKey(term: string, reading: string | undefined): string {
  return JSON.stringify([term, reading ?? ""]);
}

/**
 * Fuzzy fallback: scan the pair's terms and return the closest near-misses by
 * edit distance, so a misspelled or misremembered query still surfaces the word
 * the user meant. `exclude` holds (term, reading) keys already shown as exact
 * matches. This walks every term for the pair, so callers run it off the hot
 * path (a cursor yields between steps, keeping the UI responsive).
 */
export async function fuzzyTerms(
  text: string,
  term_lang: string,
  native_lang: string,
  exclude: Set<string> = new Set(),
  limit = 8,
): Promise<TermResult[]> {
  const query = text.trim();
  if (!query) return [];
  const max = fuzzyThreshold(query);

  const db = await getDb();
  const range = IDBKeyRange.only([term_lang, native_lang]);
  const scored = new Map<string, { entry: DictEntry; distance: number }>();

  let cursor = await db.transaction("terms").store.index("by_pair").openCursor(range);
  while (cursor) {
    const entry = cursor.value;
    const key = termReadingKey(entry.term, entry.reading);
    if (!exclude.has(key)) {
      const distance = fuzzyMatchDistance(query, entry.term, entry.reading, max);
      if (distance <= max) {
        // Keep the best-scoring entry per (term, reading); on a tie, the closer.
        const prev = scored.get(key);
        if (!prev || distance < prev.distance) scored.set(key, { entry, distance });
      }
    }
    cursor = await cursor.continue();
  }

  return [...scored.values()]
    .sort((a, b) =>
      a.distance !== b.distance
        ? a.distance - b.distance
        : (b.entry.score ?? 0) - (a.entry.score ?? 0),
    )
    .slice(0, limit)
    .map(({ entry }) => ({ entry, reasons: [], source: query, fuzzy: true }));
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
