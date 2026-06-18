// Backend client (SPEC 2.A fallback dictionary, 2.B reverse FTS, 2.C sync).
// All endpoints are best-effort: callers must tolerate the backend being absent
// (offline / static deploy) and fall back to IndexedDB.

import { DictEntry } from "./db";
import { VocabEntry } from "../domain/types";

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
export function serverLookup(term: string): Promise<DictEntry | null> {
  return getJson<DictEntry>(`/dict/lookup?term=${encodeURIComponent(term)}`);
}

/** Server-side reverse lookup via Postgres/SQLite FTS (SPEC 2.B). */
export async function serverReverseLookup(query: string): Promise<DictEntry[]> {
  return (await getJson<DictEntry[]>(`/dict/reverse?q=${encodeURIComponent(query)}`)) ?? [];
}

export async function serverSuggest(prefix: string): Promise<DictEntry[]> {
  return (await getJson<DictEntry[]>(`/dict/suggest?prefix=${encodeURIComponent(prefix)}`)) ?? [];
}

/** Pull user entries changed since a timestamp (SPEC 2.C). */
export async function pullUserData(user_id: string, since = 0): Promise<VocabEntry[] | null> {
  return getJson<VocabEntry[]>(`/sync?user_id=${encodeURIComponent(user_id)}&since=${since}`);
}

/** Push local user entries to the cloud (last-write-wins resolved server-side). */
export async function pushUserData(entries: VocabEntry[]): Promise<VocabEntry[] | null> {
  try {
    const res = await fetch(`${BASE}/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    });
    if (!res.ok) return null;
    return (await res.json()) as VocabEntry[];
  } catch {
    return null;
  }
}
