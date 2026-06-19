// User-data repository (SPEC 2.C).
// IndexedDB is a CACHE; the Cloud DB is the source of truth. Conflicts are
// resolved last-write-wins by `updated_at`.

import { getDb } from "./db";
import { pullUserData, pushUserData } from "./api";
import { VocabEntry, keyOf } from "../domain/types";

/** Read all entries for a user from the local cache. */
export async function getAllEntries(user_id: string): Promise<VocabEntry[]> {
  const db = await getDb();
  const all = await db.getAll("user_data");
  return all.filter((e) => e.user_id === user_id);
}

export async function getEntry(
  user_id: string,
  term: string,
  term_lang: string,
): Promise<VocabEntry | undefined> {
  const db = await getDb();
  return db.get("user_data", [user_id, term, term_lang]);
}

/** Persist an entry to the local cache. */
export async function putEntry(entry: VocabEntry): Promise<void> {
  const db = await getDb();
  await db.put("user_data", entry);
}

/**
 * Last-write-wins merge of two entry lists keyed by (user_id, term, term_lang).
 * Pure function so it can be unit-tested independently of IndexedDB/network.
 */
export function mergeByUpdatedAt(a: VocabEntry[], b: VocabEntry[]): VocabEntry[] {
  const map = new Map<string, VocabEntry>();
  for (const e of [...a, ...b]) {
    const k = keyOf(e);
    const existing = map.get(k);
    if (!existing || e.updated_at >= existing.updated_at) {
      map.set(k, e);
    }
  }
  return Array.from(map.values());
}

/**
 * Two-way sync with the cloud:
 *   1. pull remote changes,
 *   2. last-write-wins merge with the local cache,
 *   3. write the merged set back to the cache,
 *   4. push the merged set up.
 * Degrades gracefully to a local-only no-op when the backend is unreachable.
 */
export async function syncUserData(user_id: string): Promise<VocabEntry[]> {
  const local = await getAllEntries(user_id);

  const remote = await pullUserData();
  if (remote == null) {
    // Offline / no backend — local cache stands on its own.
    return local;
  }

  const merged = mergeByUpdatedAt(local, remote);

  const db = await getDb();
  const tx = db.transaction("user_data", "readwrite");
  for (const e of merged) await tx.store.put(e);
  await tx.done;

  await pushUserData(merged);
  return merged;
}
