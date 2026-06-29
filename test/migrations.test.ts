import { describe, it, expect } from "vitest";
import { migrations, pendingMigrations } from "@server/core/migrations/index";

describe("migration runner — chọn migration chưa áp dụng", () => {
  it("trả về toàn bộ khi chưa áp dụng gì", () => {
    expect(pendingMigrations(new Set()).map((m) => m.version)).toEqual(
      migrations.map((m) => m.version),
    );
  });

  it("bỏ version đã áp dụng, giữ thứ tự", () => {
    expect(pendingMigrations(new Set(["0001"])).map((m) => m.version)).toEqual(
      migrations.filter((m) => m.version !== "0001").map((m) => m.version),
    );
  });

  it("rỗng khi tất cả đã áp dụng", () => {
    expect(pendingMigrations(new Set(migrations.map((m) => m.version)))).toEqual([]);
  });

  it("version duy nhất, đúng dạng 4 chữ số, sql không rỗng", () => {
    const versions = migrations.map((m) => m.version);
    expect(new Set(versions).size).toBe(versions.length);
    for (const m of migrations) {
      expect(m.version).toMatch(/^\d{4}$/);
      expect(m.sql.trim().length).toBeGreaterThan(0);
    }
  });
});
