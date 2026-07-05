// Client cho Premium (#70): đổi mã (user) và sinh/liệt kê mã (admin). Gọi kèm
// Bearer token; đổi mã thành công thì cập nhật cache phiên thành Premium để UI
// (và cổng đồng bộ phía client) phản ánh ngay.

import { authToken, markSessionPremium } from "@/features/auth/data/auth";

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

export interface PremiumCode {
  code: string;
  created_at: number;
  redeemed_by: string | null;
  redeemed_at: number | null;
}

/** Đổi mã kích hoạt; thành công thì đánh dấu phiên là Premium. */
export async function redeemPremiumCode(code: string): Promise<void> {
  await authed<{ is_premium: boolean }>("/premium/redeem", "POST", { code });
  markSessionPremium();
}

/** Admin: sinh `count` mã mới, trả về các mã vừa tạo. */
export async function generatePremiumCodes(count = 5): Promise<string[]> {
  const { codes } = await authed<{ codes: string[] }>("/premium/codes", "POST", { count });
  return codes;
}

/** Admin: liệt kê mã đã sinh (mới nhất trước). */
export function listPremiumCodes(): Promise<PremiumCode[]> {
  return authed<PremiumCode[]>("/premium/codes", "GET");
}
