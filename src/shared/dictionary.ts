// Mô hình từ điển canonical — kế thừa ref/jisho-open (common/src/api/word.ts),
// mở rộng cho gioitu: gloss tiếng Việt, Hán-Việt, ảnh + bình luận Mazii, và một
// "escape-hatch" giữ structured-content của Yomitan.
//
// Đây là HỢP ĐỒNG đã-ráp mà API trả về và UI render (≈ jisho Word.Entry): một
// headword với nhiều cách viết (headings), nghĩa gộp từ mọi nguồn (senses), pitch,
// ảnh, bình luận. Server lưu chuẩn-hoá-vừa-phải rồi ráp lại thành kiểu này.

import {
  PartOfSpeechTag,
  MiscTag,
  FieldDomainTag,
  DialectTag,
  LanguageTag,
  GlossTypeTag,
  JlptLevel,
} from "./jisho-tags";
import { GlossaryNode } from "./structured-content";

// Re-export để nơi khác (form sửa, store) chỉ cần import từ một chỗ.
export type { JlptLevel } from "./jisho-tags";

/** Một cách viết của từ (= jisho Heading), kèm cờ chất lượng + hạng phổ biến. */
export interface Heading {
  /** Chữ viết (kanji, hoặc kana/EN nếu không có kanji). */
  base: string;
  /** Âm kana; vắng khi base vốn đã là kana. */
  reading?: string;
  /** Furigana mã hoá kiểu jisho (xem shared/furigana.ts), sinh lúc import. */
  furigana?: string;

  // Cờ chất lượng (jisho)
  ateji?: boolean;
  gikun?: boolean;
  nonJouyouKanji?: boolean;
  irregularKanji?: boolean;
  irregularKana?: boolean;
  irregularOkurigana?: boolean;
  outdatedKanji?: boolean;
  outdatedKana?: boolean;
  rareKanji?: boolean;
  searchOnlyKanji?: boolean;
  searchOnlyKana?: boolean;

  // Hạng phổ biến (jisho)
  jlpt?: JlptLevel;
  rankNews?: number;
  rankNf?: number;
  rankIchi?: number;
  rankSpec?: number;
  rankGai?: number;
  rankAnimeDrama?: number;
  rankWikipedia?: number;
  /** Điểm phổ biến của cách viết này (cao = phổ biến hơn). */
  score?: number;

  /** Hán-Việt cho cách viết này (gioitu/Mazii). */
  hanViet?: string;
}

/** Một nghĩa-con: chuỗi thuần, hoặc chuỗi có kiểu (lit./fig./tm…). */
export type Gloss = string | { text: string; type: GlossTypeTag };

/** Nguồn ngôn ngữ của từ mượn (jisho LanguageSource). */
export interface LanguageSource {
  language?: LanguageTag;
  partial?: boolean;
  /** wasei-eigo: "tiếng Anh chế kiểu Nhật". */
  wasei?: boolean;
  source?: string;
}

/** Tham chiếu chéo tới từ khác (đồng nghĩa/trái nghĩa). */
export interface CrossReference {
  base: string;
  reading?: string;
  senseIndex?: number;
  type?: "antonym";
}

/** Câu ví dụ. jisho dùng `en`; gioitu dùng `vi`. */
export interface ExampleSentence {
  /** Headword như xuất hiện trong ví dụ. */
  term?: string;
  ja: string;
  vi: string;
}

/** Một sense (= jisho Sense) — gloss tiếng Việt, kèm POS và các nhãn ngữ dụng. */
export interface Sense {
  pos: PartOfSpeechTag[];
  gloss: Gloss[];
  misc?: MiscTag[];
  field?: FieldDomainTag[];
  info?: string[];
  lang?: LanguageSource[];
  xref?: CrossReference[];
  dialect?: DialectTag[];
  /** Giới hạn sense này vào một số cách viết cụ thể. */
  restrict?: string[];
  examples?: ExampleSentence[];

  /** Nguồn từ điển đóng góp sense này (gioitu đa nguồn). */
  dictionary?: string;
  /** Escape-hatch: giữ structured-content của Yomitan khi nguồn không phẳng được. */
  glossary?: GlossaryNode[];
}

/** Pitch accent — jisho dùng chuỗi mã hoá `text`; Mazii cho dạng giàu hơn. */
export interface PitchAccent {
  /** Dạng mã hoá kiểu jisho. */
  text?: string;
  /** Dạng Mazii: âm kana đầy đủ + chuỗi accent + tách mora. */
  kana?: string;
  accent?: string;
  moras?: string[];
}

