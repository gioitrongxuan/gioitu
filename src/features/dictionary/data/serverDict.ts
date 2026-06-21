// Server-side dictionary client (SPEC 2.A fallback). Best-effort and public:
// callers must tolerate the backend being absent (offline / static deploy) and
// fall back to IndexedDB, so every call resolves to null/[] instead of throwing.

import { DictEntry } from "@/shared/db";
import { fuzzyThreshold } from "../domain/fuzzy";

const BASE = "/api";

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${path}`);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Server-side forward lookup (fallback when IndexedDB has no dictionary). */
export function serverLookup(
  term: string,
  term_lang: string,
  native_lang: string,
): Promise<DictEntry | null> {
  const q = `term=${encodeURIComponent(term)}&src=${term_lang}&tgt=${native_lang}`;
  return getJson<DictEntry>(`/dict/lookup?${q}`);
}

export async function serverSuggest(
  prefix: string,
  term_lang: string,
  native_lang: string,
): Promise<DictEntry[]> {
  const q = `prefix=${encodeURIComponent(prefix)}&src=${term_lang}&tgt=${native_lang}`;
  return (await getJson<DictEntry[]>(`/dict/suggest?${q}`)) ?? [];
}

/** Server-side fuzzy near-misses (edit distance), closest-first. */
export async function serverFuzzy(
  term: string,
  term_lang: string,
  native_lang: string,
): Promise<DictEntry[]> {
  // Same edit-distance budget the client uses locally, so behaviour matches
  // whether the dictionary lives in IndexedDB or on the server.
  const max = fuzzyThreshold(term);
  const q = `term=${encodeURIComponent(term)}&src=${term_lang}&tgt=${native_lang}&max=${max}`;
  return (await getJson<DictEntry[]>(`/dict/fuzzy?${q}`)) ?? [];
}
