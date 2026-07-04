// Client nhận dạng viết tay (server-only feature). Best-effort như kanjiApi:
// backend vắng (offline / deploy tĩnh) hoặc Google lỗi → trả [] thay vì ném lỗi,
// UI chỉ hiện "không có ứng viên".

/** Mỗi nét: ba mảng số song song [xs, ys, times] đã chuẩn hoá về [0, 1]. */
export type Stroke = [number[], number[], number[]];

export async function recognizeHandwriting(strokes: Stroke[]): Promise<string[]> {
  if (strokes.length === 0) return [];
  try {
    const res = await fetch("/api/handwriting", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ strokes }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: string[] };
    return data.results ?? [];
  } catch {
    return [];
  }
}
