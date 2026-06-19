// Backend SQLite store (SPEC 2.A fallback dict, 2.B reverse FTS5, 2.C sync).
import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.GIOITU_DB ?? join(__dirname, "..", "gioitu.db");

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

export function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    -- Fallback dictionaries, scoped per language pair (forward only).
    CREATE TABLE IF NOT EXISTS dict (
      term TEXT NOT NULL,
      term_lang TEXT NOT NULL,
      native_lang TEXT NOT NULL,
      reading TEXT,
      definitions TEXT NOT NULL,   -- JSON array of glosses
      PRIMARY KEY (term_lang, native_lang, term)
    );

    -- User learning data: source of truth (SPEC 2.C).
    CREATE TABLE IF NOT EXISTS user_data (
      user_id TEXT NOT NULL,
      term TEXT NOT NULL,
      term_lang TEXT NOT NULL,
      payload TEXT NOT NULL,       -- full VocabEntry JSON
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, term, term_lang)
    );
    CREATE INDEX IF NOT EXISTS idx_user_updated ON user_data(user_id, updated_at);
  `);
}

export interface DictRow {
  term: string;
  reading: string | null;
  definitions: string;
  term_lang: string;
  native_lang: string;
}

export function rowToDictEntry(r: DictRow) {
  return {
    term: r.term,
    reading: r.reading ?? undefined,
    definitions: JSON.parse(r.definitions) as string[],
    term_lang: r.term_lang,
    native_lang: r.native_lang,
  };
}
