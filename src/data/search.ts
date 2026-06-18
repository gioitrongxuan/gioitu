// Search Router (SPEC 2.A): client-side IndexedDB first, server fallback second.

import { DictEntry, getDb } from "./db";
import { lookupTerm, suggestTerms, reverseLookup, hasLocalDictionary } from "./yomitan";
import { serverLookup, serverReverseLookup, serverSuggest } from "./api";

/** Case 1 — forward lookup: term → definition. IndexedDB first, then server. */
export async function searchForward(term: string): Promise<DictEntry | null> {
  const local = await lookupTerm(term);
  if (local) return local;
  return serverLookup(term);
}

/** Live suggestions while typing. */
export async function searchSuggest(prefix: string): Promise<DictEntry[]> {
  const local = await suggestTerms(prefix);
  if (local.length > 0) return local;
  return serverSuggest(prefix);
}

/**
 * Case 2 — reverse lookup: native query → target terms.
 * Uses the local reverse index when a dictionary has been imported, otherwise
 * defers to the server FTS (SPEC 2.B note: Case 2 may be server-only in v1).
 */
export async function searchReverse(query: string): Promise<DictEntry[]> {
  if (await hasLocalDictionary()) {
    const local = await reverseLookup(query);
    if (local.length > 0) return local;
  }
  return serverReverseLookup(query);
}

/** Count of locally imported dictionary terms (for UI status). */
export async function localTermCount(): Promise<number> {
  const db = await getDb();
  return db.count("terms");
}
