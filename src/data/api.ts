// Backend client (SPEC 2.A fallback dictionary, 2.B reverse FTS, 2.C sync).
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
