import "fake-indexeddb/auto";
import { describe, it, expect, vi } from "vitest";
import {
  mergeDictsByUpdatedAt,
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
import { getDb, LocalDictionary } from "@/shared/db";
import { createLocalDictionary, upsertCustomEntries } from "@/features/dictionary/data/customDict";
import { listLocalDictionaries } from "@/features/dictionary/data/yomitan";
import { buildDictEntry, emptyDraft, type CustomDraft } from "@/features/dictionary/domain/customEntry";
import { pairById } from "@/shared/languages";

const JA_VI = pairById("ja-vi");

function draft(over: Partial<CustomDraft>): CustomDraft {
  return { ...emptyDraft(), ...over };
}
function reg(over: Partial<LocalDictionary>): LocalDictionary {
  return { id: "d", title: "t", term_lang: "ja", native_lang: "vi", termCount: 0, importedAt: 0, custom: true, ...over };
}
function blob(over: Partial<LocalDictionary>, terms: SyncedDict["terms"] = []): SyncedDict {
  return { registry: reg(over), terms };
}

describe("mergeDictsByUpdatedAt (thuần)", () => {
  it("LWW: updatedAt mới hơn thắng", () => {
    const merged = mergeDictsByUpdatedAt(
      [blob({ id: "x", updatedAt: 10, title: "cũ" })],
      [blob({ id: "x", updatedAt: 20, title: "mới" })],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].registry.title).toBe("mới");
  });

  it("tombstone mới hơn thắng bản live", () => {
    const merged = mergeDictsByUpdatedAt(
      [blob({ id: "x", updatedAt: 10 }, [{} as never])],
      [blob({ id: "x", updatedAt: 20, deletedAt: 20 })],
    );
    expect(merged[0].registry.deletedAt).toBe(20);
  });

  it("thiếu updatedAt → dùng importedAt", () => {
    const merged = mergeDictsByUpdatedAt(
      [blob({ id: "x", importedAt: 3, updatedAt: undefined, title: "thấp" })],
      [blob({ id: "x", importedAt: 5, updatedAt: undefined, title: "cao" })],
    );
    expect(merged[0].registry.title).toBe("cao");
  });

  it("id khác nhau → giữ cả hai", () => {
    const merged = mergeDictsByUpdatedAt([blob({ id: "a" })], [blob({ id: "b" })]);
    expect(merged.map((d) => d.registry.id).sort()).toEqual(["a", "b"]);
  });
});

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
});
