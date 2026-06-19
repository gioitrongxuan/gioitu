// Cloud-sync client (SPEC 2.C). Best-effort: every call tolerates the backend
// being absent or the user being signed out (returns null → local cache stands).
// The server scopes data to the authenticated user, so no user_id is ever sent.

import { VocabEntry } from "@/shared/types";
import { authToken } from "@/features/auth/data/auth";

const BASE = "/api";

function authHeaders(): Record<string, string> {
  const token = authToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Pull user entries changed since a timestamp. Returns null when not
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
