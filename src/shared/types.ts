// Core data model — mirrors section 5 of the SPEC (v2).
// Unique key: (user_id, term, term_lang).

/** Lifecycle status of a vocabulary entry (SPEC 4.2). */
export type WordStatus = "LEARNING" | "LEARNED" | "RELAPSED";

/** SM-2 card state (SPEC 4.4). */
export type CardState = "NEW" | "LEARNING" | "REVIEW";

/** Self-graded answer button on a flashcard (SPEC 4.4). */
export type ReviewGrade = "again" | "hard" | "good" | "easy";

/**
 * A single vocabulary entry. `srs_interval` is always stored in **minutes**
 * so that learning steps (1, 10 min) and review intervals (days × 1440)
 * share one unit (SPEC 5, "Ghi chú đơn vị").
 */
export interface VocabEntry {
  user_id: string;
  term: string;
  term_lang: string; // ISO 639-1, e.g. "en", "ja"
  native_lang: string; // ISO 639-1, e.g. "vi"
  meaning: string; // JSON/text from Yomitan or custom input
  /** Kana reading, for furigana over the headword. Absent for kana-only / legacy. */
  reading?: string;
  /** Part-of-speech text (e.g. "noun, suru verb"), shown as tag chips. Optional. */
  pos?: string;
  /** Example sentence, shown apart from the numbered glosses. Optional. */
  example?: string;
  /**
   * Phân tích AI (Premium) cho từng câu ví dụ: cách từ được dùng trong câu + ý
   * nghĩa cả câu. Lưu dạng JSON string `Record<câu, SentenceAnalysis>` (khớp kiểu
   * với `example`/`meaning`). Key = câu nguồn, value = phân tích. Do server sinh
   * lúc Yomitan "+" mang sentence, CHỈ khi user là Premium. Lưu cùng payload (JSON
   * blob) nên đồng bộ qua syncStore mà không cần migration.
   */
  sentence_analysis?: string;
  is_custom: boolean;

  /**
   * Nhãn phân loại do người dùng gắn cho thẻ (#249) — "ngữ pháp", "N3", "chỗ
   * làm"… Đã chuẩn hoá & khử trùng bởi `review/domain/labels.ts`. Gọi là
   * `labels` chứ không phải `tags` vì "tag" trong repo này đã là thẻ từ trên
   * Word Cloud (`CloudTag`) và tag từ loại Yomitan. Optional & không có index →
   * thêm vào record KHÔNG cần bump DB_VERSION, và đồng bộ theo payload JSON như
   * các field khác (không cần migration server).
   */
  labels?: string[];

  lookup_count: number;
  last_lookup_at: number; // epoch ms — for debounce & optional time-decay

  status: WordStatus;

  /**
   * Epoch ms lúc từ CHUYỂN sang "đã thuộc" (LEARNED) gần nhất. Để trang Đã thuộc
   * nhóm theo đúng thời điểm thuộc thay vì `last_lookup_at` (kể sai câu chuyện).
   * Chỉ đóng dấu khi vừa chuyển vào LEARNED; giữ nguyên khi đánh dấu lại hoặc
   * rời khỏi LEARNED. Vắng ở entry cũ / chưa từng thuộc → fallback last_lookup_at.
   * Optional & không có index → thêm vào record KHÔNG cần bump DB_VERSION, và
   * đồng bộ theo payload JSON như các field khác (không cần migration server).
   */
  learned_at?: number;

  /**
   * Vì sao từ này ở trạng thái LEARNED, khi lý do KHÔNG phải tốt nghiệp qua SRS.
   * Hiện chỉ đóng dấu cho một nguồn: `"sieve"` — người dùng sàng một bộ từ nhập
   * ngoài rồi đánh dấu đã biết hàng loạt. Đây là kênh "tự khai đã thuộc" mạnh
   * nhất trong app (một cú bấm, hàng trăm thẻ), nên phải đếm riêng được nếu sau
   * này chốt quyết định mở #2 trong BACKLOG theo hướng siết lại.
   *
   * CẢNH BÁO: vắng cờ này KHÔNG có nghĩa "đã tốt nghiệp đàng hoàng" — các nút
   * tự khai lẻ (✓ DetailPanel, quick-mark KanjiStats/VocabStudy) hiện vẫn không
   * đóng dấu gì; chúng chỉ được gắn cờ khi quyết định #2 ngã ngũ.
   *
   * Optional & không có index → thêm vào record KHÔNG cần bump DB_VERSION, và
   * đồng bộ theo payload JSON như các field khác.
   */
  learned_source?: "sieve";

  /**
   * `id` của bộ từ đã sinh ra thẻ này (store `wordsets`). Vắng nghĩa là thẻ đến
   * từ tra cứu — đường vào cũ và vẫn là đường chính.
   *
   * Có cờ này để **Bản đồ từ** lọc chúng ra: bản đồ là bức tranh những từ mình
   * đã phải tra, tức những từ mình đang quên. Đổ 1.852 từ của một bộ JLPT vào
   * đó là xoá sạch ý nghĩa của nó. Tiến độ học thì vẫn dùng CHUNG một vốn từ,
   * chỉ khác chỗ quản lý.
   *
   * Cờ bị **xoá khi từ đó được tra** (`registerLookup`): lúc ấy tín hiệu quên đã
   * xảy ra thật, từ thuộc về bản đồ như mọi từ khác.
   *
   * Optional & không có index → thêm vào record KHÔNG cần bump DB_VERSION, và
   * đồng bộ theo payload JSON như các field khác.
   */
  from_wordset?: string;

