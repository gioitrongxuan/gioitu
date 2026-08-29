import "fake-indexeddb/auto";
import { describe, it, expect, afterEach } from "vitest";
import { openDB, type IDBPDatabase } from "idb";
import { getDb, _resetDbPromise } from "@/shared/db";
import { describeDbError } from "@/shared/dbError";

const DB_NAME = "gioitu";
let openHandle: IDBPDatabase | null = null;

function deleteDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

afterEach(async () => {
  if (openHandle) openHandle.close();
  openHandle = null;
  _resetDbPromise();
  await deleteDb();
});

describe("describeDbError", () => {
  it("VersionError nói rõ là app cũ mở CSDL mới, và ĐỪNG xoá dữ liệu", () => {
    const msg = describeDbError(Object.assign(new Error("lower version"), { name: "VersionError" }));
    expect(msg).toContain("MỚI HƠN");
    expect(msg).toContain("không xoá dữ liệu");
  });

  it("hết dung lượng có thông điệp riêng", () => {
    const msg = describeDbError(Object.assign(new Error("quota"), { name: "QuotaExceededError" }));
    expect(msg).toContain("hết chỗ trống");
  });

  it("lỗi lạ vẫn có câu chung, không rơi vào im lặng", () => {
    expect(describeDbError(new Error("???"))).not.toBe("");
    expect(describeDbError(null)).not.toBe("");
  });
});

describe("mở CSDL bằng bản app cũ hơn dữ liệu trên máy", () => {
  // Kịch bản thật: chạy nhánh mới (CSDL lên version cao), rồi quay lại bản cũ.
  // IndexedDB từ chối hạ version → getDb() REJECT. Trước đây nơi gọi chỉ
  // console.error rồi để `loaded` mãi false, tức màn hình đứng skeleton vĩnh viễn
  // và người dùng tưởng máy chủ hỏng.
  it("getDb() ném VersionError, và ta dịch được thành câu người đọc", async () => {
    const newer = await openDB(DB_NAME, 999, { upgrade() {} });
    newer.close();
    _resetDbPromise();

    const err = await getDb().then(
      () => null,
      (e: unknown) => e,
    );
    expect((err as Error | null)?.name).toBe("VersionError");
    expect(describeDbError(err)).toContain("MỚI HƠN");
  });
});
