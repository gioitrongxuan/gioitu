// Merge từ điển cá nhân ở MỨC TỪ (#166) — logic thuần, không I/O, để test độc
// lập với IndexedDB/mạng. Trước đây đồng bộ LWW nguyên blob cả cuốn: hai máy
// cùng sửa một từ điển thì máy thua mất sạch từ mình vừa thêm/sửa. Giờ mỗi từ
// mang mốc `updatedAt` riêng và registry giữ tombstone theo từ (`deletedTerms`),
// nên merge giữ được sửa đổi của CẢ hai máy và vẫn lan truyền được việc xoá.

import type { DictEntry, LocalDictionary } from "@/shared/db";

/** Một từ điển cá nhân dạng blob đồng bộ: registry + toàn bộ từ của nó. */
export interface SyncedDict {
  registry: LocalDictionary;
  terms: DictEntry[];
}

/** Mốc thời gian LWW của một từ điển: updatedAt, hoặc importedAt khi vắng. */
function dictUpdatedAt(registry: LocalDictionary): number {
  return registry.updatedAt ?? registry.importedAt ?? 0;
}

/** Khoá hợp nhất một từ — trùng khoá store `terms` (không tính dictId). */
export function termMergeKey(e: {
  term_lang: string;
  native_lang: string;
  term: string;
  reading?: string;
}): string {
  return JSON.stringify([e.term_lang, e.native_lang, e.term, e.reading ?? ""]);
}

/**
 * Hai bản ghi cùng khoá có cùng nội dung không (bỏ qua mốc LWW `updatedAt`)?
 * Dùng để save KHÔNG đóng dấu lại từ không đổi — đóng dấu cả loạt sẽ khiến mọi
 * lần save thắng oan khi merge term-level (thoái hoá về LWW nguyên blob).
 */
export function sameTermContent(a: DictEntry, b: DictEntry): boolean {
  const strip = ({ updatedAt: _updatedAt, ...rest }: DictEntry) => rest;
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
}

/** Mốc LWW của một từ: updatedAt riêng, fallback mốc registry (dữ liệu trước #166). */
function termStamp(term: DictEntry, registry: LocalDictionary): number {
  return term.updatedAt ?? dictUpdatedAt(registry);
}

/**
 * Hợp nhất HAI phiên bản của cùng một từ điển. Term-level chỉ áp dụng cho từ
 * điển `custom` còn sống ở cả hai bên; các trường hợp khác (tombstone cả cuốn,
 * từ điển nhập .zip không có mốc theo từ) giữ LWW nguyên blob như cũ.
 *
 * Term-level: hợp các từ theo khoá, trùng khoá thì mốc mới hơn thắng (hoà → bên
 * `b` thắng, khớp quy ước "remote đứng sau thắng hoà" của merge cũ); từ chỉ có
 * một bên luôn được giữ TRỪ khi tombstone của khoá đó mới hơn (đã xoá ở bên kia).
 * Registry lấy metadata của bản mới hơn, mốc = max hai bên (để server blob-LWW
 * nhận bản merge), termCount tính lại, tombstone gộp và tỉa khoá đã sống lại.
 */
export function mergeDictPair(a: SyncedDict, b: SyncedDict): SyncedDict {
  const newer = dictUpdatedAt(b.registry) >= dictUpdatedAt(a.registry) ? b : a;
  const isTermLevel =
    (a.registry.custom || b.registry.custom) && !a.registry.deletedAt && !b.registry.deletedAt;
  if (!isTermLevel) return newer;

  const live = new Map<string, { term: DictEntry; stamp: number }>();
  for (const side of [a, b]) {
    for (const term of side.terms) {
      const key = termMergeKey(term);
      const stamp = termStamp(term, side.registry);
      const current = live.get(key);
      if (!current || stamp >= current.stamp) live.set(key, { term, stamp });
    }
  }

  // Tombstone theo từ: lấy mốc xoá mới nhất của hai bên cho mỗi khoá.
  const tombstones: Record<string, number> = {};
  for (const side of [a, b]) {
    for (const [key, at] of Object.entries(side.registry.deletedTerms ?? {})) {
      tombstones[key] = Math.max(tombstones[key] ?? 0, at);
    }
  }

  const terms: DictEntry[] = [];
  for (const [key, { term, stamp }] of live) {
    const deletedAt = tombstones[key];
    if (deletedAt !== undefined && deletedAt >= stamp) continue; // xoá mới hơn → vẫn xoá
    delete tombstones[key]; // từ sống mới hơn mốc xoá (thêm lại) → tombstone hết vai trò
    terms.push(term);
  }

  const registry: LocalDictionary = {
    ...newer.registry,
    updatedAt: Math.max(dictUpdatedAt(a.registry), dictUpdatedAt(b.registry)),
    termCount: terms.length,
  };
  if (Object.keys(tombstones).length) registry.deletedTerms = tombstones;
  else delete registry.deletedTerms;
  return { registry, terms };
}

/**
 * Hợp nhất hai danh sách blob theo `registry.id`; cặp cùng id đi qua
 * `mergeDictPair` (hoà nghiêng về `b` — quy ước caller truyền local trước,
 * remote sau).
 */
export function mergeSyncedDicts(a: SyncedDict[], b: SyncedDict[]): SyncedDict[] {
  const map = new Map<string, SyncedDict>();
  for (const d of [...a, ...b]) {
    const existing = map.get(d.registry.id);
    map.set(d.registry.id, existing ? mergeDictPair(existing, d) : d);
  }
  return [...map.values()];
}
