import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import {
  buildReviewLogEntry,
  logRowsForUser,
  maxTs,
  minTs,
  missingLogRows,
  reviewLogToCsv,
  rowsToPush,
} from "@/features/review/domain/reviewLog";
import { appendMissingLog, appendReviewLog, getReviewLog } from "@/features/review/data/reviewLog";
import { gradeCard } from "@/features/review/domain/srs";
import { ReviewLogEntry } from "@/shared/types";
import { makeEntry } from "./fixtures";

/** Một dòng nhật ký hợp lệ tối thiểu. */
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

describe("buildReviewLogEntry (domain, thuần)", () => {
  it("lấy interval_before từ thẻ cũ, interval_after từ thẻ đã tính lại", () => {
    const before = makeEntry({ user_id: "u1", term: "猫", term_lang: "ja", srs_interval: 1440 });
    const after = { ...before, srs_interval: 3600 };

    const log = buildReviewLogEntry(before, after, "good", 42);

    expect(log).toEqual({
      user_id: "u1",
      term: "猫",
      term_lang: "ja",
      grade: "good",
      ts: 42,
      interval_before: 1440,
      interval_after: 3600,
    });
    // Không tự gán id — để IndexedDB cấp lúc ghi.
    expect(log.id).toBeUndefined();
  });
});

describe("reviewLogToCsv (domain, thuần — Premium xuất lịch sử)", () => {
  const row = (over: object = {}) => ({
    user_id: "u1",
    term: "猫",
    term_lang: "ja" as const,
    grade: "good" as const,
    ts: Date.UTC(2026, 6, 26, 3, 4, 5),
    interval_before: 1440,
    interval_after: 3600,
    ...over,
  });

  it("dòng đầu là header cố định, mỗi lượt một dòng theo thứ tự vào", () => {
    const csv = reviewLogToCsv([row(), row({ term: "犬", grade: "again" as const })]);
    const lines = csv.split("\n");
    expect(lines[0]).toBe("ts_iso,term,term_lang,grade,interval_before_min,interval_after_min");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toBe("2026-07-26T03:04:05.000Z,猫,ja,good,1440,3600");
    expect(lines[2]).toContain("犬,ja,again");
  });

  it("không lộ user_id/id; term chứa dấu phẩy hoặc quote được bọc chuẩn CSV", () => {
    const csv = reviewLogToCsv([row({ id: 7, term: 'a,b "c"' })]);
    expect(csv).not.toContain("u1");
    expect(csv).not.toContain(",7,");
    expect(csv).toContain('"a,b ""c"""');
  });

  it("log rỗng → chỉ còn header", () => {
    expect(reviewLogToCsv([])).toBe("ts_iso,term,term_lang,grade,interval_before_min,interval_after_min");
  });
});

describe("appendReviewLog + getReviewLog (data, IndexedDB)", () => {
  it("ghi thêm rồi đọc lại đúng dòng", async () => {
    await appendReviewLog(
      buildReviewLogEntry(
        makeEntry({ user_id: "alice", term: "hello", term_lang: "en", srs_interval: 10 }),
        { srs_interval: 1 },
        "again",
        1000,
      ),
    );

    const rows = await getReviewLog("alice");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      user_id: "alice",
      term: "hello",
      grade: "again",
      ts: 1000,
      interval_before: 10,
      interval_after: 1,
    });
    // IndexedDB đã cấp khoá tự tăng.
    expect(typeof rows[0].id).toBe("number");
  });

  it("append-only: mỗi lượt là một dòng riêng, sắp theo ts tăng dần", async () => {
    const e = makeEntry({ user_id: "bob", term: "w", term_lang: "en", srs_interval: 5 });
    await appendReviewLog(buildReviewLogEntry(e, { srs_interval: 12 }, "good", 300));
    await appendReviewLog(buildReviewLogEntry(e, { srs_interval: 1 }, "again", 100));
    await appendReviewLog(buildReviewLogEntry(e, { srs_interval: 30 }, "good", 200));

    const rows = await getReviewLog("bob");
    expect(rows.map((r) => r.ts)).toEqual([100, 200, 300]);
  });

  it("chỉ trả nhật ký của đúng người dùng", async () => {
    await appendReviewLog(
      buildReviewLogEntry(makeEntry({ user_id: "carol", term: "x" }), { srs_interval: 1 }, "hard", 1),
    );
    await appendReviewLog(
      buildReviewLogEntry(makeEntry({ user_id: "dave", term: "y" }), { srs_interval: 1 }, "hard", 1),
    );

    expect((await getReviewLog("carol")).every((r) => r.user_id === "carol")).toBe(true);
    expect(await getReviewLog("carol")).toHaveLength(1);
  });
});

