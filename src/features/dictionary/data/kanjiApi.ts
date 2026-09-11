// Client tra kanji (server-only feature). Best-effort như serverDict: backend
// vắng (offline / deploy tĩnh) thì trả null/[] thay vì ném lỗi → UI ẩn phần kanji.

import type { KanjiEntry, KanjiLookupResult } from "@/shared/kanji";

const BASE = "/api";

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${path}`);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Các kanji cấu thành một từ (1 request) — không kèm từ ví dụ. */
export async function fetchKanjiBreakdown(chars: string, src: string, tgt: string): Promise<KanjiEntry[]> {
  if (!chars) return [];
  return (await getJson<KanjiEntry[]>(`/kanji?chars=${encodeURIComponent(chars)}&src=${src}&tgt=${tgt}`)) ?? [];
}

/** Chi tiết một kanji + từ ví dụ (lười tải khi mở rộng). */
export async function fetchKanji(literal: string, src: string, tgt: string): Promise<KanjiLookupResult | null> {
  return getJson<KanjiLookupResult>(`/kanji/${encodeURIComponent(literal)}?src=${src}&tgt=${tgt}`);
}
