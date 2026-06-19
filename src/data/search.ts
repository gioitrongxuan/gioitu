// Search Router (SPEC 2.A): client-side IndexedDB first, server fallback second.
// Forward-only, scoped to a language pair (term_lang → native_lang).
//
// Look-up is Yomitan-style: the query is deinflected and every candidate form is
// looked up. The IndexedDB path returns rich, structured-content entries; the
// optional server path is a plain-text fallback that we still deinflect against.

import { DictEntry } from "./db";
import {
  findTerms,
  suggestTerms,
  hasLocalDictionary,
  lookupTerm,
  TermResult,
} from "./yomitan";
import { serverLookup, serverSuggest } from "./api";
import { candidates } from "../domain/deinflect";
import { LangPair } from "../domain/languages";

export type { TermResult };

/** Cap the number of network look-ups when deinflecting against the server. */
const MAX_SERVER_CANDIDATES = 12;

/**
 * Yomitan-style multi-result look-up: deinflected candidates resolved against
 * IndexedDB, falling back to the server dictionary (also deinflected) when the
 * pair has no local dictionary.
 */
export async function findTermsRouted(text: string, pair: LangPair): Promise<TermResult[]> {
  const query = text.trim();
  if (!query) return [];

  const local = await findTerms(query, pair.source, pair.target);
  if (local.length > 0) return local;
  if (await hasLocalDictionary(pair.source, pair.target)) return [];

  // Server fallback: deinflect client-side, look each candidate up server-side.
  const cands = candidates(query, pair.source).slice(0, MAX_SERVER_CANDIDATES);
  const byTerm = new Map<string, TermResult>();
  for (const cand of cands) {
    const entry = await serverLookup(cand.term, pair.source, pair.target);
    if (!entry) continue;
    const prev = byTerm.get(entry.term);
    if (!prev || cand.reasons.length < prev.reasons.length) {
      byTerm.set(entry.term, { entry, reasons: cand.reasons, source: query });
    }
  }
  return [...byTerm.values()].sort((a, b) => a.reasons.length - b.reasons.length);
}

/** Single best forward match (kept for callers that only need one entry). */
export async function searchForward(term: string, pair: LangPair): Promise<DictEntry | null> {
  const local = await lookupTerm(term, pair.source, pair.target);
  if (local) return local;
  return serverLookup(term, pair.source, pair.target);
}

/** Live suggestions while typing, scoped to the chosen pair. */
export async function searchSuggest(prefix: string, pair: LangPair): Promise<DictEntry[]> {
  const local = await suggestTerms(prefix, pair.source, pair.target);
  if (local.length > 0) return local;
  return serverSuggest(prefix, pair.source, pair.target);
}

/** Whether a local dictionary exists for the pair (UI status). */
export function hasLocalDict(pair: LangPair): Promise<boolean> {
  return hasLocalDictionary(pair.source, pair.target);
}
