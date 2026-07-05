// Tạo link chia sẻ tạm (#70 — 5.2): tải blob .zip lên server (base64 JSON) và
// nhận về một URL sống trong ít phút. Cần đăng nhập (server gác requireAuth).

import { authToken } from "@/features/auth/data/auth";

export interface ShareLink {
  url: string;
  expiresAt: number;
}

/** Mã hoá Blob nhị phân sang base64 theo từng khối (tránh tràn call-stack). */
async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export async function createShareLink(blob: Blob, filename: string): Promise<ShareLink> {
  const token = authToken();
  const data = await blobToBase64(blob);
  const res = await fetch("/api/share", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ filename, data }),
  });
  const json = (await res.json().catch(() => ({}))) as { id?: string; expires_at?: number; error?: string };
  if (!res.ok || !json.id) throw new Error(json.error ?? "Không tạo được link chia sẻ");
  return { url: `${window.location.origin}/api/dl/${json.id}`, expiresAt: json.expires_at ?? Date.now() };
}
