// Đề xuất một từ lên từ điển hệ thống (#70 — 6.1) sinh ra từ hai chỗ, nên phép
// dựng payload nằm ở đây thay vì trong composition root:
//   • một thẻ kết quả tra  (DictEntry — từ đã có trong một từ điển nào đó),
//   • một từ trong kho của mình (VocabEntry — thêm nhanh / Yomitan / tự định
//     nghĩa) mà từ điển đang chọn không có.
// Logic thuần: data/ui bọc quanh.

import { DictEntry } from "@/shared/db";
import { meaningToLines } from "@/shared/meaning";
import { glossaryToLines, sensesToLines } from "@/shared/structured-content";
import { VocabEntry } from "@/shared/types";

/** Thân yêu cầu `POST /api/contribute` — admin duyệt xong mới vào từ điển. */
export interface ProposalPayload {
  term: string;
  reading?: string;
  term_lang: string;
  native_lang: string;
  gloss: string[];
  pos?: string[];
}

/** Từ loại lưu kèm một từ đã học là văn bản để hiện chip ("noun, suru verb"). */
const POS_SEP = /[,、;；]/;

/** Đề xuất dựng từ một mục từ điển: nghĩa theo sense, từ loại là tag đã khử trùng. */
export function proposalFromDictEntry(entry: DictEntry): ProposalPayload {
  return {
    term: entry.term,
    reading: entry.reading,
    term_lang: entry.term_lang,
    native_lang: entry.native_lang,
    gloss: entry.senses?.length ? sensesToLines(entry.senses) : glossaryToLines(entry.definitions),
    pos: [...new Set((entry.senses ?? []).flatMap((s) => s.tags))],
  };
}

/**
 * Đề xuất dựng từ một từ trong kho: nghĩa là chính ghi chú người dùng đã lưu
 * (payload JSON string[]). Từ loại giữ nguyên chữ như đã lưu — có thể là tên đầy
 * đủ ("danh từ") chứ không phải mã JMdict, nhưng admin đọc lúc duyệt nên thà đưa
 * nguyên văn còn hơn đoán mã.
 */
export function proposalFromVocabEntry(entry: VocabEntry): ProposalPayload {
  return {
    term: entry.term,
    reading: entry.reading,
    term_lang: entry.term_lang,
    native_lang: entry.native_lang,
    gloss: meaningToLines(entry.meaning),
    pos: entry.pos ? entry.pos.split(POS_SEP).map((p) => p.trim()).filter(Boolean) : [],
  };
}
