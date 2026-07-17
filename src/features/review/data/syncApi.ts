// Cloud-sync client (SPEC 2.C). Không còn nuốt mọi lỗi thành null: mỗi lệnh phân
// biệt ba kết cục — ok / offline (mất mạng, máy chủ lỗi) / unauthorized (token
// hết hạn, 401) — để caller báo trung thực và mời đăng nhập lại khi cần. Server
// scope dữ liệu theo người dùng qua bearer token, nên không bao giờ gửi user_id.

import { VocabEntry } from "@/shared/types";
import { authToken } from "@/features/auth/data/auth";
import { SyncStatus, classifyResponse } from "../domain/syncStatus";

const BASE = "/api";

function authHeaders(): Record<string, string> {
  const token = authToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Kết quả pull: trạng thái liên lạc + entry nhận được (rỗng khi chưa ok). */
export interface PullResult {
  status: SyncStatus;
  entries: VocabEntry[];
}

/**
 * Pull user entries changed since a timestamp. Không có token = khách (chưa đăng
 * nhập): không có cloud để tra nên coi như offline — bản local tự đứng. KHÔNG
 * trả "unauthorized" ở đây: không được mời khách đăng nhập lại từ luồng đồng bộ.
 */
export async function pullUserData(since = 0): Promise<PullResult> {
  const headers = authHeaders();
  if (!headers.Authorization) return { status: "offline", entries: [] };
  try {
    const res = await fetch(`${BASE}/sync?since=${since}`, { headers });
    const status = classifyResponse(res);
    if (status !== "ok") return { status, entries: [] };
    return { status, entries: (await res.json()) as VocabEntry[] };
  } catch {
    // fetch ném = không tới được máy chủ (mất mạng, CORS, DNS…).
    return { status: "offline", entries: [] };
  }
}

/**
 * Push local user entries to the cloud (last-write-wins resolved server-side).
 * Chỉ trả trạng thái: server tự merge, repo không dùng dữ liệu trả về.
 */
export async function pushUserData(entries: VocabEntry[]): Promise<{ status: SyncStatus }> {
  const headers = authHeaders();
  if (!headers.Authorization) return { status: "offline" };
  try {
    const res = await fetch(`${BASE}/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ entries }),
    });
    return { status: classifyResponse(res) };
  } catch {
    return { status: "offline" };
  }
}
