// Client cho đánh giá ứng dụng (#245). User gửi/sửa đánh giá của mình; admin
// xem tổng hợp + danh sách. Gọi kèm Bearer token (cả hai phía server đều đòi
// đăng nhập).

import { authToken } from "@/features/auth/data/auth";
import type { RatingSummary, Stars } from "../domain/rating";

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

export interface Rating {
  user_id: string;
  email: string | null;
  stars: number;
  note: string | null;
  created_at: number;
  updated_at: number;
}

/** User: gửi hoặc sửa đánh giá của mình. */
export async function sendRating(payload: { stars: Stars; note: string }): Promise<void> {
  await authed("/ratings", "POST", payload);
}

/** User: đánh giá hiện tại của mình (null nếu chưa đánh giá bao giờ). */
export async function myRating(): Promise<Rating | null> {
  const { rating } = await authed<{ rating: Rating | null }>("/ratings/mine", "GET");
  return rating;
}

/** Admin: tổng hợp toàn bảng + danh sách mới sửa gần nhất trước. */
export function listRatings(): Promise<{ summary: RatingSummary; items: Rating[] }> {
  return authed<{ summary: RatingSummary; items: Rating[] }>("/ratings", "GET");
}
