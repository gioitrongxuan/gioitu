// Optional backend (SPEC 2). The frontend works without it (IndexedDB-only);
// when present it provides a fallback dictionary, reverse FTS, and cloud sync.
import express from "express";
import cors from "cors";
import { db, initSchema, rowToDictEntry, DictRow } from "./db.js";
import { seedIfEmpty } from "./seed.js";

initSchema();
seedIfEmpty();

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

// --- Dictionary: forward lookup (SPEC 2.A) ---
app.get("/api/dict/lookup", (req, res) => {
  const term = String(req.query.term ?? "");
  const row = db.prepare("SELECT * FROM dict WHERE term = ?").get(term) as DictRow | undefined;
  res.json(row ? rowToDictEntry(row) : null);
});

// --- Dictionary: prefix suggestions ---
app.get("/api/dict/suggest", (req, res) => {
  const prefix = String(req.query.prefix ?? "");
  if (!prefix) return res.json([]);
  const rows = db
    .prepare("SELECT * FROM dict WHERE term >= ? AND term < ? ORDER BY term LIMIT 10")
    .all(prefix, prefix + "￿") as DictRow[];
  res.json(rows.map(rowToDictEntry));
});

// --- Dictionary: reverse lookup via FTS5 (SPEC 2.B) ---
app.get("/api/dict/reverse", (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) return res.json([]);
  // Build a tolerant OR query of the tokens.
  const tokens = q.split(/\s+/).filter(Boolean).map((t) => `"${t.replace(/"/g, "")}"`);
  const match = tokens.join(" OR ");
  try {
    const rows = db
      .prepare(
        `SELECT d.* FROM dict_fts f JOIN dict d ON d.rowid = f.rowid
         WHERE dict_fts MATCH ? ORDER BY rank LIMIT 20`,
      )
      .all(match) as DictRow[];
    res.json(rows.map(rowToDictEntry));
  } catch {
    res.json([]);
  }
});

// --- Sync: pull (SPEC 2.C) ---
app.get("/api/sync", (req, res) => {
  const user_id = String(req.query.user_id ?? "");
  const since = Number(req.query.since ?? 0);
  const rows = db
    .prepare("SELECT payload FROM user_data WHERE user_id = ? AND updated_at >= ?")
    .all(user_id, since) as { payload: string }[];
  res.json(rows.map((r) => JSON.parse(r.payload)));
});

// --- Sync: push with last-write-wins by updated_at (SPEC 2.C) ---
app.post("/api/sync", (req, res) => {
  const entries = (req.body?.entries ?? []) as Array<{
    user_id: string;
    term: string;
    term_lang: string;
    updated_at: number;
  }>;
  const upsert = db.prepare(`
    INSERT INTO user_data (user_id, term, term_lang, payload, updated_at)
    VALUES (@user_id, @term, @term_lang, @payload, @updated_at)
    ON CONFLICT(user_id, term, term_lang) DO UPDATE SET
      payload = excluded.payload,
      updated_at = excluded.updated_at
    WHERE excluded.updated_at >= user_data.updated_at
  `);
  const tx = db.transaction((items: typeof entries) => {
    for (const e of items) {
      upsert.run({
        user_id: e.user_id,
        term: e.term,
        term_lang: e.term_lang,
        payload: JSON.stringify(e),
        updated_at: e.updated_at,
      });
    }
  });
  tx(entries);

  const all = db
    .prepare("SELECT payload FROM user_data WHERE user_id = ?")
    .all(entries[0]?.user_id ?? "") as { payload: string }[];
  res.json(all.map((r) => JSON.parse(r.payload)));
});

const PORT = Number(process.env.PORT ?? 8787);
app.listen(PORT, () => console.log(`gioitu backend on http://localhost:${PORT}`));
