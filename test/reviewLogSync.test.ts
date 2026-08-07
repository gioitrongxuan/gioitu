import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { pullReviewLog, pushReviewLog } from "@/features/review/data/reviewLogApi";
import { syncReviewLog } from "@/features/review/data/reviewLogSync";
import { appendReviewLog, getReviewLog } from "@/features/review/data/reviewLog";
import {
  readReviewLogCursor,
  rewindPushedThrough,
  writeReviewLogCursor,
} from "@/features/review/data/reviewLogCursor";
import { ReviewLogEntry } from "@/shared/types";

// Chặn lớp mạng để lái từng nhánh của syncReviewLog bằng pull/push giả.
vi.mock("@/features/review/data/reviewLogApi", () => ({
  pullReviewLog: vi.fn(),
  pushReviewLog: vi.fn(),
}));
const mockPull = pullReviewLog as unknown as ReturnType<typeof vi.fn>;
const mockPush = pushReviewLog as unknown as ReturnType<typeof vi.fn>;

/** Trang pull rỗng: "server không có gì mới sau con trỏ này". */
const emptyPage = (since: number) => ({ status: "ok", rows: [], cursor: since, more: false });

function row(over: Partial<ReviewLogEntry> = {}): ReviewLogEntry {
  return {
    user_id: "u",
    term: "犬",
    term_lang: "ja",
    grade: "good",
    ts: 1000,
    interval_before: 1440,
    interval_after: 3600,
    ...over,
  };
}

beforeEach(() => {
  // Môi trường test là `node`: dựng localStorage tối thiểu như test/theme.test.ts.
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  };
  mockPull.mockReset().mockImplementation(async (since: number) => emptyPage(since));
  mockPush.mockReset().mockResolvedValue({ status: "ok", inserted: 0 });
});

describe("syncReviewLog — đẩy phần mới, kéo phần thiếu", () => {
  it("đẩy nhật ký cục bộ (không kèm id/user_id) rồi ghi mốc đã đẩy", async () => {
    const uid = "u-push";
    await appendReviewLog(row({ user_id: uid, ts: 100 }));
    await appendReviewLog(row({ user_id: uid, ts: 300, grade: "again" }));
    mockPush.mockResolvedValue({ status: "ok", inserted: 2 });

    const report = await syncReviewLog(uid);

    expect(report).toEqual({ status: "ok", pushed: 2, pulled: 0 });
    const sent = mockPush.mock.calls[0][0];
    expect(sent.map((r: ReviewLogEntry) => r.ts)).toEqual([100, 300]);
    expect(sent.every((r: object) => !("id" in r) && !("user_id" in r))).toBe(true);
    expect(readReviewLogCursor(uid).pushedThrough).toBe(300);
  });

  it("lượt sau chỉ đẩy phần mới (dòng biên đẩy lại, dòng cũ hơn thì không)", async () => {
    const uid = "u-push2";
    await appendReviewLog(row({ user_id: uid, ts: 100 }));
    await appendReviewLog(row({ user_id: uid, ts: 300 }));
    await syncReviewLog(uid);

    await appendReviewLog(row({ user_id: uid, ts: 900 }));
    mockPush.mockClear();
    await syncReviewLog(uid);

    expect(mockPush.mock.calls[0][0].map((r: ReviewLogEntry) => r.ts)).toEqual([300, 900]);
    expect(readReviewLogCursor(uid).pushedThrough).toBe(900);
  });

  it("không có gì để đẩy thì không gọi push", async () => {
    const report = await syncReviewLog("u-empty");
    expect(mockPush).not.toHaveBeenCalled();
    expect(report).toEqual({ status: "ok", pushed: 0, pulled: 0 });
  });

  it("kéo dòng của máy khác về IndexedDB và nhớ con trỏ seq", async () => {
    const uid = "u-pull";
    mockPull.mockResolvedValueOnce({
      status: "ok",
      rows: [
        { term: "猫", term_lang: "ja", grade: "good", ts: 50, interval_before: 1, interval_after: 10 },
        { term: "猫", term_lang: "ja", grade: "again", ts: 60, interval_before: 10, interval_after: 1 },
      ],
      cursor: 7,
      more: false,
    });

    const report = await syncReviewLog(uid);

    expect(report).toEqual({ status: "ok", pushed: 0, pulled: 2 });
    expect((await getReviewLog(uid)).map((r) => r.ts)).toEqual([50, 60]);
    expect(readReviewLogCursor(uid).pulledSeq).toBe(7);
    expect(mockPull).toHaveBeenCalledWith(0);
  });

  it("kéo tiếp khi server báo còn trang (more), dừng ở trang cuối", async () => {
    const uid = "u-pages";
    mockPull
      .mockResolvedValueOnce({
        status: "ok",
        rows: [{ term: "a", term_lang: "en", grade: "good", ts: 1, interval_before: 1, interval_after: 2 }],
        cursor: 1,
        more: true,
      })
      .mockResolvedValueOnce({
        status: "ok",
        rows: [{ term: "b", term_lang: "en", grade: "good", ts: 2, interval_before: 1, interval_after: 2 }],
        cursor: 2,
        more: false,
      });

    const report = await syncReviewLog(uid);

    expect(report.pulled).toBe(2);
    expect(mockPull).toHaveBeenNthCalledWith(2, 1);
    expect(readReviewLogCursor(uid).pulledSeq).toBe(2);
  });

  it("dòng kéo về trùng dòng đã có thì không nhân đôi lịch sử", async () => {
    const uid = "u-dup";
    await appendReviewLog(row({ user_id: uid, ts: 100 }));
    mockPull.mockResolvedValueOnce({
      status: "ok",
      rows: [{ term: "犬", term_lang: "ja", grade: "good", ts: 100, interval_before: 1440, interval_after: 3600 }],
      cursor: 3,
      more: false,
    });

    const report = await syncReviewLog(uid);

    expect(report.pulled).toBe(0);
    expect(await getReviewLog(uid)).toHaveLength(1);
  });
});

