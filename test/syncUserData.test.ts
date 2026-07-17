import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { pullUserData, pushUserData } from "@/features/review/data/syncApi";
import { syncUserData, getAllEntries, putEntry } from "@/features/review/data/repository";
import { makeEntry } from "./fixtures";

// Chặn lớp mạng để lái từng nhánh của syncUserData bằng kết quả pull/push giả.
vi.mock("@/features/review/data/syncApi", () => ({
  pullUserData: vi.fn(),
  pushUserData: vi.fn(),
}));
const mockPull = pullUserData as unknown as ReturnType<typeof vi.fn>;
const mockPush = pushUserData as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockPull.mockReset();
  mockPush.mockReset().mockResolvedValue({ status: "ok" });
});

describe("syncUserData — báo cáo trung thực", () => {
  it("pull offline: giữ local, status offline, KHÔNG push", async () => {
    const uid = "u-offline";
    await putEntry(makeEntry({ user_id: uid, term: "local" }));
    mockPull.mockResolvedValue({ status: "offline", entries: [] });

    const report = await syncUserData(uid);
    expect(report.status).toBe("offline");
    expect(report.pulled).toBe(0);
    expect(report.pushed).toBe(0);
    expect(report.entries.some((e) => e.term === "local")).toBe(true);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("pull 401 (token hết hạn): status unauthorized, KHÔNG push", async () => {
    const uid = "u-unauth";
    await putEntry(makeEntry({ user_id: uid, term: "local" }));
    mockPull.mockResolvedValue({ status: "unauthorized", entries: [] });

    const report = await syncUserData(uid);
    expect(report.status).toBe("unauthorized");
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("pull ok + push ok: merge, ghi cache, đếm pulled/pushed", async () => {
    const uid = "u-ok";
    await putEntry(makeEntry({ user_id: uid, term: "local", updated_at: 100 }));
    mockPull.mockResolvedValue({
      status: "ok",
      entries: [makeEntry({ user_id: uid, term: "remote", updated_at: 200 })],
    });

    const report = await syncUserData(uid);
    expect(report.status).toBe("ok");
    expect(report.pulled).toBe(1);
    expect(report.pushed).toBe(2); // local + remote sau merge
    expect(mockPush).toHaveBeenCalledOnce();

    // Cache đã hợp nhất cả hai từ.
    const cached = await getAllEntries(uid);
    expect(cached.map((e) => e.term).sort()).toEqual(["local", "remote"]);
  });

  it("pull ok nhưng push offline: cache đã cập nhật, nhưng status offline + pushed 0", async () => {
    const uid = "u-pushfail";
    await putEntry(makeEntry({ user_id: uid, term: "local" }));
    mockPull.mockResolvedValue({
      status: "ok",
      entries: [makeEntry({ user_id: uid, term: "remote" })],
    });
    mockPush.mockResolvedValue({ status: "offline" });

    const report = await syncUserData(uid);
    expect(report.status).toBe("offline");
    expect(report.pulled).toBe(1);
    expect(report.pushed).toBe(0);
    const cached = await getAllEntries(uid);
    expect(cached.map((e) => e.term).sort()).toEqual(["local", "remote"]);
  });

  it("pull ok nhưng push 401 (token vừa hết hạn): status unauthorized", async () => {
    const uid = "u-pushunauth";
    await putEntry(makeEntry({ user_id: uid, term: "local" }));
    mockPull.mockResolvedValue({ status: "ok", entries: [] });
    mockPush.mockResolvedValue({ status: "unauthorized" });

    const report = await syncUserData(uid);
    expect(report.status).toBe("unauthorized");
    expect(report.pushed).toBe(0);
  });
});
