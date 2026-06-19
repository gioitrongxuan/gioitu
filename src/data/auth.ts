// Client-side auth: talks to the backend, persists the JWT + user in
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

export function register(email: string, password: string): Promise<Session> {
  return post("/auth/register", { email, password });
}

export function login(email: string, password: string): Promise<Session> {
  return post("/auth/login", { email, password });
}