/** Ảnh minh hoạ (read-only, nhập từ Mazii). */
export interface DictImage {
  url: string;
  source?: string;
}

/** Bình luận cộng đồng (read-only, nhập từ Mazii). */
export interface DictComment {
  mean: string;
  likes: number;
  dislikes: number;
  author?: string;
  avatar?: string;
  source?: string;
  createdAt?: number;
}

// ─────────────────────────────────────────────────────────────────────────
// Hợp đồng SỬA (admin): lớp nghĩa thủ công + thuộc tính cấp từ mà con người
// nhập tay. Là input của PUT /dict/term và output của GET /dict/term/edit.
// Cố ý phẳng hơn Sense (gloss là chuỗi thuần, không structured content) vì đây
// là thứ người dùng gõ trong form; server ráp lại thành Sense khi lưu.
// ─────────────────────────────────────────────────────────────────────────

/** Một nghĩa sửa được: từ loại + nhãn cách dùng + các dòng nghĩa + ví dụ + ghi chú. */
export interface EditableSense {
  /** Mã từ loại (POS) — "n", "v5k", "adj-i"… */
  pos: string[];
  /** Mã nhãn cách dùng / sắc thái (misc) — "uk", "col", "hon"… */
  misc: string[];
  /** Các dòng nghĩa (mỗi phần tử một nghĩa). */
  gloss: string[];
  /** Câu ví dụ (nguồn + bản dịch tiếng Việt). */
  examples?: { ja: string; vi: string }[];
  /** Ghi chú cách dùng. */
  info?: string[];
}

/** Toàn bộ thuộc tính sửa được của một từ (lớp nghĩa thủ công + cấp từ). */
export interface EditableTerm {
  term: string;
  term_lang: string;
  native_lang: string;
  reading?: string;
  /** Âm Hán-Việt của cách viết chính. */
  hanViet?: string;
  jlpt?: JlptLevel;
  pitch?: PitchAccent[];
  senses: EditableSense[];
}

/**
 * Nghĩa của một nguồn đã nhập (Mazii/Yomitan…), sửa được theo từng nguồn —
 * mỗi nguồn là một dòng `entry` riêng nên mang `entry_id` để lưu đúng chỗ.
 * Lưu ý: sửa sẽ thay glossary có cấu trúc của nguồn bằng văn bản thuần.
 */
export interface ImportedEntryEdit {
  entry_id: string;
  dictionary?: string;
  senses: EditableSense[];
}

/** Một ảnh minh hoạ trong trạng thái sửa (id DB để xoá từng ảnh). */
export interface EditableImage {
  id: string;
  url: string;
  source?: string;
}

/** Một bình luận trong trạng thái sửa (chỉ cần đủ để nhận diện và gỡ). */
export interface EditableComment {
  id: string;
  mean: string;
  author?: string;
}

/**
 * Trạng thái GET để mở form sửa: từ đã sửa được + id lexeme (để lưu đúng chỗ) +
 * nghĩa của từng nguồn đã nhập + ảnh/bình luận (gỡ được) + cờ kiểm duyệt.
 * `word_id` vắng nghĩa là từ chưa tồn tại.
 */
export interface TermEditState extends EditableTerm {
  word_id?: string;
  verified: boolean;
  imported: ImportedEntryEdit[];
  images: EditableImage[];
  comments: EditableComment[];
}

/** Một từ điển đã ráp đầy đủ (≈ jisho Word.Entry) — kiểu API trả về & UI render. */
export interface DictionaryEntry {
  /** Id dòng `word` — client cần để gọi các thao tác admin (duyệt/sửa). */
  word_id?: string;
  term_lang: string;
  native_lang: string;
  /** Các cách viết; phần tử đầu là cách viết chính. */
  headings: Heading[];
  /** Nghĩa gộp từ mọi nguồn (mỗi sense có thể ghi `dictionary`). */
  senses: Sense[];
  pitch?: PitchAccent[];
  images?: DictImage[];
  comments?: DictComment[];
  /** Điểm phổ biến của cả entry, để xếp kết quả tìm. Cao = phổ biến hơn. */
  score: number;
  /** Đã được admin kiểm duyệt nội dung (tích xanh cạnh từ). */
  verified?: boolean;
}
