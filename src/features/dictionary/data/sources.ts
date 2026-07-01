// Dictionary sources behind a single interface, so the lookup orchestration
// (search.ts) only picks a source and never branches on where the data lives.
// Two implementations:
//   • localSource  — IndexedDB (imported Yomitan dictionaries), rich entries.
//   • serverSource — the Postgres fallback dictionary, plain-text entries.
// Both deinflect Japanese the same way (local does it inside findTerms; the
// server is dumb, so we deinflect client-side and look each candidate up).

import { DictEntry } from "@/shared/db";
import { LangPair } from "@/shared/languages";
import { candidates } from "../domain/deinflect";
import { DictSource } from "../domain/source";
import { findTerms, fuzzyTerms, suggestTerms, TermResult } from "./yomitan";
import { serverFuzzy, serverLookup, serverSuggest } from "./serverDict";

/** Forward, per-pair look-up against one database. No cross-source fallback. */
export interface DictionarySource {
  /** Yomitan-style: deinflect the query and return ranked matches. */
  findTerms(text: string, pair: LangPair): Promise<TermResult[]>;
  /** Prefix suggestions while typing. */
  suggest(prefix: string, pair: LangPair): Promise<DictEntry[]>;
  /** Near-misses by edit distance, skipping the `exclude`d (term, reading) keys. */
  fuzzy(text: string, pair: LangPair, exclude: Set<string>): Promise<TermResult[]>;
}

const localSource: DictionarySource = {
  findTerms: (text, pair) => findTerms(text, pair.source, pair.target),
  suggest: (prefix, pair) => suggestTerms(prefix, pair.source, pair.target),
  fuzzy: (text, pair, exclude) => fuzzyTerms(text, pair.source, pair.target, exclude),
};

/** Cap the number of network look-ups when deinflecting against the server. */
const MAX_SERVER_CANDIDATES = 12;

/** (term, reading) key matching findTerms/fuzzyTerms — for cross-source dedupe. */
function termReadingKey(entry: DictEntry): string {
  return JSON.stringify([entry.term, entry.reading ?? ""]);
}

const serverSource: DictionarySource = {
  async findTerms(text, pair) {
    const query = text.trim();
    if (!query) return [];
    // The server can't deinflect, so look each candidate form up. A form can map
    // to several entries (homographs sharing a reading: さくら → 桜, 櫻); key by
    // (term, reading) so they surface separately, keeping the closest match.
    const cands = candidates(query, pair.source).slice(0, MAX_SERVER_CANDIDATES);
    const byKey = new Map<string, TermResult>();
    for (const cand of cands) {
      const entries = await serverLookup(cand.term, pair.source, pair.target);
      for (const entry of entries) {
        const key = JSON.stringify([entry.term, entry.reading ?? ""]);
        const prev = byKey.get(key);
        if (!prev || cand.reasons.length < prev.reasons.length) {
          byKey.set(key, { entry, reasons: cand.reasons, source: query });
        }
      }
    }
    // Exact (fewest reasons) first, then most common (score) — như nguồn local.
    return [...byKey.values()].sort(
      (a, b) => a.reasons.length - b.reasons.length || (b.entry.score ?? 0) - (a.entry.score ?? 0),
    );
  },

  suggest: (prefix, pair) => serverSuggest(prefix, pair.source, pair.target),

  async fuzzy(text, pair, exclude) {
    const query = text.trim();
    if (!query) return [];
    // The server (Postgres `levenshtein`) already ranks closest-first and bounds
    // the distance; we just drop anything already shown as an exact match.
    const entries = await serverFuzzy(query, pair.source, pair.target);
    return entries
      .filter((e) => !exclude.has(termReadingKey(e)))
      .map((entry) => ({ entry, reasons: [], source: query, fuzzy: true }));
  },
};

/** The source the user has selected. */
export function getSource(source: DictSource): DictionarySource {
  return source === "server" ? serverSource : localSource;
}
