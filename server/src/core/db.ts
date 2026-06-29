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

// Schema giờ do migration runner quản lý (core/migrate.ts + core/migrations/*).
// Nội dung initSchema() cũ đã chuyển nguyên vào migration 0001. Việc ráp dòng DB
// thành DictionaryEntry nằm ở features/dictionary/{assemble,dictStore}.ts.
