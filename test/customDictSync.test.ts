import "fake-indexeddb/auto";
import { describe, it, expect, vi } from "vitest";
import {
  localSyncableDicts,
  writeMergedDicts,
  syncCustomDicts,
} from "@/features/dictionary/data/customDictSync";
import { SyncedDict, pullCustomDicts } from "@/features/dictionary/data/dictSyncApi";

// Mock lớp mạng: các test khác không đụng pull/push, chỉ nhóm syncCustomDicts dùng.
vi.mock("@/features/dictionary/data/dictSyncApi", () => ({
  pullCustomDicts: vi.fn(),
  pushCustomDicts: vi.fn(async () => []),
}));
const mockPull = pullCustomDicts as unknown as ReturnType<typeof vi.fn>;
import { getDb } from "@/shared/db";
import { createLocalDictionary, upsertCustomEntries } from "@/features/dictionary/data/customDict";
import { listLocalDictionaries } from "@/features/dictionary/data/yomitan";
import { buildDictEntry, emptyDraft, type CustomDraft } from "@/features/dictionary/domain/customEntry";
import { pairById } from "@/shared/languages";

const JA_VI = pairById("ja-vi");

function draft(over: Partial<CustomDraft>): CustomDraft {
  return { ...emptyDraft(), ...over };
}
// Logic merge thuần (term-level, #166) test riêng ở test/dictMerge.test.ts.

describe("localSyncableDicts + writeMergedDicts (IndexedDB)", () => {
  it("đọc blob, dựng lại cache khi remote thắng, tombstone xoá term + ẩn khỏi danh sách", async () => {
    const id = await createLocalDictionary({ title: "Sync RT", term_lang: "ja", native_lang: "vi" });
    await upsertCustomEntries(id, "Sync RT", JA_VI, [draft({ term: "水", reading: "みず", gloss: "nước" })]);

    const mine = (await localSyncableDicts()).find((d) => d.registry.id === id)!;
    expect(mine.registry.custom).toBe(true);
    expect(mine.terms).toHaveLength(1);

    // Remote thêm một từ với updatedAt mới hơn → dựng lại cache thành 2 từ.
    const newer = (mine.registry.updatedAt ?? 0) + 1000;
    await writeMergedDicts([
      {
        registry: { ...mine.registry, updatedAt: newer, termCount: 2 },
        terms: [...mine.terms, buildDictEntry(draft({ term: "火", reading: "ひ", gloss: "lửa" }), JA_VI, "Sync RT")],
      },
    ]);
    const db = await getDb();
    expect(await db.getAllFromIndex("terms", "by_dict", id)).toHaveLength(2);

    // Tombstone: xoá hết term, và listLocalDictionaries không còn hiện.
    await writeMergedDicts([{ registry: { ...mine.registry, updatedAt: newer + 1000, deletedAt: newer + 1000 }, terms: [] }]);
    expect(await db.getAllFromIndex("terms", "by_dict", id)).toHaveLength(0);
    expect((await listLocalDictionaries("ja", "vi")).find((d) => d.id === id)).toBeUndefined();
  });
});

describe("localSyncableDicts — cỡ từ điển nhập", () => {
  it("bản nhập nhỏ được đồng bộ, bản nhập lớn thì không", async () => {
    const db = await getDb();
    // custom vắng = từ điển nhập; chỉ termCount quyết định (không cần nạp term).
    await db.put("dictionaries", { id: "imp-small", title: "Nhỏ", term_lang: "ja", native_lang: "vi", termCount: 50, importedAt: 1 });
    await db.put("dictionaries", { id: "imp-big", title: "Lớn", term_lang: "ja", native_lang: "vi", termCount: 999999, importedAt: 1 });
    const ids = (await localSyncableDicts()).map((d) => d.registry.id);
    expect(ids).toContain("imp-small");
    expect(ids).not.toContain("imp-big");
  });
});

describe("syncCustomDicts (kết quả để phản hồi)", () => {
  it("offline (pull null) → ok:false, không ném lỗi", async () => {
    mockPull.mockResolvedValueOnce(null);
    expect(await syncCustomDicts()).toEqual({ ok: false, count: 0, pushed: false });
  });

  it("pull được → ok:true, pushed:true, đếm dict không tính tombstone", async () => {
    const id = await createLocalDictionary({ title: "Đếm", term_lang: "ja", native_lang: "vi" });
    await upsertCustomEntries(id, "Đếm", JA_VI, [draft({ term: "山", reading: "やま", gloss: "núi" })]);
    mockPull.mockResolvedValueOnce([]);
    const r = await syncCustomDicts();
    expect(r.ok).toBe(true);
    expect(r.pushed).toBe(true);
    expect(r.count).toBeGreaterThanOrEqual(1);
  });

  it("hai máy sửa cùng một cuốn: merge term-level giữ từ của cả hai (#166)", async () => {
    const id = await createLocalDictionary({ title: "Ghép", term_lang: "ja", native_lang: "vi" });
    await upsertCustomEntries(id, "Ghép", JA_VI, [draft({ term: "水", reading: "みず", gloss: "nước" })]);

    // "Máy kia" đã push bản có 火 nhưng CHƯA thấy 水, registry mới hơn —
    // blob-LWW cũ sẽ nuốt mất 水 vừa thêm ở máy này.
    const mine = (await localSyncableDicts()).find((d) => d.registry.id === id)!;
    const newer = (mine.registry.updatedAt ?? 0) + 1000;
    const other: SyncedDict = {
      registry: { ...mine.registry, updatedAt: newer, termCount: 1 },
      terms: [
        { ...buildDictEntry(draft({ term: "火", reading: "ひ", gloss: "lửa" }), JA_VI, "Ghép"), dictId: id, updatedAt: newer },
      ],
    };
    mockPull.mockResolvedValueOnce([other]);
    await syncCustomDicts();

    const db = await getDb();
    const terms = await db.getAllFromIndex("terms", "by_dict", id);
    expect(terms.map((t) => t.term).sort()).toEqual(["水", "火"]);
  });
});