describe("syncReviewLog — hỏng giữa chừng thì báo thật, mốc không nhảy", () => {
  it("push offline: không kéo tiếp, mốc đẩy giữ nguyên", async () => {
    const uid = "u-offline";
    await appendReviewLog(row({ user_id: uid, ts: 100 }));
    mockPush.mockResolvedValue({ status: "offline", inserted: 0 });

    const report = await syncReviewLog(uid);

    expect(report).toEqual({ status: "offline", pushed: 0, pulled: 0 });
    expect(mockPull).not.toHaveBeenCalled();
    expect(readReviewLogCursor(uid).pushedThrough).toBe(0);
  });

  it("push ok nhưng pull 401: giữ mốc đẩy đã ghi, báo unauthorized", async () => {
    const uid = "u-unauth";
    await appendReviewLog(row({ user_id: uid, ts: 100 }));
    mockPush.mockResolvedValue({ status: "ok", inserted: 1 });
    mockPull.mockResolvedValue({ status: "unauthorized", rows: [], cursor: 0, more: false });

    const report = await syncReviewLog(uid);

    expect(report).toEqual({ status: "unauthorized", pushed: 1, pulled: 0 });
    expect(readReviewLogCursor(uid).pushedThrough).toBe(100);
    expect(readReviewLogCursor(uid).pulledSeq).toBe(0);
  });
});

describe("reviewLogCursor", () => {
  it("mốc hỏng trong localStorage → đồng bộ lại từ đầu thay vì ném lỗi", () => {
    localStorage.setItem("gioitu.reviewLogSync.v1:u-bad", "{không phải json");
    expect(readReviewLogCursor("u-bad")).toEqual({ pushedThrough: 0, pulledSeq: 0 });
  });

  it("rewind chỉ hạ mốc xuống, không bao giờ đẩy tới", () => {
    writeReviewLogCursor("u-rw", { pushedThrough: 500, pulledSeq: 9 });
    rewindPushedThrough("u-rw", 900);
    expect(readReviewLogCursor("u-rw").pushedThrough).toBe(500);

    rewindPushedThrough("u-rw", 120);
    expect(readReviewLogCursor("u-rw")).toEqual({ pushedThrough: 120, pulledSeq: 9 });
  });
});
