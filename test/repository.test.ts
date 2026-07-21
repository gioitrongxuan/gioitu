import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import {
  mergeByUpdatedAt,
  mergeEntryPair,
  reassignEntries,
  getEntry,
  putEntry,
} from "@/features/review/data/repository";
import { makeEntry } from "./fixtures";

describe("last-write-wins merge (constraint 9)", () => {
  it("keeps the entry with the newer updated_at", () => {
    const older = makeEntry({ term: "w", lookup_count: 1, updated_at: 100 });
    const newer = makeEntry({ term: "w", lookup_count: 5, updated_at: 200 });
    const merged = mergeByUpdatedAt([older], [newer]);
    expect(merged).toHaveLength(1);
    expect(merged[0].lookup_count).toBe(5);
  });

  it("unions entries keyed by (user_id, term, term_lang)", () => {
    const a = makeEntry({ term: "a", updated_at: 10 });
    const b = makeEntry({ term: "b", updated_at: 10 });
    const bJa = makeEntry({ term: "b", term_lang: "ja", updated_at: 10 });
    const merged = mergeByUpdatedAt([a, b], [bJa]);
    expect(merged).toHaveLength(3);
  });
});

describe("mergeEntryPair — hợp nhất field-level (#154)", () => {
  it("lấy MAX lookup_count/lapses kể cả khi bên thua LWW giữ số lớn hơn", () => {
    // Bản mới hơn (thắng LWW) lại có bộ đếm THẤP hơn — không được nuốt mất số
    // lớn của bản cũ.
    const a = makeEntry({ lookup_count: 9, lapses: 4, updated_at: 100 });
    const b = makeEntry({ lookup_count: 2, lapses: 1, updated_at: 200 });
    const merged = mergeEntryPair(a, b);
    expect(merged.lookup_count).toBe(9);
    expect(merged.lapses).toBe(4);
  });

  it("phần thẻ SM-2 theo bản mới hơn (LWW)", () => {
    const a = makeEntry({
      updated_at: 100,
      ease_factor: 2.5,
      srs_interval: 10,
      reps: 1,
      status: "LEARNING",
    });
    const b = makeEntry({
      updated_at: 200,
      ease_factor: 2.1,
      srs_interval: 1440,
      reps: 3,
      status: "LEARNED",
    });
    const merged = mergeEntryPair(a, b);
    expect(merged.ease_factor).toBe(2.1);
    expect(merged.srs_interval).toBe(1440);
    expect(merged.reps).toBe(3);
    expect(merged.status).toBe("LEARNED");
  });

  it("đối xứng cho bộ đếm bất kể thứ tự tham số", () => {
    const a = makeEntry({ lookup_count: 3, lapses: 5, updated_at: 100 });
    const b = makeEntry({ lookup_count: 7, lapses: 2, updated_at: 200 });
    expect(mergeEntryPair(a, b).lookup_count).toBe(7);
    expect(mergeEntryPair(b, a).lookup_count).toBe(7);
    expect(mergeEntryPair(a, b).lapses).toBe(5);
    expect(mergeEntryPair(b, a).lapses).toBe(5);
  });

  it("qua mergeByUpdatedAt: hai thiết bị cùng học một từ không mất lượt", () => {
    // Thiết bị A: tra nhiều lần (lookup 8), ghi sớm. Thiết bị B: học tiếp, lapse
    // thêm (lapses 3), ghi muộn hơn nên thắng phần thẻ.
    const deviceA = makeEntry({ term: "同", lookup_count: 8, lapses: 1, updated_at: 100 });
    const deviceB = makeEntry({ term: "同", lookup_count: 2, lapses: 3, updated_at: 200 });
    const merged = mergeByUpdatedAt([deviceA], [deviceB]);
    expect(merged).toHaveLength(1);
    expect(merged[0].lookup_count).toBe(8); // max, không mất lượt tra của A
    expect(merged[0].lapses).toBe(3); // max, không mất lượt quên của B
  });
});

describe("reassignEntries — adopt dữ liệu guest cũng merge field-level", () => {
  it("giữ max lookup_count/lapses khi trộn vào entry sẵn có của tài khoản", async () => {
    const guest = "guest-1";
    const acct = "acct-1";
    // Guest: tra nhiều (lookup 6), ghi muộn hơn → thắng phần thẻ.
    await putEntry(
      makeEntry({ user_id: guest, term: "会", lookup_count: 6, lapses: 1, updated_at: 200 }),
    );
    // Tài khoản đã có từ này với lapses cao hơn, ghi sớm hơn.
    await putEntry(
      makeEntry({ user_id: acct, term: "会", lookup_count: 1, lapses: 4, updated_at: 100 }),
    );

    const moved = await reassignEntries(guest, acct);
    expect(moved).toBe(1);

    const result = await getEntry(acct, "会", "en");
    expect(result?.lookup_count).toBe(6); // max
    expect(result?.lapses).toBe(4); // max — không mất lượt quên của tài khoản
    // Dòng của guest đã được dọn.
    expect(await getEntry(guest, "会", "en")).toBeUndefined();
  });
});
