// Backend client (SPEC 2.A fallback dictionary, 2.C sync) + auth headers.
// All endpoints are best-effort: callers must tolerate the backend being absent
// (offline / static deploy) and fall back to IndexedDB.

import { DictEntry } from "./db";
import { VocabEntry } from "../domain/types";
import { authToken } from "./auth";

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

function authHeaders(): Record<string, string> {
  const token = authToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
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

/**
 * Pull user entries changed since a timestamp (SPEC 2.C). The server scopes the
 * data to the authenticated user, so no user_id is sent. Returns null when not
 * authenticated or the backend is unreachable (offline → local cache stands).
 */
export async function pullUserData(since = 0): Promise<VocabEntry[] | null> {
  const headers = authHeaders();
  if (!headers.Authorization) return null;
  try {
    const res = await fetch(`${BASE}/sync?since=${since}`, { headers });
    if (!res.ok) return null;
    return (await res.json()) as VocabEntry[];
  } catch {
    return null;
  }
}

/** Push local user entries to the cloud (last-write-wins resolved server-side). */
export async function pushUserData(entries: VocabEntry[]): Promise<VocabEntry[] | null> {
  const headers = authHeaders();
  if (!headers.Authorization) return null;
  try {
    const res = await fetch(`${BASE}/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ entries }),
    });
    if (!res.ok) return null;
    return (await res.json()) as VocabEntry[];
  } catch {
    return null;
  }
}
