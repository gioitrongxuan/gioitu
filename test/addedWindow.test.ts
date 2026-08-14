// Khoảng ngày tự chọn cho bộ lọc "Thêm trong" (#259) — phần thuần của
// cửa sổ dạng AddedRange: cắt theo ngày địa phương, gọi tên trong câu, và
// vòng đọc/ghi localStorage. Các cửa sổ dựng sẵn ("7d"…) đã có ở wordcloud.test.
import { describe, it, expect } from "vitest";
import {
  addedWindowPhrase,
  buildCloud,
  filterByAddedWithin,
  narrowsAdded,
  AddedWindow,
} from "@/features/review/domain/wordcloud";
import { parseAddedWindow, serializeAddedWindow } from "@/features/review/domain/addedWindowSettings";
import { parseDateInput, toDateInput } from "@/shared/date";
import { makeEntry } from "./fixtures";

const at = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h).getTime();

describe("khoảng ngày 'thêm trong' (#259)", () => {
  const now = at(2026, 6, 23);
  const entries = [
    makeEntry({ term: "s3", created_at: at(2026, 5, 1), status: "LEARNING", lookup_count: 1 }),
    makeEntry({ term: "ec2", created_at: at(2026, 5, 20), status: "LEARNING", lookup_count: 5 }),
    makeEntry({ term: "sakura", created_at: at(2026, 6, 10), status: "LEARNING", lookup_count: 9 }),
  ];
  const range = (from: string, to: string) => ({ kind: "range", from, to }) as const;

  it("giữ đúng từ thêm trong khoảng, bao trọn cả hai ngày đầu mút", () => {
    const kept = filterByAddedWithin(entries, range("2026-05-01", "2026-05-20"), now);
    expect(kept.map((e) => e.term)).toEqual(["s3", "ec2"]);
  });

  it("một ngày duy nhất là trọn ngày đó, không phải 0h", () => {
    // Từ thêm lúc 10h ngày 20/05 vẫn nằm trong khoảng 20/05–20/05.
    expect(filterByAddedWithin(entries, range("2026-05-20", "2026-05-20"), now).map((e) => e.term)).toEqual(["ec2"]);
  });

  it("bỏ trống một đầu là để ngỏ đầu đó", () => {
    expect(filterByAddedWithin(entries, range("2026-05-20", ""), now).map((e) => e.term)).toEqual(["ec2", "sakura"]);
    expect(filterByAddedWithin(entries, range("", "2026-05-20"), now).map((e) => e.term)).toEqual(["s3", "ec2"]);
  });

  it("khoảng rỗng hoặc ngày hỏng thì không thu hẹp gì", () => {
    expect(filterByAddedWithin(entries, range("", ""), now)).toHaveLength(3);
    expect(filterByAddedWithin(entries, range("2026-02-31", "hôm qua"), now)).toHaveLength(3);
    expect(narrowsAdded(range("", ""))).toBe(false);
    expect(narrowsAdded(range("2026-05-01", ""))).toBe(true);
  });

  it("buildCloud thu hẹp theo khoảng và chuẩn hoá lại max trong đó", () => {
    const cloud = buildCloud(entries, { now, addedWindow: range("2026-05-01", "2026-05-20") });
    expect(cloud.map((t) => t.entry.term).sort()).toEqual(["ec2", "s3"]);
    // Trong khoảng, max lookup_count là 5 (ec2) → shade 1; sakura (9 lượt) đã rơi ra.
    expect(cloud.find((t) => t.entry.term === "ec2")!.shade).toBe(1);
  });

  it("gọi tên cửa sổ trong câu theo đúng dạng của nó", () => {
    expect(addedWindowPhrase("7d")).toBe("thêm trong 7 ngày qua");
    expect(addedWindowPhrase("all")).toBe("");
    expect(addedWindowPhrase(range("2026-05-01", "2026-05-20"))).toBe("thêm từ 01/05/2026 đến 20/05/2026");
    expect(addedWindowPhrase(range("2026-05-01", ""))).toBe("thêm từ 01/05/2026");
    expect(addedWindowPhrase(range("", "2026-05-20"))).toBe("thêm đến hết 20/05/2026");
    expect(addedWindowPhrase(range("", ""))).toBe("");
  });
});

describe("lưu cửa sổ 'thêm trong'", () => {
  it("đi trọn vòng cho cả preset lẫn khoảng ngày", () => {
    const windows: AddedWindow[] = ["all", "7d", { kind: "range", from: "2026-05-01", to: "" }];
    for (const w of windows) {
      expect(parseAddedWindow(serializeAddedWindow(w))).toEqual(w);
    }
  });

  it("từ chối chuỗi lạ để bộ lọc rơi về mặc định thay vì hỏng", () => {
    expect(parseAddedWindow("999d")).toBeNull();
    expect(parseAddedWindow("range:2026-05-01")).toBeNull();
    expect(parseAddedWindow("range:2026-05-01:2026-05-20:xx")).toBeNull();
  });
});

describe("ngày địa phương của ô chọn ngày", () => {
  it("đọc/ghi 'YYYY-MM-DD' quanh nửa đêm địa phương", () => {
    expect(toDateInput(at(2026, 5, 1, 0))).toBe("2026-05-01");
    expect(toDateInput(at(2026, 5, 1, 23))).toBe("2026-05-01");
    expect(parseDateInput("2026-05-01")).toBe(new Date(2026, 4, 1).getTime());
  });

  it("trả null cho chuỗi rỗng, sai định dạng hoặc ngày không có thật", () => {
    expect(parseDateInput("")).toBeNull();
    expect(parseDateInput("01/05/2026")).toBeNull();
    expect(parseDateInput("2026-02-31")).toBeNull();
  });
});