describe("logRowsForUser + missingLogRows (domain)", () => {
  it("gán lại chủ nhân và bỏ id nguồn (khoá do IndexedDB đích tự cấp)", () => {
    const rows = logRowsForUser([makeLogRow({ id: 42, user_id: "other" })], "me");
    expect(rows[0].user_id).toBe("me");
    expect("id" in rows[0]).toBe(false);
  });

  it("chỉ giữ dòng chưa có; khử luôn trùng lặp nội bộ của mẻ đến", () => {
    const existing = [makeLogRow({ ts: 1000 })];
    const incoming = [
      makeLogRow({ ts: 1000 }), // đã có trong kho
      makeLogRow({ ts: 2000 }),
      makeLogRow({ ts: 2000 }), // mẻ chứa dòng lặp
      makeLogRow({ ts: 1000, grade: "again" }), // cùng ts nhưng lượt khác → giữ
    ];
    const missing = missingLogRows(existing, incoming);
    expect(missing.map((r) => [r.ts, r.grade])).toEqual([
      [2000, "good"],
      [1000, "again"],
    ]);
  });
});

describe("rowsToPush + maxTs/minTs (domain — chọn phần cần đẩy lên cloud)", () => {
  it("lấy từ mốc trở đi, bỏ id và user_id (server suy từ token)", () => {
    const local = [makeLogRow({ id: 1, ts: 100 }), makeLogRow({ id: 2, ts: 200 })];
    const out = rowsToPush(local, 200);
    expect(out).toHaveLength(1);
    expect(out[0].ts).toBe(200);
    expect("id" in out[0]).toBe(false);
    expect("user_id" in out[0]).toBe(false);
  });

  it("lấy `>=` mốc: dòng biên đẩy lại (server chống trùng) còn hơn bỏ sót dòng cùng ms", () => {
    const local = [makeLogRow({ id: 1, ts: 200 }), makeLogRow({ id: 2, ts: 200, grade: "again" })];
    // Mốc đúng bằng ts của dòng đã đẩy: dòng thứ hai ghi cùng mili-giây vẫn phải lên.
    expect(rowsToPush(local, 200).map((r) => r.grade)).toEqual(["good", "again"]);
  });

  it("kho rỗng → không có gì để đẩy, mốc giữ nguyên", () => {
    expect(rowsToPush([], 500)).toEqual([]);
    expect(maxTs([], 500)).toBe(500);
  });

  it("maxTs/minTs lấy hai đầu của mẻ", () => {
    const rows = rowsToPush([makeLogRow({ ts: 300 }), makeLogRow({ ts: 100 })], 0);
    expect(maxTs(rows, 0)).toBe(300);
    expect(minTs(rows, Number.MAX_SAFE_INTEGER)).toBe(100);
  });
});

describe("appendMissingLog (data — nhận nhật ký từ nơi khác)", () => {
  it("ghi dòng mới dưới tên người đang dùng, nhận lại lần hai không nhân đôi", async () => {
    const incoming = [
      { term: "空", term_lang: "ja", grade: "good" as const, ts: 10, interval_before: 1, interval_after: 5 },
      { term: "空", term_lang: "ja", grade: "again" as const, ts: 20, interval_before: 5, interval_after: 1 },
    ];

    expect(await appendMissingLog("frank", incoming)).toBe(2);
    expect(await appendMissingLog("frank", incoming)).toBe(0);

    const rows = await getReviewLog("frank");
    expect(rows.map((r) => r.ts)).toEqual([10, 20]);
    expect(rows.every((r) => r.user_id === "frank")).toBe(true);
    expect(rows.every((r) => typeof r.id === "number")).toBe(true);
  });
});

describe("chấm thẻ ghi một dòng review_log với before/after đúng", () => {
  // Môi trường test là `node` (không DOM) nên không render được hook useAppStore.
  // Ta tái hiện đúng đoạn ghép mà gradeReview dùng — gradeCard → buildReviewLogEntry
  // → appendReviewLog — để kiểm interval trước/sau khớp trạng thái thẻ thật.
  it("interval_before = thẻ cũ, interval_after = thẻ sau khi gradeCard", async () => {
    const now = 5_000;
    const card = makeEntry({
      user_id: "erin",
      term: "勉強",
      term_lang: "ja",
      card_state: "REVIEW",
      srs_interval: 1440,
      next_review: now,
    });

    // Không truyền rng → gradeCard tất định, before/after kiểm được chính xác.
    const next = { ...card, ...gradeCard(card, "good", now) };
    await appendReviewLog(buildReviewLogEntry(card, next, "good", now));

    const [row] = await getReviewLog("erin");
    expect(row.interval_before).toBe(card.srs_interval);
    expect(row.interval_after).toBe(next.srs_interval);
    expect(row.interval_after).toBeGreaterThan(row.interval_before);
    expect(row).toMatchObject({ term: "勉強", grade: "good", ts: now });
  });
});
