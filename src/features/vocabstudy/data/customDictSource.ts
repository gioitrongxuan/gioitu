// Nguồn "từ điển cá nhân" — các từ điển người dùng tự soạn (local IndexedDB,
// custom: true). Chọn một dict rồi lấy toàn bộ từ trong nó (listCustomEntries) —
// không cần phân trang vì dict cá nhân thường nhỏ. Offline, dùng cho mọi user.

import { listCustomDictionaries, listCustomEntries } from "@/features/dictionary/data/customDict";
import { LocalDictionary } from "@/shared/db";
import { VocabListWord } from "../domain/vocablist";

export type { LocalDictionary };

/** Chuyển một entry từ điển sang VocabListWord (chỉ giữ trường cần overlay SRS). */
export function toVocabWord(e: { term: string; reading?: string; term_lang: string; native_lang: string }): VocabListWord {
  return { term: e.term, reading: e.reading, term_lang: e.term_lang, native_lang: e.native_lang };
}

export { listCustomDictionaries };

/** Tải toàn bộ từ trong một custom dict, sẵn sàng overlay SRS. */
export async function loadCustomDict(dictId: string): Promise<{ words: VocabListWord[] }> {
  const entries = await listCustomEntries(dictId);
  return { words: entries.map(toVocabWord) };
}
