// Client đồng bộ từ điển cá nhân (#70 — 6.2). Best-effort như syncApi của user_data:
// mọi lệnh chịu được backend vắng / chưa đăng nhập / chưa Premium (403) → trả null
// để bản local đứng vững. Server scope theo user qua bearer token nên không gửi user_id.

import { authToken } from "@/features/auth/data/auth";
import type { SyncedDict } from "../domain/dictMerge";

// Shape blob đồng bộ (registry + terms) định nghĩa ở domain/dictMerge — nơi có
// logic merge thuần; re-export để caller của lớp mạng không phải biết điều đó.
export type { SyncedDict } from "../domain/dictMerge";

const BASE = "/api";

function authHeaders(): Record<string, string> {
  const token = authToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Kéo các từ điển cá nhân thay đổi từ `since`. null khi offline / chưa quyền. */
export async function pullCustomDicts(since = 0): Promise<SyncedDict[] | null> {
  const headers = authHeaders();
  if (!headers.Authorization) return null;
  try {
    const res = await fetch(`${BASE}/dict-sync?since=${since}`, { headers });
    if (!res.ok) return null;
    return (await res.json()) as SyncedDict[];
  } catch {
    return null;
  }
}

/** Đẩy các từ điển cá nhân (LWW phía server). null khi offline / chưa quyền / vượt quota. */
export async function pushCustomDicts(dicts: SyncedDict[]): Promise<SyncedDict[] | null> {
  const headers = authHeaders();
  if (!headers.Authorization) return null;
  try {
    const res = await fetch(`${BASE}/dict-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ dicts }),
    });
    if (!res.ok) return null;
    return (await res.json()) as SyncedDict[];
  } catch {
    return null;
  }
}
