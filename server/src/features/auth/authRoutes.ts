// Auth routes (mounted at /api/auth): email + password → JWT.
import { Router } from "express";
import { pool } from "../../core/db.js";
import { wrap, requireAuth, AuthedRequest } from "../../core/middleware.js";
import {
  hashPassword,
  verifyPassword,
  signToken,
  newUserId,
  isValidEmail,
} from "./auth.js";

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
}

export const authRoutes = Router();

authRoutes.post(
  "/register",
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

authRoutes.post(
  "/login",
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

authRoutes.get(
  "/me",
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
