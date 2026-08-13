// Client cho góp ý về web (#244). User gửi góp ý; admin xem danh sách + đánh dấu
// đã xử lý. Gọi kèm Bearer token (cả hai phía server đều đòi đăng nhập).

import { authToken } from "@/features/auth/data/auth";
import type { FeedbackKind } from "../domain/feedback";

async function authed<T>(path: string, method: "GET" | "POST", body?: unknown): Promise<T> {
  const token = authToken();
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body != null ? { "Content-Type": "application/json" } : {}),
    },
    ...(body != null ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Yêu cầu thất bại");
  return data as T;
}

export interface FeedbackPayload {
  kind: FeedbackKind;
  message: string;
}

export interface Feedback {
  id: string;
  user_id: string;
  email: string | null;
  kind: string;
  message: string;
  status: string;
  created_at: number;
}

/** User: gửi một góp ý về app. */
export async function sendFeedback(payload: FeedbackPayload): Promise<void> {
  await authed("/feedback", "POST", payload);
}

/** Admin: danh sách góp ý, mới nhất trước. Mặc định chỉ phần đang chờ. */
export function listFeedback(includeHandled = false): Promise<Feedback[]> {
  return authed<Feedback[]>(`/feedback${includeHandled ? "?status=all" : ""}`, "GET");
}

/** Admin: đánh dấu một góp ý đã xử lý. */
export async function markFeedbackHandled(id: string): Promise<void> {
  await authed(`/feedback/${id}/handled`, "POST", {});
}
