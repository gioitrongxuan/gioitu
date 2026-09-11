// Client tra kanji (server-only feature). Best-effort như serverDict: backend
// vắng (offline / deploy tĩnh) thì trả null/[] thay vì ném lỗi → UI ẩn phần kanji.

import type { KanjiEntry, KanjiLookupResult } from "@/shared/kanji";
import type { LookupErrorKind } from "../domain/lookupError";

const BASE = "/api";

/** Một lượt gọi: dữ liệu, kèm cờ lỗi cho nơi gọi nào cần phân biệt "hỏng" với "rỗng". */
async function getJsonResult<T>(path: string): Promise<{ data: T | null; error: LookupErrorKind | null }> {
  try {
    const res = await fetch(`${BASE}${path}`);
    // 404 ở đây không phải "không có chữ này" mà là "không có route /api/kanji"
    // (deploy tĩnh) — cùng loại với mất mạng nên cũng tính là lỗi nguồn.
    if (!res.ok) return { data: null, error: "network" };
    return { data: (await res.json()) as T, error: null };
  } catch {
    return { data: null, error: "network" };
  }
}

async function getJson<T>(path: string): Promise<T | null> {
  return (await getJsonResult<T>(path)).data;
}

/** Các kanji cấu thành một từ (1 request) — không kèm từ ví dụ. */
export async function fetchKanjiBreakdown(chars: string, src: string, tgt: string): Promise<KanjiEntry[]> {
  return (await fetchKanjiBreakdownResult(chars, src, tgt)).kanji;
}

/**
 * Như `fetchKanjiBreakdown` nhưng nói rõ nguồn có hỏng hay không. Dành cho luồng
 * chiết tự hộ overlay ngoài trang (`?kanji=`): overlay phải báo "không tra được"
 * thay vì "chữ này chưa có dữ liệu" khi mất mạng.
 */
export async function fetchKanjiBreakdownResult(
  chars: string,
  src: string,
  tgt: string,
): Promise<{ kanji: KanjiEntry[]; error: LookupErrorKind | null }> {
  if (!chars) return { kanji: [], error: null };
  const { data, error } = await getJsonResult<KanjiEntry[]>(
    `/kanji?chars=${encodeURIComponent(chars)}&src=${src}&tgt=${tgt}`,
  );
  return { kanji: data ?? [], error };
}

/** Chi tiết một kanji + từ ví dụ (lười tải khi mở rộng). */
export async function fetchKanji(literal: string, src: string, tgt: string): Promise<KanjiLookupResult | null> {
  return getJson<KanjiLookupResult>(`/kanji/${encodeURIComponent(literal)}?src=${src}&tgt=${tgt}`);
}
