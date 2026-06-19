// Search Router (SPEC 2.A): client-side IndexedDB first, server fallback second.
// Forward-only, scoped to a language pair (term_lang → native_lang).

import { DictEntry } from "./db";
import { lookupTerm, suggestTerms, hasLocalDictionary } from "./yomitan";
import { serverLookup, serverSuggest } from "./api";
import { LangPair } from "../domain/languages";

/** Forward lookup: term → definition within the chosen pair. */
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
