// Đồng bộ từ điển cá nhân hai chiều (#70 — 6.2), soi gương review/data/repository
// (user_data). IndexedDB là CACHE; blob trên server là nguồn sự thật. Đơn vị
// truyền tải vẫn là CẢ một từ điển (registry + toàn bộ từ), nhưng hợp nhất ở MỨC
// TỪ (#166, logic thuần ở domain/dictMerge) — hai máy cùng sửa một cuốn không còn
// nuốt sửa đổi của nhau. Chỉ đụng từ điển `custom` — từ điển đã nhập (.zip)
// re-import được nên không đồng bộ.

import { getDb, LocalDictionary } from "@/shared/db";
import { mergeSyncedDicts } from "../domain/dictMerge";
import { SyncedDict, pullCustomDicts, pushCustomDicts } from "./dictSyncApi";

/**
 * Trần số từ để một từ điển ĐÃ NHẬP (.zip) được coi là "nhỏ" và tham gia đồng bộ.
 * Từ điển tự soạn luôn đồng bộ bất kể cỡ. Đây chỉ là bộ lọc rẻ ở client (đọc
 * `termCount` khỏi phải nạp cả dict lớn); trần dung lượng thật do server áp
 * (MAX_SYNC_BYTES) — vượt thì push bị từ chối, bản local vẫn giữ.
 */
const SYNCABLE_MAX_TERMS = 2000;

/** Từ điển này có nằm trong diện đồng bộ không (tự soạn, hoặc bản nhập đủ nhỏ)? */
function isSyncable(registry: LocalDictionary): boolean {
  return registry.custom === true || (registry.termCount ?? 0) <= SYNCABLE_MAX_TERMS;
}

/**
 * Đọc các từ điển trên máy thuộc diện đồng bộ thành blob (kể cả tombstone, để lan
 * truyền xoá). Gồm từ điển tự soạn + bản nhập đủ nhỏ; bỏ bản nhập lớn (re-import
 * được). Bản nhập lớn bị loại theo `termCount` nên không phải nạp term của nó.
 */
export async function localSyncableDicts(): Promise<SyncedDict[]> {
  const db = await getDb();
  const registries = await db.getAll("dictionaries");
  const out: SyncedDict[] = [];
  for (const registry of registries) {
    if (!isSyncable(registry)) continue;
    const terms = await db.getAllFromIndex("terms", "by_dict", registry.id);
    out.push({ registry, terms });
  }
  return out;
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
  /** Số từ điển (không tính tombstone) sau khi merge. */
  count: number;
  /** Đẩy lên server thành công? false khi vượt hạn mức / lỗi mạng lúc push. */
  pushed: boolean;
}

/**
 * Đồng bộ hai chiều: (1) đọc local, (2) pull remote, (3) merge term-level,
 * (4) ghi lại cache, (5) push. Không đổi cache (giữ local) khi offline / chưa
 * Premium.
 */
export async function syncCustomDicts(): Promise<SyncResult> {
  const local = await localSyncableDicts();

  const remote = await pullCustomDicts();
  if (remote == null) return { ok: false, count: 0, pushed: false }; // offline / chưa quyền

  const merged = mergeSyncedDicts(local, remote);
  await writeMergedDicts(merged);
  const pushed = (await pushCustomDicts(merged)) != null;
  return { ok: true, count: merged.filter((d) => !d.registry.deletedAt).length, pushed };
}
