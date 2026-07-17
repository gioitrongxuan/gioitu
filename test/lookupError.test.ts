import { describe, it, expect } from "vitest";
import { describeLookupError, found, lookupFailed } from "@/features/dictionary/domain/lookupError";

describe("found / lookupFailed", () => {
  it("found: giữ nguyên kết quả, không cờ lỗi (kể cả rỗng)", () => {
    expect(found([1, 2, 3])).toEqual({ results: [1, 2, 3], error: null });
    expect(found<number>([])).toEqual({ results: [], error: null });
  });

  it("lookupFailed: results luôn rỗng + cờ lỗi", () => {
    expect(lookupFailed<number>("network")).toEqual({ results: [], error: "network" });
  });
});

describe("describeLookupError", () => {
  it("lỗi mạng: nêu nguyên nhân + gợi ý chuyển nguồn Trên máy", () => {
    const msg = describeLookupError("network");
    expect(msg.title.length).toBeGreaterThan(0);
    // Gợi ý phải nhắc nguồn "Trên máy" để người dùng biết đường tra offline.
    expect(msg.hint).toContain("Trên máy");
  });
});
