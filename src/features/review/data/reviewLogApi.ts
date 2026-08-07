// Client đồng bộ nhật ký ôn (/api/sync/log). Ba kết cục ok / offline /
// unauthorized như syncApi.ts của user_data — không nuốt lỗi thành no-op im lặng.
// Server scope theo bearer token nên không bao giờ gửi user_id.

import { authToken } from "@/features/auth/data/auth";
import { SyncStatus, classifyResponse } from "../domain/syncStatus";
import { SyncedLogRow } from "../domain/reviewLog";

const BASE = "/api";

function authHeaders(): Record<string, string> {
  const token = authToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Kết quả một trang pull: trạng thái liên lạc + dòng nhận được + con trỏ tiếp theo. */
export interface LogPullResult {
  status: SyncStatus;
  rows: SyncedLogRow[];
  /** Con trỏ `seq` để lần pull sau lấy tiếp; giữ nguyên `since` khi chưa ok. */
  cursor: number;
  /** Còn dòng phía sau (trang đầy) — kéo tiếp ngay trong cùng lượt đồng bộ. */
  more: boolean;
}

/**
 * Kéo các dòng nhật ký ghi trên cloud sau con trỏ `since`. Không có token =
 * khách: không có cloud để tra nên coi như offline (KHÔNG trả "unauthorized" —
 * không được mời khách đăng nhập lại từ luồng đồng bộ, như pullUserData).
 */
export async function pullReviewLog(since: number): Promise<LogPullResult> {
  const headers = authHeaders();
  const nothing = { rows: [], cursor: since, more: false };
  if (!headers.Authorization) return { status: "offline", ...nothing };
  try {
    const res = await fetch(`${BASE}/sync/log?since=${since}`, { headers });
    const status = classifyResponse(res);
    if (status !== "ok") return { status, ...nothing };
    const page = (await res.json()) as Omit<LogPullResult, "status">;
    return { status, ...page };
  } catch {
    return { status: "offline", ...nothing };
  }
}

/**
 * Đẩy các dòng nhật ký lên cloud. Append-only: server bỏ qua dòng đã có, nên
 * `inserted` (số dòng THẬT SỰ mới) nhỏ hơn số dòng gửi đi là chuyện bình thường.
 */
export async function pushReviewLog(
  rows: SyncedLogRow[],
): Promise<{ status: SyncStatus; inserted: number }> {
  const headers = authHeaders();
  if (!headers.Authorization) return { status: "offline", inserted: 0 };
  try {
    const res = await fetch(`${BASE}/sync/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ rows }),
    });
    const status = classifyResponse(res);
    if (status !== "ok") return { status, inserted: 0 };
    const { inserted } = (await res.json()) as { inserted: number };
    return { status, inserted };
  } catch {
    return { status: "offline", inserted: 0 };
  }
}
