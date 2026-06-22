// Client-side auth: signs in with Google, persists the session JWT + user in
// localStorage, and exposes the current session.

export interface Session {
  token: string;
  user_id: string;
  email: string;
}

const KEY = "gioitu_session";

/**
 * Local-only user id used when nobody is signed in. Guest learning data lives
 * in IndexedDB under this id and never syncs to the cloud (no auth token). When
 * a guest later signs in, the data is migrated to their account (see App.tsx).
 */
export const GUEST_USER_ID = "__guest__";

/** localStorage may be absent (Node/SSR/tests) — degrade gracefully. */
function storage(): Storage | null {
  return typeof localStorage !== "undefined" ? localStorage : null;
}

export function getSession(): Session | null {
  const raw = storage()?.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

function setSession(s: Session) {
  storage()?.setItem(KEY, JSON.stringify(s));
}

export function clearSession() {
  storage()?.removeItem(KEY);
}

export function authToken(): string | null {
  return getSession()?.token ?? null;
}

async function post(path: string, body: unknown): Promise<Session> {
  const res = await fetch(`/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Yêu cầu thất bại");
  }
  const session = data as Session;
  setSession(session);
  return session;
}

/** Exchange a Google ID token (from Google Identity Services) for a session. */
export function loginWithGoogle(credential: string): Promise<Session> {
  return post("/auth/google", { credential });
}

/** The server's public Google client id (null when sign-in is unconfigured). */
export async function getGoogleClientId(): Promise<string | null> {
  const res = await fetch("/api/auth/config");
  if (!res.ok) return null;
  const data = (await res.json().catch(() => ({}))) as { google_client_id?: string | null };
  return data.google_client_id ?? null;
}

/** Authenticated request that returns parsed JSON, or throws the server's error. */
async function authed<T>(path: string, method: "GET" | "POST"): Promise<T> {
  const token = authToken();
  const res = await fetch(`/api${path}`, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Yêu cầu thất bại");
  return data as T;
}

/** The user's stable Yomitan API key (generated server-side on first request). */
export function getYomitanKey(): Promise<{ api_key: string }> {
  return authed("/auth/yomitan-key", "GET");
}

/** Rotate the Yomitan API key (old one stops working immediately). */
export function regenerateYomitanKey(): Promise<{ api_key: string }> {
  return authed("/auth/yomitan-key/regenerate", "POST");
}
