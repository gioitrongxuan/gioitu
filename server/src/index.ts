// Optional backend (SPEC 2). The frontend works without it (IndexedDB-only);
// when present it provides a fallback dictionary and cloud sync.
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import { pool, initSchema, rowToDictEntry, DictRow } from "./db.js";
import { seedIfEmpty } from "./seed.js";
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

const PORT = Number(process.env.PORT ?? 8787);
app.listen(PORT, () => console.log(`gioitu backend on http://localhost:${PORT}`));
