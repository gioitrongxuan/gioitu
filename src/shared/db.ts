// IndexedDB schema and access (SPEC 2.A / 2.C).
// Three concerns live here:
//   - `terms`        : imported dictionaries, scoped per language pair
//                      (forward only: term → meaning). Now Yomitan-rich:
//                      structured-content glossary, tags, word-type rules.
//   - `dictionaries` : a registry of imported dictionaries (title, counts,
//                      languages) so they can be listed / removed locally,
//                      the way Yomitan manages installed dictionaries.
//   - `user_data`    : cached learning data (source of truth is Cloud DB).
//
// IndexedDB is the PRIMARY dictionary source (fastest). The backend is a
// fallback. For user data, IndexedDB is only a cache.

import { openDB, DBSchema, IDBPDatabase } from "idb";
import { VocabEntry } from "./types";
import { GlossaryNode, Sense } from "./structured-content";

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
  /** Yomitan ranking score (higher = more relevant). */
  score?: number;
  /** Source dictionary title (for display). */
  dictionary?: string;
  /** Source dictionary id (for bulk deletion). */
  dictId?: string;
}

/** A registry entry for one imported dictionary (client side). */
export interface LocalDictionary {
  id: string;
  title: string;
  term_lang: string;
  native_lang: string;
  termCount: number;
  importedAt: number;
  revision?: string;
}

interface GioituDB extends DBSchema {
  terms: {
    // Composite key scopes each entry to its dictionary (language pair).
    key: [string, string, string]; // [term_lang, native_lang, term]
    value: DictEntry;
    indexes: { by_pair: [string, string]; by_dict: string };
  };
  dictionaries: {
    key: string; // id
    value: LocalDictionary;
    indexes: { by_pair: [string, string] };
  };
  user_data: {
    key: [string, string, string]; // [user_id, term, term_lang]
    value: VocabEntry;
    indexes: { by_next_review: number; by_status: string };
  };
}

const DB_NAME = "gioitu";
const DB_VERSION = 3;

let dbPromise: Promise<IDBPDatabase<GioituDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<GioituDB>> {
  if (!dbPromise) {
    dbPromise = openDB<GioituDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // v3 enriches dictionary storage (structured content, tags, rules) and
        // adds a `dictionaries` registry. Recreate `terms` cleanly; the user
        // re-imports dictionaries (they are a cache, not the source of truth).
        if (db.objectStoreNames.contains("terms")) db.deleteObjectStore("terms");
        const legacy = "reverse_tokens" as never;
        if (db.objectStoreNames.contains(legacy)) db.deleteObjectStore(legacy);

        const terms = db.createObjectStore("terms", {
          keyPath: ["term_lang", "native_lang", "term"],
        });
        terms.createIndex("by_pair", ["term_lang", "native_lang"]);
        terms.createIndex("by_dict", "dictId");

        if (!db.objectStoreNames.contains("dictionaries")) {
          const dicts = db.createObjectStore("dictionaries", { keyPath: "id" });
          dicts.createIndex("by_pair", ["term_lang", "native_lang"]);
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
