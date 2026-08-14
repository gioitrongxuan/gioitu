import { describe, expect, it } from "vitest";
import {
  RATING_NOTE_MAX,
  RATING_STARS,
  RatingSummary,
  checkRating,
  distributionRows,
  formatAverage,
  starLabel,
} from "@/features/rating/domain/rating";

function summary(byStar: Record<string, number>): RatingSummary {
  const entries = Object.entries(byStar);
  const count = entries.reduce((n, [, c]) => n + c, 0);
  const total = entries.reduce((n, [s, c]) => n + Number(s) * c, 0);
  return { count, average: count === 0 ? 0 : total / count, byStar };
}

describe("checkRating", () => {
  it("nhận bản nháp hợp lệ và trả nhận xét đã trim", () => {
    const check = checkRating({ stars: 4, note: "  Dùng ổn\n" });
    expect(check).toEqual({ ok: true, value: { stars: 4, note: "Dùng ổn" } });
  });

  it("nhận xét là tuỳ chọn — chấm sao suông vẫn gửi được", () => {
    expect(checkRating({ stars: 5, note: "   " })).toEqual({ ok: true, value: { stars: 5, note: "" } });
  });

  it("từ chối khi chưa chọn sao", () => {
    expect(checkRating({ stars: null, note: "hay" })).toEqual({
      ok: false,
      error: "Hãy chọn từ 1 đến 5 sao",
    });
  });

  it("từ chối mức sao ngoài thang, kể cả số lẻ", () => {
    for (const stars of [0, 6, -1, 3.5]) {
      expect(checkRating({ stars, note: "" }).ok).toBe(false);
    }
  });

  it("nhận đủ năm mức đang khai báo", () => {
    for (const { stars } of RATING_STARS) {
      expect(checkRating({ stars, note: "" }).ok).toBe(true);
    }
  });

  it("đo độ dài SAU khi trim — khoảng trắng thừa không làm nhận xét bị coi là quá dài", () => {
    expect(checkRating({ stars: 3, note: `  ${"a".repeat(RATING_NOTE_MAX)}  ` }).ok).toBe(true);
  });

  it("từ chối khi nhận xét vượt trần độ dài", () => {
    expect(checkRating({ stars: 3, note: "a".repeat(RATING_NOTE_MAX + 1) })).toEqual({
      ok: false,
      error: `Nhận xét quá dài (tối đa ${RATING_NOTE_MAX} ký tự)`,
    });
  });
});

describe("starLabel", () => {
  it("dịch mức sao thành nhãn tiếng Việt", () => {
    expect(starLabel(1)).toBe("Rất tệ");
    expect(starLabel(5)).toBe("Rất tốt");
  });

  it("mức lạ không làm vỡ UI", () => {
    expect(starLabel(0)).toBe("");
    expect(starLabel(9)).toBe("");
  });
});

describe("distributionRows", () => {
  it("xếp 5 sao trước và tính đúng phần trăm", () => {
    const rows = distributionRows(summary({ "1": 1, "2": 0, "3": 0, "4": 1, "5": 2 }));
    expect(rows.map((r) => r.stars)).toEqual([5, 4, 3, 2, 1]);
    expect(rows.map((r) => r.count)).toEqual([2, 1, 0, 0, 1]);
    expect(rows.map((r) => r.percent)).toEqual([50, 25, 0, 0, 25]);
  });

  it("chưa có phiếu nào thì mọi hàng về 0, không NaN", () => {
    const rows = distributionRows({ count: 0, average: 0, byStar: {} });
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row.count).toBe(0);
      expect(row.percent).toBe(0);
    }
  });

  it("mức sao thiếu trong tổng hợp được coi là 0 phiếu", () => {
    const rows = distributionRows({ count: 2, average: 5, byStar: { "5": 2 } });
    expect(rows.find((r) => r.stars === 3)).toEqual({ stars: 3, count: 0, percent: 0 });
  });

  it("không đụng vào RATING_STARS gốc khi đảo thứ tự", () => {
    distributionRows(summary({ "5": 1 }));
    expect(RATING_STARS.map((s) => s.stars)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("formatAverage", () => {
  it("một chữ số thập phân, dấu phẩy kiểu Việt", () => {
    expect(formatAverage(summary({ "4": 1, "5": 2 }))).toBe("4,7");
    expect(formatAverage(summary({ "5": 3 }))).toBe("5,0");
  });

  it("chưa ai đánh giá thì hiện — chứ không phải 0,0", () => {
    expect(formatAverage({ count: 0, average: 0, byStar: {} })).toBe("—");
  });
});
