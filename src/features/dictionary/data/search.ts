// Search Router (SPEC 2.A): client-side IndexedDB first, server fallback second.
// Forward-only, scoped to a language pair (term_lang → native_lang).
//
// Look-up is Yomitan-style: the query is deinflected and every candidate form is
// looked up. The IndexedDB path returns rich, structured-content entries; the
// optional server path is a plain-text fallback that we still deinflect against.

import { DictEntry } from "@/shared/db";
import {
  findTerms,
  fuzzyTerms,
  suggestTerms,
  hasLocalDictionary,
  lookupTerm,
  TermResult,
} from "./yomitan";
import { serverLookup, serverSuggest, serverFuzzy } from "./serverDict";
import { candidates } from "../domain/deinflect";
import { LangPair } from "@/shared/languages";

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

/**
 * Near-miss look-up for when the query is misspelled or misremembered: closest
 * terms by edit distance. Resolves against IndexedDB when a local dictionary
 * exists, otherwise against the server dictionary (Postgres `levenshtein`) — so
 * fuzzy works the same whether the dictionary is imported locally or only on the
 * server. Returned separately from `findTermsRouted` so the exact results never
 * wait on this full scan; callers run it off the hot path and append the
 * results. `exclude` lists the (term, reading) keys already shown as exact
 * matches, so they aren't repeated.
 */
export async function findFuzzyRouted(
  text: string,
  pair: LangPair,
  exclude: Set<string>,
): Promise<TermResult[]> {
  const query = text.trim();
  if (!query) return [];

  if (await hasLocalDictionary(pair.source, pair.target)) {
    return fuzzyTerms(query, pair.source, pair.target, exclude);
  }

  // No local dictionary → fuzzy against the server, mirroring the exact-lookup
  // fallback. The server already ranks closest-first and bounds the distance.
  const entries = await serverFuzzy(query, pair.source, pair.target);
  return entries
    .filter((e) => !exclude.has(JSON.stringify([e.term, e.reading ?? ""])))
    .map((entry) => ({ entry, reasons: [], source: query, fuzzy: true }));
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
