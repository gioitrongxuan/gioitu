import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { buildReviewLogEntry } from "@/features/review/domain/reviewLog";
import { appendReviewLog, getReviewLog } from "@/features/review/data/reviewLog";
import { gradeCard } from "@/features/review/domain/srs";
import { makeEntry } from "./fixtures";

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
