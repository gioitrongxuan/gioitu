// Client nhận dạng viết tay (server-only feature). Cần máy chủ (offline / deploy
// tĩnh / Google lỗi thì không nhận dạng được). TRƯỚC ĐÂY nuốt mọi lỗi thành [] nên
// vẽ xong mà mất mạng thì ô ứng viên trống trơn, không lời giải thích. Giờ trả
// kèm cờ `error` để pad phân biệt "không có ứng viên" với "lỗi mạng" và báo đúng.

/** Mỗi nét: ba mảng số song song [xs, ys, times] đã chuẩn hoá về [0, 1]. */
export type Stroke = [number[], number[], number[]];

/** Kết quả nhận dạng: danh sách ký tự ứng viên + cờ lỗi mạng/máy chủ. */
export interface HandwritingResult {
  candidates: string[];
  /** true khi không gọi được máy chủ (mất mạng / 5xx / phản hồi hỏng). */
  error: boolean;
}

// fetchFn tiêm được để test (mẫu server/handwriting.ts); mặc định fetch toàn cục.
export async function recognizeHandwriting(
  strokes: Stroke[],
  fetchFn: typeof fetch = fetch,
): Promise<HandwritingResult> {
  if (strokes.length === 0) return { candidates: [], error: false };
  try {
    const res = await fetchFn("/api/handwriting", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ strokes }),
    });
    if (!res.ok) return { candidates: [], error: true };
    const data = (await res.json()) as { results?: string[] };
    return { candidates: data.results ?? [], error: false };
  } catch {
    return { candidates: [], error: true };
  }
}
