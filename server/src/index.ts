// Optional backend (SPEC 2). The frontend works without it (IndexedDB-only);
// when present it provides a fallback dictionary, reverse FTS, and cloud sync.
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import { db, initSchema, rowToDictEntry, DictRow } from "./db.js";
import { seedIfEmpty } from "./seed.js";
import {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  newUserId,
  isValidEmail,
} from "./auth.js";

initSchema();
seedIfEmpty();

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

// --- Auth (email + password → JWT) ---
interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: number;
}

app.post("/api/auth/register", (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  if (!isValidEmail(email)) return res.status(400).json({ error: "Email không hợp lệ" });
  if (password.length < 6) return res.status(400).json({ error: "Mật khẩu tối thiểu 6 ký tự" });

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) return res.status(409).json({ error: "Email đã được đăng ký" });

  const user = { id: newUserId(), email };
  db.prepare(
    "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
  ).run(user.id, email, hashPassword(password), Date.now());

  res.json({ token: signToken(user), user_id: user.id, email });
});

app.post("/api/auth/login", (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email) as UserRow | undefined;
  if (!row || !verifyPassword(password, row.password_hash)) {
    return res.status(401).json({ error: "Sai email hoặc mật khẩu" });
  }
  res.json({ token: signToken(row), user_id: row.id, email: row.email });
});

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

app.get("/api/auth/me", requireAuth, (req: AuthedRequest, res) => {
  const row = db.prepare("SELECT id, email FROM users WHERE id = ?").get(req.userId) as
    | { id: string; email: string }
    | undefined;
  if (!row) return res.status(404).json({ error: "Không tìm thấy người dùng" });
  res.json({ user_id: row.id, email: row.email });
});

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

// --- Sync: pull (SPEC 2.C) — user scoped by the authenticated token ---
app.get("/api/sync", requireAuth, (req: AuthedRequest, res) => {
  const user_id = req.userId!;
  const since = Number(req.query.since ?? 0);
  const rows = db
    .prepare("SELECT payload FROM user_data WHERE user_id = ? AND updated_at >= ?")
    .all(user_id, since) as { payload: string }[];
  res.json(rows.map((r) => JSON.parse(r.payload)));
});

// --- Sync: push with last-write-wins by updated_at (SPEC 2.C) ---
app.post("/api/sync", requireAuth, (req: AuthedRequest, res) => {
  const user_id = req.userId!;
  const entries = (req.body?.entries ?? []) as Array<{
    term: string;
    term_lang: string;
    updated_at: number;
    [k: string]: unknown;
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
      // Force ownership to the authenticated user (ignore any client user_id).
      const owned = { ...e, user_id };
      upsert.run({
        user_id,
        term: e.term,
        term_lang: e.term_lang,
        payload: JSON.stringify(owned),
        updated_at: e.updated_at,
      });
    }
  });
  tx(entries);

  const all = db
    .prepare("SELECT payload FROM user_data WHERE user_id = ?")
    .all(user_id) as { payload: string }[];
  res.json(all.map((r) => JSON.parse(r.payload)));
});

const PORT = Number(process.env.PORT ?? 8787);
app.listen(PORT, () => console.log(`gioitu backend on http://localhost:${PORT}`));
