// Nhận dạng chữ viết tay: chuyển các nét vẽ thành ứng viên kanji/kana bằng cách
// gọi Google Input Tools (port ref/jisho-open/backend/src/server/handwriting.ts).
// Google không cho gọi thẳng từ trình duyệt (CORS) nên phần này chạy ở server.
// Logic dựng payload / đọc kết quả tách riêng (thuần) để test; `fetch` được
// inject để không chạm mạng khi test.

/** Mỗi nét là ba mảng số song song: [toạ_độ_x, toạ_độ_y, mốc_thời_gian]. */
export type Stroke = [number[], number[], number[]];

const GOOGLE_URL = "https://inputtools.google.com/request?itc=ja-t-i0-handwrit&app=jsapi";
const MAX_STROKES = 100;
const MAX_RESULTS = 5;

/** Nét hợp lệ: đúng ba mảng số song song. Chặn payload rác trước khi gọi Google. */
export function areStrokesValid(strokes: unknown): strokes is Stroke[] {
  return (
    Array.isArray(strokes) &&
    strokes.every(
      (stroke) =>
        Array.isArray(stroke) &&
        stroke.every((axis) => Array.isArray(axis) && axis.every((n) => typeof n === "number")),
    )
  );
}

export function buildHandwritingPayload(strokes: Stroke[]) {
  return {
    itc: "ja-t-i0-handwrit",
    app_version: 0.4,
    api_level: "537.36",
    device: "5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    input_type: "0",
    options: "enable_pre_space",
    requests: [
      {
        writing_guide: { writing_area_width: 1, writing_area_height: 1 },
        pre_context: "",
        max_num_results: MAX_RESULTS,
        max_completions: 0,
        language: "ja",
        ink: strokes,
      },
    ],
  };
}

/** Hình dạng Google trả: ["SUCCESS", [[code, [candidates...]]]]. */
type GoogleResponse = [status: string, results: [[code: string, candidates: string[]]]];

/** Rút danh sách ứng viên từ phản hồi Google; sai định dạng / lỗi → []. */
export function parseHandwritingResponse(json: unknown): string[] {
  const res = json as GoogleResponse;
  if (!Array.isArray(res) || res[0] !== "SUCCESS") return [];
  const candidates = res[1]?.[0]?.[1];
  return Array.isArray(candidates) ? candidates.slice(0, MAX_RESULTS) : [];
}

type FetchFn = typeof fetch;

/**
 * Gọi Google Input Tools và trả về tối đa 5 ứng viên. Không có nét / quá nhiều
 * nét → []. `fetchFn` inject được để test.
 */
export async function recognizeHandwriting(strokes: Stroke[], fetchFn: FetchFn = fetch): Promise<string[]> {
  if (strokes.length === 0 || strokes.length > MAX_STROKES) return [];
  const res = await fetchFn(GOOGLE_URL, {
    method: "POST",
    headers: { "content-type": "application/json; charset=UTF-8" },
    body: JSON.stringify(buildHandwritingPayload(strokes)),
  });
  if (!res.ok) return [];
  return parseHandwritingResponse(await res.json());
}
