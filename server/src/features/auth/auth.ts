// Authentication helpers (email + password → JWT), zero external deps.
// Password hashing: scrypt with a per-user random salt.
// Tokens: HS256 JWT signed with GIOITU_JWT_SECRET.
import crypto from "node:crypto";

const JWT_SECRET = process.env.GIOITU_JWT_SECRET ?? "dev-insecure-secret-change-me";
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

// --- Password hashing (scrypt) ---

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), 64);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
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

/** Basic email shape check. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
