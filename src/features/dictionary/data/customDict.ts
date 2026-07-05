// Từ điển cá nhân (Issue #69) — lớp I/O IndexedDB. Tạo/bổ sung một từ điển
// người dùng tự soạn: nó chỉ là các bản ghi `DictEntry` bình thường gắn `dictId`
// trỏ tới một mục trong registry `dictionaries`, nên tra cứu nguồn "Trên máy"
// thấy ngay mà KHÔNG cần đổi schema. Logic dựng entry/khử trùng là hàm thuần ở
// domain/customEntry; ở đây chỉ có phần chạm IndexedDB.

import { getDb, LocalDictionary } from "@/shared/db";
import { LangPair } from "@/shared/languages";
import { CustomDraft, buildDictEntry, termReadingKey } from "../domain/customEntry";
import { uuid } from "./yomitan";

/** Tạo một từ điển cá nhân rỗng trong registry và trả về id của nó. */
export async function createLocalDictionary(input: {
  title: string;
  term_lang: string;
  native_lang: string;
  description?: string;
  topic?: string;
}): Promise<string> {
  const id = uuid();
  const dict: LocalDictionary = {
    id,
    title: input.title,
    term_lang: input.term_lang,
    native_lang: input.native_lang,
    termCount: 0,
    importedAt: Date.now(),
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
  if (dict) await tx.objectStore("dictionaries").put({ ...dict, termCount: count });
  await tx.done;

  return drafts.length;
}
