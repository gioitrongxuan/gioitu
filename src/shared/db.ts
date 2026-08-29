// IndexedDB schema and access (SPEC 2.A / 2.C).
// Three concerns live here:
//   - `terms`        : dictionary entries, scoped per language pair (forward
//                      only: term → meaning). Yomitan-rich: structured-content
//                      glossary, tags, word-type rules. Holds BOTH imported
//                      dictionaries (re-importable) and hand-authored custom
//                      dictionaries (NOT re-importable) — see the upgrade note.
//   - `dictionaries` : a registry of imported dictionaries (title, counts,
//                      languages) so they can be listed / removed locally,
//                      the way Yomitan manages installed dictionaries.
//   - `user_data`    : cached learning data (source of truth is Cloud DB).
//
// IndexedDB is the PRIMARY dictionary source (fastest). The backend is a
// fallback. For user data, IndexedDB is only a cache.

import { openDB, DBSchema, IDBPDatabase } from "idb";
import { VocabEntry, ReviewLogEntry, SearchHistoryEntry } from "./types";
import { GlossaryNode, ResolvedTag, Sense } from "./structured-content";
import type { PitchAccent, DictImage, DictComment } from "./dictionary";
import { TermMetaEntry } from "./term-meta";

export type { TermMetaEntry } from "./term-meta";

export interface DictEntry {
  term: string;
  reading?: string;
  /**
   * Flat list of glossary nodes (strings or Yomitan structured content). Kept
   * for back-compat: plain-text dictionaries stay arrays of strings.
   */
  definitions: GlossaryNode[];
  term_lang: string;
  native_lang: string;

  // --- Yomitan-rich, all optional (absent for legacy / plain-text entries) ---
  /** Glossary grouped by sense, each with its part-of-speech tags. */
  senses?: Sense[];
  /** Word-type rules ("v5k", "v1", "adj-i", …) used by the deinflector. */
  rules?: string;
  /** Term-level tags (e.g. ["⭐", "common"]). */
  termTags?: string[];
  /**
   * Tag codes (from `definitionTags`/`termTags`) resolved against the source
   * dictionary's `tag_bank` — keyed by code → full name, category, notes. Lets
   * the UI expand "n" → "noun" and colour-code tags the way Yomitan does.
   */
  tagMeta?: Record<string, ResolvedTag>;
  /** Yomitan ranking score (higher = more relevant). */
  score?: number;
  /** Source dictionary title (for display). */
  dictionary?: string;
  /** Source dictionary id (for bulk deletion). */
  dictId?: string;

  // --- Trường phong phú kiểu jisho (từ nguồn server/Mazii; vắng cho Yomitan local) ---
  /** Hán-Việt của cách viết chính (vd "KHẨN CẤP TỊ NAN"). */
  hanViet?: string;
  /** JLPT level của cách viết chính (5..1). */
  jlpt?: number;
  /** Pitch accent (kana + accent + mora). */
  pitch?: PitchAccent[];
  /** Ảnh minh hoạ (read-only, từ Mazii). */
  images?: DictImage[];
  /** Bình luận cộng đồng (read-only, từ Mazii). */
  comments?: DictComment[];
  /** Id dòng `word` trên server — cần cho các thao tác admin (duyệt/sửa). */
  wordId?: string;
  /** Đã được admin kiểm duyệt nội dung (tích xanh cạnh từ). */
  verified?: boolean;

  /**
   * Mốc LWW theo TỪNG TỪ cho merge term-level của từ điển cá nhân (#166).
   * Chỉ đóng dấu khi nội dung từ thật sự đổi; vắng ở entry nhập .zip / legacy
   * (khi đó merge dùng mốc của cả registry làm fallback).
   */
  updatedAt?: number;
}