  // --- SM-2 card fields ---
  card_state: CardState | null; // null until a card is created (gating, SPEC 4.4)
  learning_step: number; // index into learning/relearning steps
  ease_factor: number; // default 2.5, floor 1.3
  reps: number; // consecutive correct reviews
  lapses: number; // number of "Again"/relapses
  /**
   * True while the card is going through the *relearning* steps (after an
   * "Again" from REVIEW or a relapse). Needed to pick relearningSteps vs
   * learningSteps; not part of the SPEC table but required to faithfully
   * simulate SM-2 step selection.
   */
  is_relearning: boolean;
  srs_interval: number; // current interval, in MINUTES
  next_review: number | null; // epoch ms of next review (null until carded)
  /**
   * Interval (phút) NGAY TRƯỚC lần lapse gần nhất, ghi lại lúc một thẻ REVIEW bị
   * "Again"/relapse. Dùng khi thẻ tốt nghiệp khỏi relearning để khôi phục một
   * phần interval cũ thay vì reset về 1 ngày; xoá (undefined) khi không còn lapse
   * treo. Optional & không có index → thêm vào record KHÔNG cần bump DB_VERSION.
   */
  lapsed_from_interval?: number;

  // --- Lifecycle overrides (orthogonal to the SM-2 card above) ---
  /**
   * Tombstone. Set when the user deletes the word. The row is KEPT (not hard-
   * removed) so the deletion still wins the last-write-wins sync and propagates
   * to the cloud / other devices instead of being resurrected from them.
   */
  deleted_at: number | null;

  created_at: number;
  updated_at: number;
}

/**
 * Một dòng nhật ký ôn tập, **append-only**: mỗi lượt chấm thẻ trong phiên ôn ghi
 * đúng một dòng và không bao giờ sửa/xoá. Đây là điều kiện tiên quyết cho thống
 * kê (retention, forecast) và cho FSRS sau này — mỗi ngày chưa log là dữ liệu
 * quên mất vĩnh viễn. Lưu cục bộ trong IndexedDB (store `review_log`); chưa đồng
 * bộ lên cloud (để dành cho giai đoạn thống kê).
 *
 * `interval_before`/`interval_after` là interval (PHÚT) của thẻ ngay trước và
 * ngay sau lượt chấm — cùng đơn vị với `VocabEntry.srs_interval`.
 */
export interface ReviewLogEntry {
  /** Khoá tự tăng do IndexedDB cấp; vắng khi dựng bản ghi để ghi vào. */
  id?: number;
  user_id: string;
  term: string;
  term_lang: string; // ISO 639-1
  grade: ReviewGrade;
  ts: number; // epoch ms lúc chấm
  interval_before: number; // phút, trước khi chấm
  interval_after: number; // phút, sau khi chấm
}

/**
 * Một từ đã tra, **gộp theo từ** (khác `review_log` là append-only): mỗi lượt tra
 * cùng một từ chỉ tăng `count` và dời `lastAt`. Chỉ để trang Tra cứu kể lại "vừa
 * tra gì / tra gì nhiều nhất" (#269).
 *
 * KHÔNG dính tới `VocabEntry.lookup_count` — cái đó là dữ liệu học (gating/SRS,
 * quyết định mở #1 trong BACKLOG), còn đây thuần là lịch sử để mở lại nhanh: ghi
 * vào đây không tạo thẻ, không đụng Word Cloud, không đồng bộ lên cloud.
 */
export interface SearchHistoryEntry {
  user_id: string;
  /** Dạng từ điển của từ đã tra (lemma), giống khoá dùng cho SRS. */
  term: string;
  term_lang: string; // ISO 639-1
  native_lang: string; // ISO 639-1
  /** Cách đọc, để hiện furigana-lite cạnh từ; vắng với từ chỉ có kana/latin. */
  reading?: string;
  count: number;
  lastAt: number; // epoch ms của lượt tra gần nhất
}

/** The composite primary key as a single string (for IndexedDB keyPath). */
export type EntryKey = string;

export function entryKey(user_id: string, term: string, term_lang: string): EntryKey {
  return `${user_id}\0${term}\0${term_lang}`;
}

export function keyOf(e: Pick<VocabEntry, "user_id" | "term" | "term_lang">): EntryKey {
  return entryKey(e.user_id, e.term, e.term_lang);
}

/**
 * Kết quả phân tích AI cho một câu ví dụ của một từ. Hai phần tách bạch để UI
 * hiển thị gọn dưới mỗi sentence:
 *  - `usage`  : cách từ này xuất hiện trong câu (từ loại / vai trò ngữ pháp / ngữ cảnh).
 *  - `meaning`: ý nghĩa cả câu, diễn giải bằng ngôn ngữ đích (vi).
 */
export interface SentenceAnalysis {
  usage: string;
  meaning: string;
}
