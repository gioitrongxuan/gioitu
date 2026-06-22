// Auth routes (mounted at /api/auth): Google sign-in → session JWT.
import { Router } from "express";
import { pool } from "../../core/db.js";
import { wrap, requireAuth, AuthedRequest } from "../../core/middleware.js";
import { signToken } from "./auth.js";
import { googleClientId, verifyGoogleIdToken } from "./google.js";
import * as userStore from "./userStore.js";

export const authRoutes = Router();

// Public config the front-end needs before it can render the Google button.
// Exposing the client id here (it is not secret) keeps a single source of truth
// on the server, so no rebuild is needed to point the app at a Google project.
authRoutes.get("/config", (_req, res) => {
  res.json({ google_client_id: googleClientId() });
});

// Exchange a Google ID token (from Google Identity Services) for a session JWT.
authRoutes.post(
  "/google",
  wrap(async (req, res) => {
    const credential = String(req.body?.credential ?? "");
    if (!credential) return res.status(400).json({ error: "Thiếu thông tin đăng nhập Google" });

    let identity;
    try {
      identity = await verifyGoogleIdToken(credential);
    } catch (err) {
      return res.status(401).json({ error: (err as Error).message || "Xác minh Google thất bại" });
    }

    const user = await userStore.upsertGoogleUser(identity);
    res.json({ token: signToken(user), user_id: user.id, email: user.email });
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

// Yomitan sync key: stable, long-lived key the user pastes into Yomitan so the
// /api/yomitan-sync endpoint can attribute saved notes to their account.
authRoutes.get(
  "/yomitan-key",
  requireAuth,
  wrap(async (req: AuthedRequest, res) => {
    res.json({ api_key: await userStore.ensureApiKey(req.userId!) });
  }),
);

authRoutes.post(
  "/yomitan-key/regenerate",
  requireAuth,
  wrap(async (req: AuthedRequest, res) => {
    res.json({ api_key: await userStore.regenerateApiKey(req.userId!) });
  }),
);