/** A registry entry for one imported dictionary (client side). */
export interface LocalDictionary {
  id: string;
  title: string;
  term_lang: string;
  native_lang: string;
  termCount: number;
  /** Term-meta rows (IPA/pitch/freq) contributed — non-zero for meta-only dicts. */
  metaCount?: number;
  importedAt: number;
  revision?: string;
  /** True for dictionaries the user builds by hand (Từ điển cá nhân, Issue #69). */
  custom?: boolean;
  /** Mô tả tự do (chỉ dùng cho từ điển cá nhân). */
  description?: string;
  /** Chủ đề / lĩnh vực (chỉ dùng cho từ điển cá nhân). */
  topic?: string;
  /**
   * Dấu thời gian cho đồng bộ từ điển cá nhân (LWW, #70). Mặc định = importedAt
   * khi vắng. Chỉ có ý nghĩa với từ điển `custom`.
   */
  updatedAt?: number;
  /** Tombstone: đã xoá — giữ lại registry để lan truyền việc xoá qua sync. */
  deletedAt?: number;
  /**
   * Tombstone theo TỪNG TỪ (#166): khoá term (termMergeKey) → epoch ms lúc xoá,
   * để merge term-level lan truyền việc xoá một từ thay vì hồi sinh nó từ cache
   * của máy khác. Chỉ dùng cho từ điển `custom`; gỡ khi từ được thêm lại.
   */
  deletedTerms?: Record<string, number>;
}

/**
 * Một **bộ từ** nhập từ ngoài (JLPT N1, giáo trình, danh sách chép từ web…) —
 * danh sách THAM CHIẾU chỉ đọc để đối chiếu với vốn từ của người dùng, cố ý
 * KHÔNG nằm trong `terms`/`dictionaries`. Ba lý do:
 *  1. `terms` là nguồn tra cứu: một bộ từ chỉ có mặt chữ, không nghĩa, chui vào
 *     đó là kết quả tra hiện ra hit rỗng.
 *  2. Đường nhập của Từ điển cá nhân khử trùng với TOÀN BỘ `terms` cùng cặp
 *     ngôn ngữ (`existingTermKeys` + `dedupe`) — nhập N1 vào đó thì gần như mọi
 *     từ đều rơi vào `duplicates` vì JMdict đã có sẵn, tức mất trắng danh sách.
 *  3. Bộ từ không phải "bộ sưu tập của tôi": không sửa, không đồng bộ, xoá lúc
 *     nào cũng được vì nhập lại là xong.
 */
export interface Wordset {
  id: string;
  title: string;
  term_lang: string;
  native_lang: string;
  /** Đường vào: dán văn bản, thả tệp, hay chắt ra từ một bộ khác sau khi sàng. */
  source: "paste" | "file" | "sieve";
  count: number;
  importedAt: number;
  /** Bộ gốc khi `source === "sieve"` — để biết bản chắt này từ đâu ra. */
  fromId?: string;
}

/** Một từ trong bộ từ. `reading` là chuỗi rỗng (không phải undefined) khi vắng —
 *  nó nằm trong keyPath, mà IndexedDB không cho undefined làm thành phần khoá. */
export interface WordsetWord {
  setId: string;
  term: string;
  reading: string;
  /** Nghĩa gợi ý kèm theo danh sách nguồn (nếu có) — chỉ để hiện, không tra cứu. */
  gloss?: string;
  /** Nhóm/bài trong bộ gốc ("Bài 12") — giữ để sàng theo từng bài. */
  group?: string;
}

