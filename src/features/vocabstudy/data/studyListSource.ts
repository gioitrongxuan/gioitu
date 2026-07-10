// Nguồn "study list" — bộ sưu tập từ của người dùng (server-side, cần đăng nhập).
// Bọc studyListApi thành VocabListWord[] để overlay tiến độ SRS qua domain.

import {
  getList,
  listMine,
  StudyListDetail,
  StudyListSummary,
  StudyListWordView,
} from "@/features/studylist/data/studyListApi";
import { VocabListWord } from "../domain/vocablist";

export type { StudyListSummary, StudyListDetail };

/** Chuyển một từ trong list (view server) sang VocabListWord để overlay SRS. */
export function toVocabWord(w: StudyListWordView): VocabListWord {
  return { term: w.base, reading: w.reading, term_lang: w.term_lang, native_lang: w.native_lang };
}

export { listMine, getList };

/** Tải chi tiết một list và dựng sẵn VocabListWord[] để UI overlay tiến độ. */
export async function loadStudyList(id: string): Promise<{ detail: StudyListDetail; words: VocabListWord[] }> {
  const detail = await getList(id);
  return { detail, words: detail.words.map(toVocabWord) };
}
