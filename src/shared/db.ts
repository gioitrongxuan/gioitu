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
import { VocabEntry } from "./types";
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
}

const DB_NAME = "gioitu";
const DB_VERSION = 7;

let dbPromise: Promise<IDBPDatabase<GioituDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<GioituDB>> {
  if (!dbPromise) {
    dbPromise = openDB<GioituDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, tx) {
        // Versioned, NON-destructive migrations. Store history:
        //   v3  structured content + tags + rules; adds `dictionaries` registry.
        //   v4  resolved tag metadata (from each dictionary's tag_bank).
        //   v5  `terms` keyPath gains `reading` so homographs stop overwriting.
        //   v6  adds `term_meta` (Yomitan term-meta banks: IPA/pitch/freq).
        //   v7  adds the `by_reading` index (a reading look-up finds entries
        //       keyed under their kanji term).
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
      },
    });
  }
  return dbPromise;
}

/** For tests / reset. */
export function _resetDbPromise() {
  dbPromise = null;
}