interface GioituDB extends DBSchema {
  terms: {
    // Composite key scopes each entry to its language pair AND its reading, so
    // homographs with different readings (辛い からい "cay" vs つらい "khổ") are
    // stored separately instead of overwriting one another.
    key: [string, string, string, string]; // [term_lang, native_lang, term, reading]
    value: DictEntry;
    indexes: {
      by_pair: [string, string];
      by_dict: string;
      // Look up by reading so typing a word's reading (e.g. さくら, or romaji
      // converted to kana) finds an entry keyed under its kanji term (桜).
      by_reading: [string, string, string];
    };
  };
  dictionaries: {
    key: string; // id
    value: LocalDictionary;
    indexes: { by_pair: [string, string] };
  };
  term_meta: {
    // Keyed so the same (term, reading, mode) can coexist across dictionaries
    // and re-importing one dictionary overwrites rather than duplicates.
    key: [string, string, string, string, string, string]; // [pair…, term, reading, mode, dictId]
    value: TermMetaEntry;
    indexes: { by_lookup: [string, string, string]; by_dict: string };
  };
  user_data: {
    key: [string, string, string]; // [user_id, term, term_lang]
    value: VocabEntry;
    indexes: { by_next_review: number; by_status: string };
  };
  review_log: {
    // Append-only: khoá tự tăng, không bao giờ sửa/xoá một dòng đã ghi.
    key: number; // id (autoIncrement)
    value: ReviewLogEntry;
    // Truy vấn theo người dùng, sắp theo thời gian (thống kê/forecast).
    indexes: { by_user_ts: [string, number] };
  };
  search_history: {
    // Gộp theo từ (tra lại chỉ tăng count), nên khoá là chính danh tính của từ.
    // Không cần index: một người dùng chỉ giữ tối đa HISTORY_LIMIT dòng, đọc hết
    // rồi sắp trong bộ nhớ rẻ hơn nuôi thêm index.
    key: [string, string, string, string]; // [user_id, term_lang, native_lang, term]
    value: SearchHistoryEntry;
  };
  wordsets: {
    key: string; // id
    value: Wordset;
    indexes: { by_pair: [string, string] };
  };
  wordset_words: {
    // Khoá mở đầu bằng `setId` nên một IDBKeyRange trên [setId] … [setId, []]
    // quét trọn một bộ — không cần index by_set (cùng mẹo với `getAllEntries`).
    key: [string, string, string]; // [setId, term, reading]
    value: WordsetWord;
  };
}

const DB_NAME = "gioitu";
const DB_VERSION = 10;

