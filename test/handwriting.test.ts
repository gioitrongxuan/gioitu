import { describe, it, expect } from "vitest";
import {
  areStrokesValid,
  buildHandwritingPayload,
  parseHandwritingResponse,
  recognizeHandwriting,
  Stroke,
} from "@server/features/dictionary/handwriting";

const oneStroke: Stroke = [[0, 0.5, 1], [0, 0.5, 1], [0, 10, 20]];

describe("areStrokesValid", () => {
  it("chấp nhận mảng nét đúng định dạng", () => {
    expect(areStrokesValid([oneStroke])).toBe(true);
    expect(areStrokesValid([])).toBe(true);
  });

  it("từ chối payload rác", () => {
    expect(areStrokesValid(null)).toBe(false);
    expect(areStrokesValid([[["x"]]])).toBe(false);
    expect(areStrokesValid([[[0], [0], ["t"]]])).toBe(false);
  });
});

describe("buildHandwritingPayload", () => {
  it("đặt các nét vào requests[0].ink với ngôn ngữ ja", () => {
    const payload = buildHandwritingPayload([oneStroke]);
    expect(payload.requests[0].ink).toEqual([oneStroke]);
    expect(payload.requests[0].language).toBe("ja");
  });
});

describe("parseHandwritingResponse", () => {
  it("rút tối đa 5 ứng viên từ phản hồi SUCCESS", () => {
    const json = ["SUCCESS", [["", ["日", "曰", "臼", "旧", "白", "百"]]]];
    expect(parseHandwritingResponse(json)).toEqual(["日", "曰", "臼", "旧", "白"]);
  });

  it("không phải SUCCESS / sai định dạng → []", () => {
    expect(parseHandwritingResponse(["FAIL", []])).toEqual([]);
    expect(parseHandwritingResponse(null)).toEqual([]);
    expect(parseHandwritingResponse(["SUCCESS", [["", "x"]]])).toEqual([]);
  });
});

describe("recognizeHandwriting", () => {
  it("không nét → [] mà không gọi mạng", async () => {
    let called = false;
    const fetchFn = (async () => {
      called = true;
      return new Response();
    }) as unknown as typeof fetch;
    expect(await recognizeHandwriting([], fetchFn)).toEqual([]);
    expect(called).toBe(false);
  });

  it("gọi Google rồi trả ứng viên đã parse", async () => {
    const fetchFn = (async () =>
      new Response(JSON.stringify(["SUCCESS", [["", ["山", "止"]]]]), { status: 200 })) as unknown as typeof fetch;
    expect(await recognizeHandwriting([oneStroke], fetchFn)).toEqual(["山", "止"]);
  });

  it("HTTP lỗi → []", async () => {
    const fetchFn = (async () => new Response("", { status: 500 })) as unknown as typeof fetch;
    expect(await recognizeHandwriting([oneStroke], fetchFn)).toEqual([]);
  });
});
