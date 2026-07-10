// Từ điển cá nhân (Issue #69) — lớp I/O IndexedDB. Tạo/bổ sung một từ điển
// người dùng tự soạn: nó chỉ là các bản ghi `DictEntry` bình thường gắn `dictId`
// trỏ tới một mục trong registry `dictionaries`, nên tra cứu nguồn "Trên máy"
// thấy ngay mà KHÔNG cần đổi schema. Logic dựng entry/khử trùng là hàm thuần ở
// domain/customEntry; ở đây chỉ có phần chạm IndexedDB.

import { getDb, DictEntry, LocalDictionary } from "@/shared/db";
import { LangPair } from "@/shared/languages";
import { CustomDraft, buildDictEntry, isDraftFilled, termReadingKey } from "../domain/customEntry";
import { uuid } from "./yomitan";

/** Khoá store `terms` của một entry — để so khớp khi thay thế nội dung dict. */
function termKey(e: { term_lang: string; native_lang: string; term: string; reading?: string }): string {
  return JSON.stringify([e.term_lang, e.native_lang, e.term, e.reading ?? ""]);
}

/** Tạo một từ điển cá nhân rỗng trong registry và trả về id của nó. */
export async function createLocalDictionary(input: {
  title: string;
  term_lang: string;
  native_lang: string;
  description?: string;
  topic?: string;
}): Promise<string> {
  const id = uuid();
  const now = Date.now();
  const dict: LocalDictionary = {
    id,
    title: input.title,
    term_lang: input.term_lang,
    native_lang: input.native_lang,
    termCount: 0,
    importedAt: now,
    updatedAt: now, // mốc LWW cho đồng bộ (#70)
    custom: true,
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    ...(input.topic?.trim() ? { topic: input.topic.trim() } : {}),
  };
  const db = await getDb();
  await db.put("dictionaries", dict);
  return id;
}

/**
 * Tập khoá `(term, reading)` của mọi từ đã có trong một cặp ngôn ngữ — để chống
 * trùng trước khi lưu. Quét bằng cursor trên khoá (không tải cả value) để nhẹ.
 */
export async function existingTermKeys(term_lang: string, native_lang: string): Promise<Set<string>> {
  const db = await getDb();
  const keys = new Set<string>();
  const range = IDBKeyRange.only([term_lang, native_lang]);
  let cursor = await db.transaction("terms").store.index("by_pair").openKeyCursor(range);
  while (cursor) {
    // Khoá primary là [term_lang, native_lang, term, reading].
    const [, , term, reading] = cursor.primaryKey as [string, string, string, string];
    keys.add(termReadingKey(term, reading));
    cursor = await cursor.continue();
  }
  return keys;
}

/**
 * Ghi (upsert) các dòng nháp vào store `terms` dưới `dictId`, rồi tính lại
 * `termCount` của từ điển đó từ chỉ mục `by_dict`. Người gọi đã lọc trùng
 * (bỏ qua / ghi đè) trước khi truyền vào đây. Trả về số dòng đã lưu.
 */
export async function upsertCustomEntries(
  dictId: string,
  dictTitle: string,
  pair: LangPair,
  drafts: CustomDraft[],
): Promise<number> {
  const db = await getDb();
  const tx = db.transaction(["terms", "dictionaries"], "readwrite");
  const terms = tx.objectStore("terms");
  for (const draft of drafts) {
    await terms.put({ ...buildDictEntry(draft, pair, dictTitle), dictId });
  }

  // termCount là số từ thực tế thuộc dict này — tính lại cho chính xác kể cả khi
  // ghi đè lên từ vốn thuộc dict khác.
  const count = await terms.index("by_dict").count(IDBKeyRange.only(dictId));
  const dict = await tx.objectStore("dictionaries").get(dictId);
  if (dict) await tx.objectStore("dictionaries").put({ ...dict, termCount: count, updatedAt: Date.now() });
  await tx.done;

  return drafts.length;
}

/** Mọi từ thuộc một từ điển (theo chỉ mục `by_dict`) — để mở màn xem/sửa. */
export async function listCustomEntries(dictId: string): Promise<DictEntry[]> {
  const db = await getDb();
  return db.getAllFromIndex("terms", "by_dict", dictId);
}
/** Các từ điển cá nhân trong registry (custom: true). Tuỳ chọn lọc theo cặp. */
export async function listCustomDictionaries(pair?: LangPair): Promise<LocalDictionary[]> {
  const db = await getDb();
  const dicts = await db.getAllFromIndex("dictionaries", "by_pair", pair ? IDBKeyRange.only([pair.source, pair.target]) : undefined);
  return dicts.filter((d) => d.custom).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}



/**
 * Lưu toàn bộ một từ điển cá nhân sau khi sửa: nội dung của nó khớp ĐÚNG với
 * `drafts` (thêm/sửa/xoá từng từ, kể cả đổi khoá term/reading) và cập nhật
 * metadata. Xoá đúng các từ của dict này không còn trong `drafts`; ghi lại phần
 * còn lại; tính lại `termCount` và `updatedAt` (để đồng bộ nhận thay đổi).
 */
export async function saveCustomDict(
  dictId: string,
  pair: LangPair,
  meta: { title: string; description?: string; topic?: string },
  drafts: CustomDraft[],
): Promise<number> {
  const title = meta.title.trim() || "Từ điển cá nhân";
  const desired = drafts
    .filter(isDraftFilled)
    .map((d) => ({ ...buildDictEntry(d, pair, title), dictId }));
  const desiredKeys = new Set(desired.map(termKey));

  const db = await getDb();
  const tx = db.transaction(["terms", "dictionaries"], "readwrite");
  const terms = tx.objectStore("terms");

  // Xoá các từ của chính dict này không còn trong bản sửa (kể cả từ bị đổi khoá).
  let cursor = await terms.index("by_dict").openCursor(IDBKeyRange.only(dictId));
  while (cursor) {
    if (!desiredKeys.has(termKey(cursor.value))) await cursor.delete();
    cursor = await cursor.continue();
  }
  for (const entry of desired) await terms.put(entry);

  const count = await terms.index("by_dict").count(IDBKeyRange.only(dictId));
  const dictStore = tx.objectStore("dictionaries");
  const dict = await dictStore.get(dictId);
  if (dict) {
    await dictStore.put({
      ...dict,
      title,
      termCount: count,
      updatedAt: Date.now(),
      description: meta.description?.trim() || undefined,
      topic: meta.topic?.trim() || undefined,
    });
  }
  await tx.done;
  return count;
}
