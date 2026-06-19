// IndexedDB schema and access (SPEC 2.A / 2.C).
// Two concerns live here:
//   - `terms`     : imported Yomitan dictionaries, scoped per language pair
//                   (forward only: term → meaning)
//   - `user_data` : cached learning data (source of truth is Cloud DB)
//
// IndexedDB is the PRIMARY dictionary source (fastest). The backend is a
// fallback. For user data, IndexedDB is only a cache.

import { openDB, DBSchema, IDBPDatabase } from "idb";
import { VocabEntry } from "../domain/types";

export interface DictEntry {
  term: string;
  reading?: string;
  /** Plain-text/markdown definition glosses. */
  definitions: string[];
  term_lang: string;
  native_lang: string;
}

interface GioituDB extends DBSchema {
  terms: {
    // Composite key scopes each entry to its dictionary (language pair).
    key: [string, string, string]; // [term_lang, native_lang, term]
    value: DictEntry;
    indexes: { by_pair: [string, string] };
  };
  user_data: {
    key: [string, string, string]; // [user_id, term, term_lang]
    value: VocabEntry;
    indexes: { by_next_review: number; by_status: string };
  };
}

const DB_NAME = "gioitu";
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<GioituDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<GioituDB>> {
  if (!dbPromise) {
    dbPromise = openDB<GioituDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // v2 reworks dictionary storage to be per-language-pair and removes the
        // reverse-token store. Recreate `terms` cleanly; user re-imports dicts.
        if (db.objectStoreNames.contains("terms")) db.deleteObjectStore("terms");
        // Drop the legacy reverse-token store from v1 if present.
        const legacy = "reverse_tokens" as never;
        if (db.objectStoreNames.contains(legacy)) db.deleteObjectStore(legacy);
        const terms = db.createObjectStore("terms", {
          keyPath: ["term_lang", "native_lang", "term"],
        });
        terms.createIndex("by_pair", ["term_lang", "native_lang"]);

        if (!db.objectStoreNames.contains("user_data")) {
          const user = db.createObjectStore("user_data", {
            keyPath: ["user_id", "term", "term_lang"],
          });
          user.createIndex("by_next_review", "next_review");
          user.createIndex("by_status", "status");
        }
        void oldVersion;
      },
    });
  }
  return dbPromise;
}

/** For tests / reset. */
export function _resetDbPromise() {
  dbPromise = null;
}
