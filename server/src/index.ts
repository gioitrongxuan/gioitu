// Optional backend (SPEC 2). The frontend works without it (IndexedDB-only);
// when present it provides a fallback dictionary and cloud sync.
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import { pool, initSchema, rowToDictEntry, DictRow } from "./db.js";
import { seedIfEmpty } from "./seed.js";
import { parseYomitanZip } from "./yomitan.js";
import {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  newUserId,
  isValidEmail,
} from "./auth.js";

await initSchema();
await seedIfEmpty();

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

// Wrap async route handlers so rejected promises become a 500 (not an
// unhandled rejection) — Express 4 does not await handlers itself.
type AsyncHandler = (req: Request, res: Response) => Promise<unknown>;
const wrap =
  (fn: AsyncHandler) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

// --- Auth (email + password → JWT) ---
interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
}

app.post(
  "/api/auth/register",
  wrap(async (req, res) => {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");
    if (!isValidEmail(email)) return res.status(400).json({ error: "Email không hợp lệ" });
    if (password.length < 6) return res.status(400).json({ error: "Mật khẩu tối thiểu 6 ký tự" });

    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rowCount) return res.status(409).json({ error: "Email đã được đăng ký" });

    const user = { id: newUserId(), email };
    await pool.query(
      "INSERT INTO users (id, email, password_hash, created_at) VALUES ($1, $2, $3, $4)",
      [user.id, email, hashPassword(password), Date.now()],
    );

    res.json({ token: signToken(user), user_id: user.id, email });
  }),
);

app.post(
  "/api/auth/login",
  wrap(async (req, res) => {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");
    const { rows } = await pool.query<UserRow>("SELECT * FROM users WHERE email = $1", [email]);
    const row = rows[0];
    if (!row || !verifyPassword(password, row.password_hash)) {
      return res.status(401).json({ error: "Sai email hoặc mật khẩu" });
    }
    res.json({ token: signToken(row), user_id: row.id, email: row.email });
  }),
);

// Auth middleware: derive the user id from the bearer token.
interface AuthedRequest extends Request {
  userId?: string;
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const payload = token ? verifyToken(token) : null;
  if (!payload) return res.status(401).json({ error: "Cần đăng nhập" });
  req.userId = payload.sub;
  next();
}

app.get(
  "/api/auth/me",
  requireAuth,
  wrap(async (req: AuthedRequest, res) => {
    const { rows } = await pool.query<{ id: string; email: string }>(
      "SELECT id, email FROM users WHERE id = $1",
      [req.userId],
    );
    const row = rows[0];
    if (!row) return res.status(404).json({ error: "Không tìm thấy người dùng" });
    res.json({ user_id: row.id, email: row.email });
  }),
);

// --- Dictionary: forward lookup, scoped to a language pair (SPEC 2.A) ---
app.get(
  "/api/dict/lookup",
  wrap(async (req, res) => {
    const term = String(req.query.term ?? "");
    const src = String(req.query.src ?? "");
    const tgt = String(req.query.tgt ?? "");
    const { rows } = await pool.query<DictRow>(
      "SELECT * FROM dict WHERE term_lang = $1 AND native_lang = $2 AND term = $3",
      [src, tgt, term],
    );
    res.json(rows[0] ? rowToDictEntry(rows[0]) : null);
  }),
);

// --- Dictionary: prefix suggestions within a language pair ---
app.get(
  "/api/dict/suggest",
  wrap(async (req, res) => {
    const prefix = String(req.query.prefix ?? "");
    const src = String(req.query.src ?? "");
    const tgt = String(req.query.tgt ?? "");
    if (!prefix) return res.json([]);
    const { rows } = await pool.query<DictRow>(
      `SELECT * FROM dict WHERE term_lang = $1 AND native_lang = $2
       AND term >= $3 AND term < $4 ORDER BY term LIMIT 10`,
      [src, tgt, prefix, prefix + "￿"],
    );
    res.json(rows.map(rowToDictEntry));
  }),
);

// --- Dictionary management (auth) — import / list / browse / edit ---
// These mutate the shared server dictionary, so they require a signed-in user.

interface ImportSummary {
  dict_id: string;
  title: string;
  termCount: number;
  term_lang: string;
  native_lang: string;
}

