import { describe, it, expect } from "vitest";
import { recognizeHandwriting, Stroke } from "@/features/dictionary/data/handwritingApi";

const stroke: Stroke = [[0, 1], [0, 1], [0, 10]];

// Vẽ xong mà mất mạng phải phân biệt được với "không có ứng viên", nếu không pad
// sẽ trống trơn không lời giải thích (BACKLOG GĐ0).
describe("recognizeHandwriting", () => {
  it("không nét → rỗng, không lỗi, KHÔNG gọi mạng", async () => {
    let called = false;
    const fetchFn = (async () => {
      called = true;
      return new Response();
    }) as unknown as typeof fetch;
    expect(await recognizeHandwriting([], fetchFn)).toEqual({ candidates: [], error: false });
    expect(called).toBe(false);
  });

  it("200 → ứng viên đã parse, không lỗi", async () => {
    const fetchFn = (async () =>
      new Response(JSON.stringify({ results: ["山", "止"] }), { status: 200 })) as unknown as typeof fetch;
    expect(await recognizeHandwriting([stroke], fetchFn)).toEqual({ candidates: ["山", "止"], error: false });
  });

  it("HTTP lỗi → rỗng + cờ lỗi", async () => {
    const fetchFn = (async () => new Response("", { status: 500 })) as unknown as typeof fetch;
    expect(await recognizeHandwriting([stroke], fetchFn)).toEqual({ candidates: [], error: true });
  });

  it("fetch reject (mất mạng) → rỗng + cờ lỗi", async () => {
    const fetchFn = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    expect(await recognizeHandwriting([stroke], fetchFn)).toEqual({ candidates: [], error: true });
  });
});
