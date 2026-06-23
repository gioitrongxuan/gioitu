// Session-token helpers: after Google verifies the user (see google.ts) we mint
// our own short-lived session JWT so the rest of the API authenticates the same
// way regardless of identity provider. Zero external deps.
// Tokens: HS256 JWT signed with GIOITU_JWT_SECRET.
import crypto from "node:crypto";

const JWT_SECRET = process.env.GIOITU_JWT_SECRET ?? "dev-insecure-secret-change-me";
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

/**
 * Quản trị từ điển dùng chung: chỉ các email trong danh sách này mới được
 * nhập/sửa/xoá. Cấu hình qua GIOITU_ADMIN_EMAILS (phân tách bằng dấu phẩy);
 * mặc định là chủ sở hữu dự án. So khớp không phân biệt hoa/thường.
 */
const ADMIN_EMAILS = new Set(
  (process.env.GIOITU_ADMIN_EMAILS ?? "gioi.trongxuan@gmail.com")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

export function isAdminEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && ADMIN_EMAILS.has(email.toLowerCase());
}

// --- Minimal HS256 JWT ---

const b64url = (buf: Buffer | string) =>
  (Buffer.isBuffer(buf) ? buf : Buffer.from(buf)).toString("base64url");

export interface TokenPayload {
  sub: string; // user id
  email: string;
  iat: number;
  exp: number;
}

export function signToken(user: { id: string; email: string }): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({ sub: user.id, email: user.email, iat: now, exp: now + TOKEN_TTL_SECONDS }),
  );
  const data = `${header}.${payload}`;
  const sig = b64url(crypto.createHmac("sha256", JWT_SECRET).update(data).digest());
  return `${data}.${sig}`;
}

export function verifyToken(token: string): TokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const expected = b64url(crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${payload}`).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const body = JSON.parse(Buffer.from(payload, "base64url").toString()) as TokenPayload;
    if (body.exp && body.exp < Math.floor(Date.now() / 1000)) return null;
    return body;
  } catch {
    return null;
  }
}

export function newUserId(): string {
  return crypto.randomUUID();
}

/** A stable, long-lived API key for Yomitan sync (prefixed for recognisability). */
export function newApiKey(): string {
  return `gk_${crypto.randomBytes(24).toString("base64url")}`;
}
