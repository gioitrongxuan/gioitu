// Đồng bộ từ điển cá nhân hai chiều (#70 — 6.2), soi gương review/data/repository
// (user_data). IndexedDB là CACHE; blob trên server là nguồn sự thật. Đơn vị đồng
// bộ là CẢ một từ điển (registry + toàn bộ từ), LWW theo `updatedAt`. Chỉ đụng từ
// điển `custom` — từ điển đã nhập (.zip) re-import được nên không đồng bộ.

import { getDb, LocalDictionary } from "@/shared/db";
import { SyncedDict, pullCustomDicts, pushCustomDicts } from "./dictSyncApi";

/** Mốc thời gian LWW của một từ điển: updatedAt, hoặc importedAt khi vắng. */
export function dictUpdatedAt(registry: LocalDictionary): number {
  return registry.updatedAt ?? registry.importedAt ?? 0;
}

/**
 * Đọc mọi từ điển cá nhân trên máy thành blob đồng bộ (kể cả tombstone, để lan
 * truyền việc xoá). KHÔNG bao gồm từ điển đã nhập.
 */
export async function localCustomDicts(): Promise<SyncedDict[]> {
  const db = await getDb();
  const registries = (await db.getAll("dictionaries")).filter((d) => d.custom);
  const out: SyncedDict[] = [];
  for (const registry of registries) {
    const terms = await db.getAllFromIndex("terms", "by_dict", registry.id);
    out.push({ registry, terms });
  }
  return out;
}

/**
 * Hợp nhất hai danh sách blob theo `registry.id`, LWW theo `updatedAt`. Thuần để
 * test độc lập với IndexedDB/mạng.
 */
export function mergeDictsByUpdatedAt(a: SyncedDict[], b: SyncedDict[]): SyncedDict[] {
  const map = new Map<string, SyncedDict>();
  for (const d of [...a, ...b]) {
    const existing = map.get(d.registry.id);
    if (!existing || dictUpdatedAt(d.registry) >= dictUpdatedAt(existing.registry)) {
      map.set(d.registry.id, d);
    }
  }
  return [...map.values()];
}

/**
 * Ghi tập blob đã merge về cache: cập nhật registry; xoá term cũ của mỗi dict rồi
 * ghi lại theo blob (tombstone thì bỏ term, giữ registry để còn lan truyền xoá).
 */
export async function writeMergedDicts(merged: SyncedDict[]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(["dictionaries", "terms"], "readwrite");
  const dictStore = tx.objectStore("dictionaries");
  const termStore = tx.objectStore("terms");
  const byDict = termStore.index("by_dict");

  for (const { registry, terms } of merged) {
    await dictStore.put(registry);
    let cursor = await byDict.openCursor(IDBKeyRange.only(registry.id));
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    if (!registry.deletedAt) {
      for (const term of terms) await termStore.put({ ...term, dictId: registry.id });
    }
  }
  await tx.done;
}

/** Kết quả một lần đồng bộ, đủ cho caller hiện phản hồi cho người dùng. */
export interface SyncResult {
  /** Đã liên lạc được server (pull khác null) hay không (offline / chưa quyền). */
  ok: boolean;
  /** Số từ điển cá nhân (không tính tombstone) sau khi merge. */
  count: number;
}

/**
 * Đồng bộ hai chiều: (1) đọc local, (2) pull remote, (3) merge LWW, (4) ghi lại
 * cache, (5) push. Không đổi cache (giữ local) khi offline / chưa Premium.
 */
export async function syncCustomDicts(): Promise<SyncResult> {
  const local = await localCustomDicts();

  const remote = await pullCustomDicts();
  if (remote == null) return { ok: false, count: 0 }; // offline / chưa quyền — cache local đứng vững

  const merged = mergeDictsByUpdatedAt(local, remote);
  await writeMergedDicts(merged);
  await pushCustomDicts(merged);
  return { ok: true, count: merged.filter((d) => !d.registry.deletedAt).length };
}
