import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import {
  BACKUP_FORMAT,
  buildBackup,
  serializeBackup,
  parseBackup,
  entriesForUser,
  shouldRemindGuestBackup,
  GUEST_BACKUP_REMINDER_THRESHOLD,
} from "@/features/review/domain/backup";
import { importBackup } from "@/features/review/data/backup";
import { getAllEntries, getEntry, putEntry } from "@/features/review/data/repository";
import { requestPersistentStorage, _resetPersistRequest } from "@/shared/persist";
import { makeEntry } from "./fixtures";

describe("backup serialize/parse (domain)", () => {
  it("round-trips a backup through serialize → parse", () => {
    const backup = buildBackup("u1", [makeEntry({ term: "犬" }), makeEntry({ term: "猫" })], 1234);
    const restored = parseBackup(serializeBackup(backup));
    expect(restored.format).toBe(BACKUP_FORMAT);
    expect(restored.exported_at).toBe(1234);
    expect(restored.entries.map((e) => e.term)).toEqual(["犬", "猫"]);
  });

  it("rejects non-JSON text", () => {
    expect(() => parseBackup("not json {")).toThrow();
  });

  it("rejects a JSON file that is not a Gioitu backup", () => {
    expect(() => parseBackup(JSON.stringify({ hello: "world" }))).toThrow();
  });

  it("rejects a backup whose entries are malformed", () => {
    const bad = JSON.stringify({ format: BACKUP_FORMAT, entries: [{ term: 123 }] });
    expect(() => parseBackup(bad)).toThrow();
  });
});

describe("entriesForUser (domain)", () => {
  it("re-owns every entry to the current user without mutating the source", () => {
    const backup = buildBackup("someone-else", [makeEntry({ user_id: "someone-else", term: "x" })], 0);
    const owned = entriesForUser(backup, "me");
    expect(owned.every((e) => e.user_id === "me")).toBe(true);
    expect(backup.entries[0].user_id).toBe("someone-else"); // không đụng bản gốc
  });
});

describe("shouldRemindGuestBackup (domain)", () => {
  it("only reminds a guest at or above the threshold, and only when not dismissed", () => {
    const N = GUEST_BACKUP_REMINDER_THRESHOLD;
    expect(shouldRemindGuestBackup({ isGuest: true, wordCount: N, dismissed: false })).toBe(true);
    expect(shouldRemindGuestBackup({ isGuest: true, wordCount: N - 1, dismissed: false })).toBe(false);
    expect(shouldRemindGuestBackup({ isGuest: true, wordCount: N, dismissed: true })).toBe(false);
    expect(shouldRemindGuestBackup({ isGuest: false, wordCount: N, dismissed: false })).toBe(false);
  });
});

describe("importBackup (data) — last-write-wins merge into the current user", () => {
  it("keeps the newer copy, adds new terms, and re-owns entries to the importer", async () => {
    // Người dùng "imp" đã có "old" (cũ) và "kept" (bản của họ mới hơn).
    await putEntry(makeEntry({ user_id: "imp", term: "old", lookup_count: 1, updated_at: 100 }));
    await putEntry(makeEntry({ user_id: "imp", term: "kept", lookup_count: 9, updated_at: 500 }));

    // Backup (xuất từ tài khoản khác) mang bản "old" mới hơn + một từ mới "fresh",
    // và một bản "kept" cũ hơn (phải bị bản hiện tại thắng).
    const backup = buildBackup("other", [
      makeEntry({ user_id: "other", term: "old", lookup_count: 7, updated_at: 300 }),
      makeEntry({ user_id: "other", term: "kept", lookup_count: 2, updated_at: 200 }),
      makeEntry({ user_id: "other", term: "fresh", updated_at: 400 }),
    ], 999);

    const imported = await importBackup("imp", backup);
    expect(imported).toBe(3);

    const all = await getAllEntries("imp");
    const byTerm = new Map(all.map((e) => [e.term, e]));
    expect(byTerm.get("old")?.lookup_count).toBe(7); // backup mới hơn thắng
    expect(byTerm.get("kept")?.lookup_count).toBe(9); // bản hiện tại mới hơn giữ nguyên
    expect(byTerm.get("fresh")).toBeDefined(); // từ mới được thêm

    // Mọi entry nhập vào phải thuộc người đang dùng, không còn "other".
    expect(all.every((e) => e.user_id === "imp")).toBe(true);
    expect(await getEntry("other", "fresh", "en")).toBeUndefined();
  });
});

describe("requestPersistentStorage (shared) — a safe no-op when unsupported", () => {
  it("resolves to a boolean without throwing when the Storage API is absent", async () => {
    _resetPersistRequest();
    await expect(requestPersistentStorage()).resolves.toEqual(expect.any(Boolean));
  });
});