// Parse a Yomitan archive buffer and bulk-insert it as a new dictionary.
async function importBuffer(
  buf: Buffer,
  opts: { term_lang?: string; native_lang?: string },
): Promise<ImportSummary> {
  const parsed = await parseYomitanZip(buf, opts);
  if (parsed.entries.length === 0) {
    throw new Error("Không tìm thấy từ nào trong file");
  }

  const dictId = randomUUID();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "INSERT INTO dictionaries (id, title, term_lang, native_lang, created_at) VALUES ($1, $2, $3, $4, $5)",
      [dictId, parsed.title, parsed.term_lang, parsed.native_lang, Date.now()],
    );
    // Bulk insert in chunks (one multi-row statement each) for speed.
    const CHUNK = 1000;
    for (let i = 0; i < parsed.entries.length; i += CHUNK) {
      const slice = parsed.entries.slice(i, i + CHUNK);
      const values: unknown[] = [];
      const tuples = slice.map((e, j) => {
        const b = j * 6;
        values.push(
          e.term,
          parsed.term_lang,
          parsed.native_lang,
          e.reading ?? null,
          JSON.stringify(e.definitions),
          dictId,
        );
        return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6})`;
      });
      await client.query(
        `INSERT INTO dict (term, term_lang, native_lang, reading, definitions, dict_id)
         VALUES ${tuples.join(", ")}
         ON CONFLICT (term_lang, native_lang, term) DO UPDATE SET
           reading = EXCLUDED.reading,
           definitions = EXCLUDED.definitions,
           dict_id = EXCLUDED.dict_id`,
        values,
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return {
    dict_id: dictId,
    title: parsed.title,
    termCount: parsed.entries.length,
    term_lang: parsed.term_lang,
    native_lang: parsed.native_lang,
  };
}

// Import a Yomitan .zip. The body is the raw archive (Content-Type
// application/zip); the language pair is taken from ?src=&tgt= when given,
// otherwise from the archive's index.json.
app.post(
  "/api/dict/import",
  requireAuth,
  express.raw({ type: ["application/zip", "application/octet-stream"], limit: "256mb" }),
  wrap(async (req, res) => {
    const buf = req.body as Buffer;
    if (!Buffer.isBuffer(buf) || buf.length === 0) {
      return res.status(400).json({ error: "Thiếu dữ liệu file .zip" });
    }
    const src = req.query.src ? String(req.query.src) : undefined;
    const tgt = req.query.tgt ? String(req.query.tgt) : undefined;

    try {
      res.json(await importBuffer(buf, { term_lang: src, native_lang: tgt }));
    } catch (err) {
      res.status(400).json({ error: (err as Error).message || "File .zip không hợp lệ (không phải Yomitan)" });
    }
  }),
);

// Import a Yomitan .zip from a URL (the server downloads it). Body: { url }.
app.post(
  "/api/dict/import-url",
  requireAuth,
  wrap(async (req, res) => {
    const url = String(req.body?.url ?? "").trim();
    const src = req.body?.src ? String(req.body.src) : undefined;
    const tgt = req.body?.tgt ? String(req.body.tgt) : undefined;
    if (!/^https?:\/\//.test(url)) {
      return res.status(400).json({ error: "URL không hợp lệ" });
    }
    let buf: Buffer;
    try {
      const resp = await fetch(url, { redirect: "follow" });
      if (!resp.ok) return res.status(400).json({ error: `Tải URL thất bại (HTTP ${resp.status})` });
      buf = Buffer.from(await resp.arrayBuffer());
    } catch {
      return res.status(400).json({ error: "Không tải được URL từ máy chủ" });
    }
    try {
      res.json(await importBuffer(buf, { term_lang: src, native_lang: tgt }));
    } catch (err) {
      res.status(400).json({ error: (err as Error).message || "File .zip không hợp lệ" });
    }
  }),
);

// List imported dictionaries with their current term counts.
app.get(
  "/api/dict/dictionaries",
  requireAuth,
  wrap(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT d.id, d.title, d.term_lang, d.native_lang, d.created_at,
              COUNT(t.term)::int AS term_count
         FROM dictionaries d
         LEFT JOIN dict t ON t.dict_id = d.id
        GROUP BY d.id
        ORDER BY d.created_at DESC`,
    );
    res.json(rows);
  }),
);

// Delete a dictionary and all of its terms.
app.delete(
  "/api/dict/dictionaries/:id",
  requireAuth,
  wrap(async (req, res) => {
    const id = req.params.id;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM dict WHERE dict_id = $1", [id]);
      const del = await client.query("DELETE FROM dictionaries WHERE id = $1", [id]);
      await client.query("COMMIT");
      if (!del.rowCount) return res.status(404).json({ error: "Không tìm thấy từ điển" });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    res.json({ ok: true });
  }),
);

