// Study list — kế thừa ref/jisho-open (common/src/api/studylist.ts). Bộ sưu tập
// từ có tên, theo thư mục (quy ước tên "folder/tên"), chia sẻ/cộng tác được.
// Là dữ liệu NGƯỜI DÙNG, song song với SRS/Word Cloud (không thay thế); `wordId`
// trỏ tới word.id của từ điển → một từ có thể vừa ở list vừa ở hàng ôn tập.

/** Một từ trong study list. `wordId` là id của `word` (từ điển đã chuẩn hoá). */
export interface StudyListWord {
  wordId: number;
  /** Furigana mã hoá kiểu jisho, lưu kèm cho hiển thị nhanh. */
  furigana?: string;
  addedAt: number;
  /** Thứ tự trong list. */
  ord?: number;
}

/** Một study list (= jisho StudyList.Entry). */
export interface StudyList {
  id: string;
  creatorId: string;
  /** Tên; quy ước "folder/tên" để gom thư mục. */
  name: string;
  public: boolean;
  /** Mật khẩu để tham gia làm editor (chia sẻ — pha sau). */
  editorPassword?: string;
  editorIds: string[];
  wordCount: number;
  words: StudyListWord[];
  createdAt: number;
  modifiedAt: number;
  /** Chỉ client điền: từ đang xét có nằm trong list không (cờ "marked"). */
  marked?: "exact" | "spelling";
}

/** Giới hạn (kế thừa jisho) — ép ở tầng app. */
export const STUDYLIST_LIMITS = {
  maxListsPerUser: 1000,
  maxEditors: 100,
  maxWords: 10000,
} as const;
