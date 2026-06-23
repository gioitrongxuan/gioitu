// Cross-cutting Express middleware: async-handler wrapping and bearer-token auth.
import { NextFunction, Request, Response } from "express";
import { isAdminEmail, verifyToken } from "../features/auth/auth.js";

// Wrap async route handlers so rejected promises become a 500 (not an
// unhandled rejection) — Express 4 does not await handlers itself.
type AsyncHandler = (req: Request, res: Response) => Promise<unknown>;
export const wrap =
  (fn: AsyncHandler) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

/** A request whose user id has been resolved from the bearer token. */
export interface AuthedRequest extends Request {
  userId?: string;
}

/** Derive the user id from the Authorization bearer token, or 401. */
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const payload = token ? verifyToken(token) : null;
  if (!payload) return res.status(401).json({ error: "Cần đăng nhập" });
  req.userId = payload.sub;
  next();
}

/** Như requireAuth, nhưng còn yêu cầu người dùng là quản trị viên từ điển. */
export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const payload = token ? verifyToken(token) : null;
  if (!payload) return res.status(401).json({ error: "Cần đăng nhập" });
  if (!isAdminEmail(payload.email)) {
    return res.status(403).json({ error: "Không có quyền quản lý từ điển" });
  }
  req.userId = payload.sub;
  next();
}
