import { describe, it, expect } from "vitest";
import {
  effectiveStamp,
  mergeStampedEntries,
  StampedEntry,
} from "@server/features/sync/lww";

// StampedEntry gọn cho test — chỉ cần khoá + mốc + bộ đếm.
function stamped(
  updated_at: number,
  receivedAt: number,
  over: Record<string, unknown> = {},
): StampedEntry {
  return {
    entry: { term: "猫", term_lang: "ja", updated_at, ...over },
    receivedAt,
  };
}

describe("effectiveStamp — ghìm updated_at về lúc server nhận", () => {
  it("mốc client hợp lệ (≤ lúc nhận) giữ nguyên", () => {
    expect(effectiveStamp(stamped(100, 150))).toBe(100);
  });

  it("mốc chạy trước đồng hồ server bị ghìm về received_at", () => {
    expect(effectiveStamp(stamped(999_999, 150))).toBe(150);
  });
});

describe("mergeStampedEntries — LWW theo mốc hiệu lực", () => {
  it("không lệch giờ: bản updated_at mới hơn thắng như cũ", () => {
    const merged = mergeStampedEntries(
      stamped(100, 100, { status: "cũ" }),
      stamped(200, 200, { status: "mới" }),
    );
    expect(merged.entry.status).toBe("mới");
    expect(merged.receivedAt).toBe(200);
  });

  it("máy lệch giờ tương lai KHÔNG còn thắng oan: sửa đổi thật mới hơn thắng", () => {
    // Máy A (đồng hồ nhanh 1 năm) push lúc t=100 với updated_at ảo khổng lồ;
    // máy B sửa thật lúc t=200. Mốc hiệu lực của A bị ghìm về 100 → B thắng.
    const skewed = stamped(999_999_999, 100, { status: "ảo" });
    const genuine = stamped(200, 200, { status: "thật" });
    expect(mergeStampedEntries(skewed, genuine).entry.status).toBe("thật");
  });

  it("bản đến sau nhưng updated_at cũ hơn vẫn thua (received_at không kéo bản cũ lên)", () => {
    const merged = mergeStampedEntries(
      stamped(500, 500, { status: "đang có" }),
      stamped(100, 600, { status: "trễ" }),
    );
    expect(merged.entry.status).toBe("đang có");
    expect(merged.receivedAt).toBe(500);
  });

  it("hoà mốc hiệu lực → tie-breaker: bản server nhận sau thắng (hành vi >= cũ)", () => {
    const merged = mergeStampedEntries(
      stamped(100, 100, { status: "trước" }),
      stamped(100, 150, { status: "sau" }),
    );
    expect(merged.entry.status).toBe("sau");
  });

  it("bên thắng giữ receivedAt của chính nó — mốc ảo tiếp tục bị ghìm về sau", () => {
    const skewed = stamped(999_999_999, 100);
    const merged = mergeStampedEntries(stamped(50, 50), skewed);
    // skewed thắng (hiệu lực 100 > 50) nhưng receivedAt=100 được giữ, nên lần
    // so sánh sau mốc hiệu lực của nó vẫn là 100 chứ không phải mốc ảo.
    expect(merged.receivedAt).toBe(100);
    expect(effectiveStamp(merged)).toBe(100);
  });

  it("lookup_count/lapses lấy MAX bất kể bên nào thắng", () => {
    const merged = mergeStampedEntries(
      stamped(100, 100, { lookup_count: 7, lapses: 3 }),
      stamped(200, 200, { lookup_count: 2, lapses: 5 }),
    );
    expect(merged.entry.lookup_count).toBe(7);
    expect(merged.entry.lapses).toBe(5);
  });
});
