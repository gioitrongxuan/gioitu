// Backend PostgreSQL store (SPEC 2.A fallback dict, 2.C sync).
// Uses node-postgres (`pg`); all access is async (the pool is promise-based).
import pg from "pg";

const { Pool } = pg;

// Connection is configured via DATABASE_URL (preferred) or the standard
// PG* environment variables (PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE).
const connectionString = process.env.DATABASE_URL;

export const pool = new Pool(
  connectionString
    ? { connectionString, ssl: sslFromEnv() }
    : { ssl: sslFromEnv() },
);

function sslFromEnv() {
  // Opt-in TLS for managed Postgres (e.g. ?sslmode=require or PGSSL=1).
  const wantsSsl =
    process.env.PGSSL === "1" ||
    /sslmode=require/.test(process.env.DATABASE_URL ?? "");
  return wantsSsl ? { rejectUnauthorized: false } : undefined;
}

export async function initSchema(): Promise<void> {
  await pool.query(`
    -- Edit-distance matching for fuzzy look-up (levenshtein_less_equal).
    CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at BIGINT NOT NULL
    );

    -- Imported dictionaries (one row per .zip imported). Terms reference this
    -- via dict.dict_id so a whole dictionary can be listed or deleted.
    CREATE TABLE IF NOT EXISTS dictionaries (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      term_lang TEXT NOT NULL,
      native_lang TEXT NOT NULL,
      created_at BIGINT NOT NULL
    );

    -- Fallback dictionaries, scoped per language pair (forward only).
    CREATE TABLE IF NOT EXISTS dict (
      term TEXT NOT NULL,
      term_lang TEXT NOT NULL,
      native_lang TEXT NOT NULL,
      reading TEXT,
      definitions TEXT NOT NULL,   -- JSON array of glosses
      -- Source dictionary; NULL for seed/manually-added entries.
      dict_id TEXT REFERENCES dictionaries(id) ON DELETE SET NULL,
      PRIMARY KEY (term_lang, native_lang, term)
    );
    -- Older databases predate dict_id; add it if missing.
    ALTER TABLE dict ADD COLUMN IF NOT EXISTS dict_id TEXT
      REFERENCES dictionaries(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_dict_source ON dict(dict_id);

    -- User learning data: source of truth (SPEC 2.C).
    CREATE TABLE IF NOT EXISTS user_data (
      user_id TEXT NOT NULL,
      term TEXT NOT NULL,
      term_lang TEXT NOT NULL,
      payload TEXT NOT NULL,       -- full VocabEntry JSON
      updated_at BIGINT NOT NULL,
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
