// Nguồn "bộ từ" — danh sách nhập từ ngoài (JLPT, giáo trình…) để đối chiếu với
// vốn từ. Lớp I/O IndexedDB thuần: phân tích văn bản nằm ở `domain/wordset.ts`,
// so khớp nằm ở `domain/wordsetMatch.ts`.
//
// Vì sao có store riêng chứ không mượn `dictionaries`/`terms`: xem chú thích của
// `Wordset` trong `shared/db.ts`. Tóm tắt: bộ từ không có nghĩa nên không được
// lọt vào kết quả tra cứu, và đường nhập từ điển cá nhân khử trùng với cả JMdict
// nên sẽ nuốt sạch một bộ N1.

import { getDb, Wordset, WordsetWord } from "@/shared/db";
import { LangPair } from "@/shared/languages";
import { uuid } from "@/features/dictionary/data/yomitan";
import { WordsetDraft } from "../domain/wordset";
import { deleteWordsetMedia } from "./wordsetMedia";
import { VocabListWord } from "../domain/vocablist";

export type { Wordset, WordsetWord };

/** Số dòng ghi trong MỘT transaction. Một bộ 20k từ mà ghi một phát thì
 *  transaction sống quá lâu, tab lag thấy rõ; chia lô giữ giao diện còn thở. */
const WRITE_CHUNK = 500;

/**
 * Tạo một bộ từ mới cùng toàn bộ dòng của nó. Trả về id bộ vừa tạo.
 *
 * Metadata ghi **sau cùng**: nếu ghi trước rồi đứt giữa chừng (đóng tab, hết
 * quota) thì danh sách bộ hiện ra một bộ rỗng ma. Ghi sau thì lần nhập hỏng chỉ
 * để lại vài dòng mồ côi vô hại, và nhập lại là ghi đè đúng khoá.
 */
export async function createWordset(
  input: { title: string; term_lang: string; native_lang: string; source: Wordset["source"]; fromId?: string },
  words: WordsetDraft[],
): Promise<string> {
  const id = uuid();
  const db = await getDb();
  for (let i = 0; i < words.length; i += WRITE_CHUNK) {
    const tx = db.transaction("wordset_words", "readwrite");
    for (const w of words.slice(i, i + WRITE_CHUNK)) {
      const row: WordsetWord = {
        setId: id,
        term: w.term,
        reading: w.reading ?? "",
        ...(w.gloss ? { gloss: w.gloss } : {}),
        ...(w.example ? { example: w.example } : {}),
        // Bốn trường dưới chỉ có khi nhập từ gói Anki; media lưu bằng TÊN, blob
        // nằm ở store riêng (`wordsetMedia.ts`).
        ...(w.exampleFurigana ? { exampleFurigana: w.exampleFurigana } : {}),
        ...(w.imageName ? { imageName: w.imageName } : {}),
        ...(w.audioName ? { audioName: w.audioName } : {}),
        ...(w.exampleAudioName ? { exampleAudioName: w.exampleAudioName } : {}),
      };
      await tx.store.put(row);
    }
    await tx.done;
  }
  const set: Wordset = {
    id,
    title: input.title,
    term_lang: input.term_lang,
    native_lang: input.native_lang,
    source: input.source,
    count: words.length,
    importedAt: Date.now(),
    ...(input.fromId ? { fromId: input.fromId } : {}),
  };
  await db.put("wordsets", set);
  return id;
}

/**
 * Các bộ từ của một cặp ngôn ngữ, mới nhập trước. Hai bộ nhập trong cùng một
 * mili-giây (nhập bộ rồi chắt ngay ra bản lọc) thì so tên — không có nấc phụ
 * này, thứ tự danh sách đổi lung tung giữa các lần mở.
 */
export async function listWordsets(pair: LangPair): Promise<Wordset[]> {
  const db = await getDb();
  const sets = await db.getAllFromIndex("wordsets", "by_pair", IDBKeyRange.only([pair.source, pair.target]));
  return sets.sort((a, b) => b.importedAt - a.importedAt || a.title.localeCompare(b.title, "vi"));
}

/**
 * Toàn bộ dòng của một bộ. Khoá mở đầu bằng `setId` nên một khoảng khoá quét
 * trọn bộ mà không cần index (mảng rỗng đứng sau mọi chuỗi trong thứ tự khoá
 * IndexedDB — cùng mẹo với `getAllEntries`).
 */
export async function loadWordsetWords(setId: string): Promise<WordsetWord[]> {
  const db = await getDb();
  return db.getAll("wordset_words", IDBKeyRange.bound([setId], [setId, []]));
}

/** Xoá một bộ: dòng trước, metadata sau — thứ tự ngược lại với lúc tạo, để một
 *  lần xoá dở dang không để lại bộ "còn trong danh sách mà rỗng ruột". */
export async function deleteWordset(setId: string): Promise<void> {
  const db = await getDb();
  let keys = await db.getAllKeys("wordset_words", IDBKeyRange.bound([setId], [setId, []]), WRITE_CHUNK);
  while (keys.length) {
    const tx = db.transaction("wordset_words", "readwrite");
    for (const key of keys) await tx.store.delete(key);
    await tx.done;
    keys = await db.getAllKeys("wordset_words", IDBKeyRange.bound([setId], [setId, []]), WRITE_CHUNK);
  }
  // Media trước, metadata sau: đứt giữa chừng thì còn lại một bộ vẫn hiện trong
  // danh sách và xoá lại được. Xoá metadata trước mới là đường một chiều — bộ
  // biến mất khỏi giao diện trong khi cả trăm MB media nằm lại, không ai với tới.
  await deleteWordsetMedia(setId);
  await db.delete("wordsets", setId);
}

/**
 * Một dòng của bộ theo khoá đầy đủ. `undefined` khi bộ đã bị xoá, hoặc khi thẻ
 * đồng bộ từ máy khác mà máy này chưa nhập bộ ấy — cả hai đều là trạng thái hợp
 * lệ, không phải lỗi.
 */
export async function findWordsetWord(
  setId: string,
  term: string,
  reading: string,
): Promise<WordsetWord | undefined> {
  const db = await getDb();
  return db.get("wordset_words", [setId, term, reading]);
}

/** Chuyển một dòng bộ từ sang `VocabListWord` để overlay tiến độ SRS. */
export function toVocabWord(set: Wordset, row: WordsetWord): VocabListWord {
  return {
    term: row.term,
    ...(row.reading ? { reading: row.reading } : {}),
    term_lang: set.term_lang,
    native_lang: set.native_lang,
  };
}

/** Tải một bộ và dựng sẵn danh sách từ cho lưới. */
export async function loadWordset(set: Wordset): Promise<{ rows: WordsetWord[]; words: VocabListWord[] }> {
  const rows = await loadWordsetWords(set.id);
  return { rows, words: rows.map((r) => toVocabWord(set, r)) };
}