let dbPromise: Promise<IDBPDatabase<GioituDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<GioituDB>> {
  if (!dbPromise) {
    dbPromise = openDB<GioituDB>(DB_NAME, DB_VERSION, {
      // Tab NÀY đang giữ một connection version cũ, chặn tab khác nâng cấp: đóng
      // ngay và quên connection đi, để tab kia chạy tiếp và lần `getDb()` sau ở
      // tab này mở lại ở version mới. Không có nó, hai tab mở cùng lúc lúc đổi
      // version là một bên treo vĩnh viễn ở `onblocked`.
      blocking() {
        const open = dbPromise;
        dbPromise = null; // lần getDb() sau mở lại ở version mới
        void open?.then((db) => db.close()).catch(() => {});
      },
      // Chiều ngược lại: tab kia (bản cũ, chưa có `blocking` ở trên) không chịu
      // đóng nên lần mở này đứng im. `openDB` sẽ KHÔNG bao giờ resolve — nơi gọi
      // phải tự có mốc chờ (DB_SLOW_MS) để còn báo cho người dùng.
      blocked() {
        console.warn("IndexedDB upgrade blocked — một tab khác đang giữ version cũ");
      },
      upgrade(db, oldVersion, _newVersion, tx) {
        // Versioned, NON-destructive migrations. Store history:
        //   v3  structured content + tags + rules; adds `dictionaries` registry.
        //   v4  resolved tag metadata (from each dictionary's tag_bank).
        //   v5  `terms` keyPath gains `reading` so homographs stop overwriting.
        //   v6  adds `term_meta` (Yomitan term-meta banks: IPA/pitch/freq).
        //   v7  adds the `by_reading` index (a reading look-up finds entries
        //       keyed under their kanji term).
        //   v8  adds the append-only `review_log` store (one row per graded
        //       card in a review session) — a new store, so a pure add: no
        //       existing store is touched.
        //   v9  adds `search_history` (lịch sử tra cứu cho trang Tra cứu) —
        //       cũng là store mới, pure add.
        //   v10 adds `wordsets` + `wordset_words` (bộ từ nhập ngoài để sàng ra
        //       phần đã biết) — hai store MỚI, pure add.
        //
        // `terms` is NOT merely a re-importable cache anymore: Từ điển cá nhân
        // (CustomDictionary) writes hand-authored rows into it under a `dictId`
        // whose registry entry has `custom: true`, and those rows CANNOT be
        // rebuilt by re-import. So we never drop `terms` wholesale on a bump.
        // Custom rows can only exist from v5 on (they need the reading-aware
        // key), and from v5 on we never recreate the store — so they always
        // survive. ⚠️ If a future migration must change the `terms` keyPath
        // again, it MUST first carry across every row whose `dictId` belongs to
        // a custom dictionary before recreating the store.
        const hasTerms = db.objectStoreNames.contains("terms");
        if (!hasTerms || oldVersion < 5) {
          // Fresh DB, or crossing the v5 keyPath change: pre-v5 rows are legacy
          // imported dictionaries (re-importable) and no custom rows exist yet.
          if (hasTerms) db.deleteObjectStore("terms");
          const terms = db.createObjectStore("terms", {
            keyPath: ["term_lang", "native_lang", "term", "reading"],
          });
          terms.createIndex("by_pair", ["term_lang", "native_lang"]);
          terms.createIndex("by_dict", "dictId");
          terms.createIndex("by_reading", ["term_lang", "native_lang", "reading"]);
        } else {
          // v5/v6 → current: keyPath already includes `reading`; backfill any
          // index introduced after this DB was created, leaving the (possibly
          // custom) rows untouched.
          const terms = tx.objectStore("terms");
          if (!terms.indexNames.contains("by_pair"))
            terms.createIndex("by_pair", ["term_lang", "native_lang"]);
          if (!terms.indexNames.contains("by_dict"))
            terms.createIndex("by_dict", "dictId");
          if (!terms.indexNames.contains("by_reading"))
            terms.createIndex("by_reading", ["term_lang", "native_lang", "reading"]);
        }

        const legacy = "reverse_tokens" as never;
        if (db.objectStoreNames.contains(legacy)) db.deleteObjectStore(legacy);

        if (!db.objectStoreNames.contains("dictionaries")) {
          const dicts = db.createObjectStore("dictionaries", { keyPath: "id" });
          dicts.createIndex("by_pair", ["term_lang", "native_lang"]);
        }

        if (!db.objectStoreNames.contains("term_meta")) {
          const meta = db.createObjectStore("term_meta", {
            keyPath: ["term_lang", "native_lang", "term", "reading", "mode", "dictId"],
          });
          meta.createIndex("by_lookup", ["term_lang", "native_lang", "term"]);
          meta.createIndex("by_dict", "dictId");
        }

        if (!db.objectStoreNames.contains("user_data")) {
          const user = db.createObjectStore("user_data", {
            keyPath: ["user_id", "term", "term_lang"],
          });
          user.createIndex("by_next_review", "next_review");
          user.createIndex("by_status", "status");
        }

        // Append-only review log (v8). Bump AN TOÀN nhất: chỉ tạo store MỚI khi
        // chưa có, không đụng store cũ nào. `id` tự tăng để mỗi lượt chấm là một
        // dòng độc lập, không bao giờ ghi đè.
        if (!db.objectStoreNames.contains("review_log")) {
          const log = db.createObjectStore("review_log", {
            keyPath: "id",
            autoIncrement: true,
          });
          log.createIndex("by_user_ts", ["user_id", "ts"]);
        }

        // Lịch sử tra cứu (v9) — lại là một store MỚI, không đụng store cũ nào.
        if (!db.objectStoreNames.contains("search_history")) {
          db.createObjectStore("search_history", {
            keyPath: ["user_id", "term_lang", "native_lang", "term"],
          });
        }

        // Bộ từ nhập ngoài (v10) — hai store MỚI, không đụng store cũ nào. Dữ
        // liệu ở đây tái tạo được bằng cách nhập lại, nên không có gì phải bảo
        // toàn như `terms`.
        if (!db.objectStoreNames.contains("wordsets")) {
          const sets = db.createObjectStore("wordsets", { keyPath: "id" });
          sets.createIndex("by_pair", ["term_lang", "native_lang"]);
        }
        if (!db.objectStoreNames.contains("wordset_words")) {
          db.createObjectStore("wordset_words", { keyPath: ["setId", "term", "reading"] });
        }
      },
    });
  }
  return dbPromise;
}

/** For tests / reset. */
export function _resetDbPromise() {
  dbPromise = null;
}
