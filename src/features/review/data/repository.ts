// User-data repository (SPEC 2.C).
// IndexedDB is a CACHE; the Cloud DB is the source of truth. Conflicts are
// resolved last-write-wins by `updated_at`.

import { getDb } from "@/shared/db";
import { pullUserData, pushUserData } from "./syncApi";
import { SyncStatus } from "../domain/syncStatus";
import { VocabEntry, keyOf } from "@/shared/types";

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
 * Move every entry owned by `from_user_id` to `to_user_id`, merging into any
 * entry the target already has (last-write-wins). Used to carry a guest's local
 * progress over to their account on first sign-in. Returns the migrated count.
 */
export async function reassignEntries(
  from_user_id: string,
  to_user_id: string,
): Promise<number> {
  if (from_user_id === to_user_id) return 0;
  const source = await getAllEntries(from_user_id);
  if (source.length === 0) return 0;

  const db = await getDb();
  const tx = db.transaction("user_data", "readwrite");
  for (const e of source) {
    const moved: VocabEntry = { ...e, user_id: to_user_id };
    const existing = await tx.store.get([to_user_id, e.term, e.term_lang]);
    if (!existing || moved.updated_at >= existing.updated_at) {
      await tx.store.put(moved);
    }
    await tx.store.delete([from_user_id, e.term, e.term_lang]);
  }
  await tx.done;
  return source.length;
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
 * Kết quả một lần đồng bộ, đủ để caller phản hồi TRUNG THỰC (không còn nuốt lỗi
 * thành no-op im lặng rồi báo "Đã đồng bộ" vô điều kiện).
 */
export interface SyncReport {
  /** Danh sách đã merge (LWW) để cập nhật UI — kể cả khi offline (chỉ có bản local). */
  entries: VocabEntry[];
  /** Kết cục liên lạc với server: ok / offline / token hết hạn. */
  status: SyncStatus;
  /** Số entry nhận từ server (0 khi không pull được). */
  pulled: number;
  /** Số entry đẩy lên server (0 khi không push được). */
  pushed: number;
}

/**
 * Two-way sync with the cloud:
 *   1. pull remote changes,
 *   2. last-write-wins merge with the local cache,
 *   3. write the merged set back to the cache,
 *   4. push the merged set up.
 * Offline/token hết hạn thì bản local tự đứng, nhưng trạng thái được báo lên
 * (không im lặng) để UI hiện đúng và mời đăng nhập lại khi token hết hạn.
 */
export async function syncUserData(user_id: string): Promise<SyncReport> {
  const local = await getAllEntries(user_id);

  const pull = await pullUserData();
  if (pull.status !== "ok") {
    // Offline / token hết hạn / khách: bản local đứng vững, báo trạng thái thật.
    return { entries: local, status: pull.status, pulled: 0, pushed: 0 };
  }

  const merged = mergeByUpdatedAt(local, pull.entries);

  const db = await getDb();
  const tx = db.transaction("user_data", "readwrite");
  for (const e of merged) await tx.store.put(e);
  await tx.done;

  // Đã kéo về và ghi cache; kết cục chung theo lượt push: push thất bại (offline
  // hoặc 401 do token vừa hết hạn) nghĩa là thay đổi local CHƯA chắc lên server,
  // nên chưa coi là đồng bộ trọn vẹn — báo đúng status của push.
  const push = await pushUserData(merged);
  const pushed = push.status === "ok" ? merged.length : 0;
  return { entries: merged, status: push.status, pulled: pull.entries.length, pushed };
}
