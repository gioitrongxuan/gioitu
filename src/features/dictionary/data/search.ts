// Search facade (SPEC 2.A): forward-only look-up scoped to a language pair, run
// against the source the user picked (Trên máy / Server). The source-specific
// logic lives in sources.ts; this layer only resolves the chosen source so the
// UI has one stable place to call. There is no automatic fallback between
// sources — the toggle decides which database answers.

import { DictEntry } from "@/shared/db";
import { LangPair } from "@/shared/languages";
import { LookupErrorKind, LookupResult } from "../domain/lookupError";
import { DictSource } from "../domain/source";
import { hasLocalDictionary, TermResult } from "./yomitan";
import { getSource } from "./sources";

export type { TermResult };
export type { LookupErrorKind, LookupResult };

/**
 * Yomitan-style multi-result look-up against the chosen source. Trả LookupResult
 * (results + cờ lỗi) để caller phân biệt "không có từ" với "không gọi được máy chủ".
 */
export function findTermsRouted(
  text: string,
  pair: LangPair,
  source: DictSource,
): Promise<LookupResult<TermResult>> {
  return getSource(source).findTerms(text, pair);
}

/**
 * Near-miss look-up (edit distance) for a misspelled or misremembered query.
 * Returned separately from `findTermsRouted` so the exact results never wait on
 * this scan; callers run it off the hot path and append the results. `exclude`
 * lists the (term, reading) keys already shown as exact matches.
 */
export function findFuzzyRouted(
  text: string,
  pair: LangPair,
  exclude: Set<string>,
  source: DictSource,
): Promise<TermResult[]> {
  return getSource(source).fuzzy(text, pair, exclude);
}

/**
 * Definition-text look-up (#172): matches by gloss/meaning instead of the
 * headword, so a phrase in the *meaning* language still finds the entry.
 * Same bonus-scan contract as `findFuzzyRouted` — callers run it off the hot
 * path and append the results; `exclude` lists (term, reading) keys already shown.
 */
export function findByDefinitionRouted(
  text: string,
  pair: LangPair,
  exclude: Set<string>,
  source: DictSource,
): Promise<TermResult[]> {
  return getSource(source).byDefinition(text, pair, exclude);
}

/** Live suggestions while typing, against the chosen source. */
export function searchSuggest(
  prefix: string,
  pair: LangPair,
  source: DictSource,
): Promise<DictEntry[]> {
  return getSource(source).suggest(prefix, pair);
}

/** Whether a local (IndexedDB) dictionary exists for the pair (UI status). */
export function hasLocalDict(pair: LangPair): Promise<boolean> {
  return hasLocalDictionary(pair.source, pair.target);
}