// Browse / search terms within a language pair (paginated).
app.get(
  "/api/dict/terms",
  requireAuth,
  wrap(async (req, res) => {
    const src = String(req.query.src ?? "");
    const tgt = String(req.query.tgt ?? "");
    const q = String(req.query.q ?? "").trim();
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    // Escape LIKE wildcards in the user query; match as a prefix.
    const like = q.replace(/[\\%_]/g, (c) => "\\" + c) + "%";
    const hasQ = q.length > 0;

    const where = `term_lang = $1 AND native_lang = $2${hasQ ? " AND term ILIKE $3" : ""}`;
    const params = hasQ ? [src, tgt, like] : [src, tgt];

    const total = await pool.query<{ c: string }>(
      `SELECT COUNT(*) AS c FROM dict WHERE ${where}`,
      params,
    );
    const { rows } = await pool.query<DictRow & { dict_id: string | null }>(
      `SELECT term, reading, definitions, term_lang, native_lang, dict_id
         FROM dict WHERE ${where}
        ORDER BY term LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
    res.json({
      total: Number(total.rows[0].c),
      items: rows.map((r) => ({ ...rowToDictEntry(r), dict_id: r.dict_id })),
    });
  }),
);

// Add or edit a term's meanings (upsert). A manually added term has no dict_id;
// editing an imported term keeps its dict_id.
app.put(
  "/api/dict/term",
  requireAuth,
  wrap(async (req, res) => {
    const term = String(req.body?.term ?? "").trim();
    const term_lang = String(req.body?.term_lang ?? "");
    const native_lang = String(req.body?.native_lang ?? "");
    const reading = req.body?.reading ? String(req.body.reading) : null;
    const definitions = Array.isArray(req.body?.definitions)
      ? (req.body.definitions as unknown[]).map((d) => String(d).trim()).filter(Boolean)
      : [];
    if (!term || !term_lang || !native_lang) {
      return res.status(400).json({ error: "Thiếu từ hoặc cặp ngôn ngữ" });
    }
    if (definitions.length === 0) {
      return res.status(400).json({ error: "Cần ít nhất một nghĩa" });
    }
    await pool.query(
      `INSERT INTO dict (term, term_lang, native_lang, reading, definitions, dict_id)
       VALUES ($1, $2, $3, $4, $5, NULL)
       ON CONFLICT (term_lang, native_lang, term) DO UPDATE SET
         reading = EXCLUDED.reading,
         definitions = EXCLUDED.definitions`,
      [term, term_lang, native_lang, reading, JSON.stringify(definitions)],
    );
    res.json({ term, reading: reading ?? undefined, definitions, term_lang, native_lang });
  }),
);

// Delete a single term.
app.delete(
  "/api/dict/term",
  requireAuth,
  wrap(async (req, res) => {
    const term = String(req.body?.term ?? "");
    const term_lang = String(req.body?.term_lang ?? "");
    const native_lang = String(req.body?.native_lang ?? "");
    const del = await pool.query(
      "DELETE FROM dict WHERE term_lang = $1 AND native_lang = $2 AND term = $3",
      [term_lang, native_lang, term],
    );
    if (!del.rowCount) return res.status(404).json({ error: "Không tìm thấy từ" });
    res.json({ ok: true });
  }),
);

// --- Sync: pull (SPEC 2.C) — user scoped by the authenticated token ---
app.get(
  "/api/sync",
  requireAuth,
  wrap(async (req: AuthedRequest, res) => {
    const user_id = req.userId!;
    const since = Number(req.query.since ?? 0);
    const { rows } = await pool.query<{ payload: string }>(
      "SELECT payload FROM user_data WHERE user_id = $1 AND updated_at >= $2",
      [user_id, since],
    );
    res.json(rows.map((r) => JSON.parse(r.payload)));
  }),
);

// --- Sync: push with last-write-wins by updated_at (SPEC 2.C) ---
app.post(
  "/api/sync",
  requireAuth,
  wrap(async (req: AuthedRequest, res) => {
    const user_id = req.userId!;
    const entries = (req.body?.entries ?? []) as Array<{
      term: string;
      term_lang: string;
      updated_at: number;
      [k: string]: unknown;
    }>;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const e of entries) {
        // Force ownership to the authenticated user (ignore any client user_id).
        const owned = { ...e, user_id };
        await client.query(
          `INSERT INTO user_data (user_id, term, term_lang, payload, updated_at)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (user_id, term, term_lang) DO UPDATE SET
             payload = EXCLUDED.payload,
             updated_at = EXCLUDED.updated_at
           WHERE EXCLUDED.updated_at >= user_data.updated_at`,
          [user_id, e.term, e.term_lang, JSON.stringify(owned), e.updated_at],
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    const { rows } = await pool.query<{ payload: string }>(
      "SELECT payload FROM user_data WHERE user_id = $1",
      [user_id],
    );
    res.json(rows.map((r) => JSON.parse(r.payload)));
  }),
);

// --- Serve the built frontend (production / Docker) ---
// When a `dist/` bundle exists (or GIOITU_STATIC_DIR points at one), the same
// process serves the SPA so the app is reachable on a single origin and the
// `/api` calls need no proxy. In dev you instead run Vite, which proxies /api.
const staticDir = resolve(process.env.GIOITU_STATIC_DIR ?? join(process.cwd(), "dist"));
if (existsSync(join(staticDir, "index.html"))) {
  app.use(express.static(staticDir));
  // SPA fallback for any non-/api GET (client-side routing / refresh).
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(join(staticDir, "index.html")));
  console.log(`Serving frontend from ${staticDir}`);
}

const PORT = Number(process.env.PORT ?? 8787);
app.listen(PORT, () => console.log(`gioitu backend on http://localhost:${PORT}`));
