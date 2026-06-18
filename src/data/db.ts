// IndexedDB schema and access (SPEC 2.A / 2.B / 2.C).
// Three concerns live here:
//   - `terms`          : imported Yomitan dictionary (term → definition)   [forward]
//   - `reverse_tokens` : native-language token → list of target terms       [reverse]
//   - `user_data`      : cached learning data (source of truth is Cloud DB)
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

export interface ReverseToken {
  /** A token extracted from the native-language meaning, lowercased. */
  token: string;
  /** Target terms whose meaning contains this token. */
  terms: string[];
}

interface GioituDB extends DBSchema {
  terms: {
    key: string; // term
    value: DictEntry;
    indexes: { by_lang: string };
  };
  reverse_tokens: {
    key: string; // token
    value: ReverseToken;
  };
  user_data: {
    key: [string, string, string]; // [user_id, term, term_lang]
    value: VocabEntry;
    indexes: { by_next_review: number; by_status: string };
  };
}

const DB_NAME = "gioitu";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<GioituDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<GioituDB>> {
  if (!dbPromise) {
    dbPromise = openDB<GioituDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const terms = db.createObjectStore("terms", { keyPath: "term" });
        terms.createIndex("by_lang", "term_lang");

        db.createObjectStore("reverse_tokens", { keyPath: "token" });

        const user = db.createObjectStore("user_data", {
          keyPath: ["user_id", "term", "term_lang"],
        });
        user.createIndex("by_next_review", "next_review");
        user.createIndex("by_status", "status");
      },
    });
  }
  return dbPromise;
}

/** For tests / reset. */
export function _resetDbPromise() {
  dbPromise = null;
}
