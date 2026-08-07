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
import { getReviewLog } from "@/features/review/data/reviewLog";
import { requestPersistentStorage, _resetPersistRequest } from "@/shared/persist";
import { ReviewLogEntry } from "@/shared/types";
import { makeEntry } from "./fixtures";

/** Một dòng review_log hợp lệ tối thiểu cho test backup kèm lịch sử. */
function makeLogRow(over: Partial<ReviewLogEntry> = {}): ReviewLogEntry {
  return {
    user_id: "u1",
    term: "犬",
    term_lang: "ja",
    grade: "good",
    ts: 1000,
    interval_before: 1440,
    interval_after: 3600,
    ...over,
  };
}

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

  it("v2: round-trips review_log; file v1 không có trường này thì bỏ qua êm", () => {
    const withLog = buildBackup("u1", [makeEntry()], 1234, [makeLogRow(), makeLogRow({ ts: 2000 })]);
    const restored = parseBackup(serializeBackup(withLog));
    expect(restored.review_log).toHaveLength(2);

    // File v1 (không có review_log) — nhập được như trước, trường vắng mặt.
    const v1 = parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 1, entries: [makeEntry()] }));
    expect(v1.review_log).toBeUndefined();
    // Không truyền log lúc build cũng không được bịa ra trường rỗng.
    expect("review_log" in buildBackup("u1", [], 0)).toBe(false);
  });

  it("v2: review_log có mặt nhưng méo dạng → file hỏng, chặn như entries", () => {
    const bad = JSON.stringify({ format: BACKUP_FORMAT, entries: [], review_log: [{ ts: "hôm qua" }] });
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
    expect(imported.entryCount).toBe(3);
    expect(imported.logCount).toBe(0); // file không có review_log

    const all = await getAllEntries("imp");
    const byTerm = new Map(all.map((e) => [e.term, e]));
    expect(byTerm.get("old")?.lookup_count).toBe(7); // backup mới hơn thắng
    expect(byTerm.get("kept")?.lookup_count).toBe(9); // bản hiện tại mới hơn giữ nguyên
    expect(byTerm.get("fresh")).toBeDefined(); // từ mới được thêm

    // Mọi entry nhập vào phải thuộc người đang dùng, không còn "other".
    expect(all.every((e) => e.user_id === "imp")).toBe(true);
    expect(await getEntry("other", "fresh", "en")).toBeUndefined();
  });

  it("v2: nhập review_log bổ sung, nhập lại cùng file không nhân đôi lịch sử", async () => {
    const backup = buildBackup("other", [makeEntry({ user_id: "other", term: "犬" })], 999, [
      makeLogRow({ id: 5, user_id: "other", ts: 1000 }),
      makeLogRow({ id: 6, user_id: "other", ts: 2000, grade: "again" }),
    ]);

    const first = await importBackup("hist", backup);
    expect(first.logCount).toBe(2);
    const rows = await getReviewLog("hist");
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.user_id === "hist")).toBe(true);
    // id nguồn bị bỏ, IndexedDB đích cấp khoá mới.
    expect(rows.map((r) => r.id)).not.toEqual([5, 6]);

    // Append-only: lần nhập thứ hai không được ghi thêm dòng nào.
    const again = await importBackup("hist", backup);
    expect(again.logCount).toBe(0);
    expect(await getReviewLog("hist")).toHaveLength(2);
  });
});

describe("requestPersistentStorage (shared) — a safe no-op when unsupported", () => {
  it("resolves to a boolean without throwing when the Storage API is absent", async () => {
    _resetPersistRequest();
    await expect(requestPersistentStorage()).resolves.toEqual(expect.any(Boolean));
  });
});
