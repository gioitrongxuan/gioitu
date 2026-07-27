import { describe, it, expect } from "vitest";
import {
  retentionByDay,
  retentionByInterval,
  retentionRate,
  summarizeRetention,
  countReviewsSince,
  forecastDueByDay,
  learnedOverTime,
  contiguousRuns,
  forecastDayLabel,
  STATS_WINDOW_DAYS,
  FORECAST_DAYS,
  INTERVAL_BANDS,
  activityByDay,
  ACTIVITY_DAYS,
  mostForgotten,
} from "@/features/review/domain/reviewStats";
import { DAY } from "@/features/review/domain/constants";
import { formatDayMonth } from "@/shared/date";
import { ReviewLogEntry } from "@/shared/types";
import { makeEntry } from "./fixtures";

const DAY_MS = 24 * 60 * 60 * 1000;

// Mốc "now" cố định giữa ngày (12:00 địa phương) để bucketing theo nửa đêm
// không phụ thuộc giờ chạy test.
const NOW = new Date(2026, 6, 26, 12, 0, 0).getTime(); // 26/07/2026 12:00

/** Nửa đêm địa phương của N ngày trước hôm nay. */
const midnightDaysAgo = (n: number) => new Date(2026, 6, 26 - n).getTime();

function makeLog(over: Partial<ReviewLogEntry> = {}): ReviewLogEntry {
  return {
    user_id: "u1",
    term: "test",
    term_lang: "ja",
    grade: "good",
    ts: NOW,
    interval_before: 1 * DAY,
    interval_after: 3 * DAY,
    ...over,
  };
}

describe("retentionByDay", () => {
  it("trả đủ một phần tử mỗi ngày, cũ → mới, phần tử cuối là hôm nay", () => {
    const days = retentionByDay([], NOW);
    expect(days).toHaveLength(STATS_WINDOW_DAYS);
    expect(days[days.length - 1].dayStart).toBe(midnightDaysAgo(0));
    expect(days[0].dayStart).toBe(midnightDaysAgo(STATS_WINDOW_DAYS - 1));
    expect(days.every((d) => d.total === 0 && d.remembered === 0)).toBe(true);
  });

  it("đếm đúng lượt nhớ/quên theo ngày địa phương", () => {
    const yesterday = midnightDaysAgo(1);
    const log = [
      makeLog({ ts: yesterday + 1000, grade: "good" }),
      makeLog({ ts: yesterday + 2000, grade: "again" }),
      makeLog({ ts: yesterday + 3000, grade: "hard" }), // hard vẫn là "nhớ được"
      makeLog({ ts: NOW, grade: "easy" }),
    ];

    const days = retentionByDay(log, NOW);
    const y = days[days.length - 2];
    const today = days[days.length - 1];
    expect(y).toMatchObject({ total: 3, remembered: 2 });
    expect(today).toMatchObject({ total: 1, remembered: 1 });
  });

  it("bỏ qua learning step (interval_before < 1 ngày) — true retention kiểu Anki", () => {
    const log = [
      makeLog({ interval_before: 0, grade: "good" }), // thẻ NEW
      makeLog({ interval_before: 10, grade: "good" }), // step 10 phút
      makeLog({ interval_before: 1 * DAY, grade: "good" }), // thẻ REVIEW thật
    ];
    const today = retentionByDay(log, NOW)[STATS_WINDOW_DAYS - 1];
    expect(today).toMatchObject({ total: 1, remembered: 1 });
  });

  it("bỏ qua lượt ngoài cửa sổ (quá cũ hoặc trong tương lai)", () => {
    const log = [
      makeLog({ ts: midnightDaysAgo(STATS_WINDOW_DAYS) + 1000 }), // trước ngày đầu
      makeLog({ ts: midnightDaysAgo(-1) + 1000 }), // sang ngày mai
    ];
    const days = retentionByDay(log, NOW);
    expect(summarizeRetention(days).total).toBe(0);
  });

  it("lượt rơi đúng nửa đêm ngày đầu cửa sổ vẫn được tính", () => {
    const log = [makeLog({ ts: midnightDaysAgo(STATS_WINDOW_DAYS - 1) })];
    expect(retentionByDay(log, NOW)[0].total).toBe(1);
  });
});

describe("retentionRate + summarizeRetention", () => {
  it("rate = remembered/total; ngày trống trả null (không phải 0%)", () => {
    expect(retentionRate({ total: 4, remembered: 3 })).toBe(0.75);
    expect(retentionRate({ total: 0, remembered: 0 })).toBeNull();
  });

  it("summarize cộng dồn cả cửa sổ", () => {
    const days = [
      { dayStart: 0, total: 2, remembered: 1 },
      { dayStart: 1, total: 0, remembered: 0 },
      { dayStart: 2, total: 3, remembered: 3 },
    ];
    expect(summarizeRetention(days)).toEqual({ total: 5, remembered: 4 });
  });
});

describe("countReviewsSince", () => {
  it("đếm MỌI lượt chấm (kể cả learning step) từ mốc since", () => {
    const log = [
      makeLog({ ts: 100, interval_before: 0 }),
      makeLog({ ts: 200 }),
      makeLog({ ts: 300 }),
    ];
    expect(countReviewsSince(log, 200)).toBe(2);
  });
});

describe("retentionByInterval (Premium — stats nâng cao)", () => {
  it("trả đủ mọi nhóm theo thứ tự INTERVAL_BANDS, nhóm trống giữ total 0", () => {
    const rows = retentionByInterval([], NOW);
    expect(rows.map((r) => r.band)).toEqual(INTERVAL_BANDS);
    expect(rows.every((r) => r.total === 0 && r.remembered === 0)).toBe(true);
  });

  it("xếp lượt vào đúng nhóm theo interval_before (biên dưới đóng, biên trên mở)", () => {
    const log = [
      makeLog({ interval_before: 1 * DAY, grade: "good" }), // nhóm 1–6 ngày
      makeLog({ interval_before: 7 * DAY - 1, grade: "again" }), // sát trần nhóm đầu
      makeLog({ interval_before: 7 * DAY, grade: "good" }), // rơi sang 1–4 tuần
      makeLog({ interval_before: 45 * DAY, grade: "again" }), // 1–3 tháng
      makeLog({ interval_before: 200 * DAY, grade: "easy" }), // nhóm mở ≥ 3 tháng
    ];
    const [b1, b2, b3, b4] = retentionByInterval(log, NOW);
    expect(b1).toMatchObject({ total: 2, remembered: 1 });
    expect(b2).toMatchObject({ total: 1, remembered: 1 });
    expect(b3).toMatchObject({ total: 1, remembered: 0 });
    expect(b4).toMatchObject({ total: 1, remembered: 1 });
  });

  it("bỏ learning step (< 1 ngày) và lượt ngoài cửa sổ — cùng luật với retentionByDay", () => {
    const log = [
      makeLog({ interval_before: 10 }), // step 10 phút
      makeLog({ ts: midnightDaysAgo(STATS_WINDOW_DAYS) + 1000 }), // trước cửa sổ
      makeLog({ ts: NOW }),
    ];
    const rows = retentionByInterval(log, NOW);
    expect(rows.reduce((sum, r) => sum + r.total, 0)).toBe(1);
  });
});

describe("forecastDueByDay", () => {
  it("trả đủ 7 ngày, phần tử đầu là hôm nay", () => {
    const days = forecastDueByDay([], NOW);
    expect(days).toHaveLength(FORECAST_DAYS);
    expect(days[0].dayStart).toBe(midnightDaysAgo(0));
    expect(days[FORECAST_DAYS - 1].dayStart).toBe(midnightDaysAgo(-(FORECAST_DAYS - 1)));
  });

  it("chia thẻ vào đúng ngày đến hạn; thẻ quá hạn dồn vào hôm nay", () => {
    const entries = [
      makeEntry({ term: "a", card_state: "REVIEW", next_review: NOW - 3 * DAY_MS }), // quá hạn lâu
      makeEntry({ term: "b", card_state: "REVIEW", next_review: NOW + 1000 }), // hôm nay
      makeEntry({ term: "c", card_state: "REVIEW", next_review: NOW + 2 * DAY_MS }), // ngày kia
      makeEntry({ term: "d", card_state: "REVIEW", next_review: NOW + 2 * DAY_MS + 1000 }),
    ];
    const days = forecastDueByDay(entries, NOW);
    expect(days[0].count).toBe(2);
    expect(days[1].count).toBe(0);
    expect(days[2].count).toBe(2);
  });

  it("bỏ qua thẻ ngoài tầm 7 ngày, chưa có card, hoặc đã xoá", () => {
    const entries = [
      makeEntry({ term: "far", card_state: "REVIEW", next_review: NOW + 30 * DAY_MS }),
      makeEntry({ term: "nocard", card_state: null, next_review: null }),
      makeEntry({ term: "gone", card_state: "REVIEW", next_review: NOW + 1000, deleted_at: NOW }),
    ];
    const days = forecastDueByDay(entries, NOW);
    expect(days.every((d) => d.count === 0)).toBe(true);
  });

  it("biên phải: đến hạn cuối ngày thứ 7 vẫn tính, sang nửa đêm ngày thứ 8 thì thôi", () => {
    const endOfWindow = midnightDaysAgo(-FORECAST_DAYS); // nửa đêm ngày thứ 8
    const entries = [
      makeEntry({ term: "in", card_state: "REVIEW", next_review: endOfWindow - 1 }),
      makeEntry({ term: "out", card_state: "REVIEW", next_review: endOfWindow }),
    ];
    const days = forecastDueByDay(entries, NOW);
    expect(days[FORECAST_DAYS - 1].count).toBe(1);
  });
});

describe("learnedOverTime", () => {
  it("luỹ kế theo learned_at; từ thuộc trước cửa sổ nằm trong nền ngày đầu", () => {
    const entries = [
      makeEntry({ term: "old", status: "LEARNED", learned_at: midnightDaysAgo(100) }),
      makeEntry({ term: "mid", status: "LEARNED", learned_at: midnightDaysAgo(5) + 1000 }),
      makeEntry({ term: "new", status: "LEARNED", learned_at: NOW - 1000 }),
    ];
    const days = learnedOverTime(entries, NOW);
    expect(days[0].cumulative).toBe(1); // chỉ "old"
    const beforeMid = days[days.length - 7];
    const afterMid = days[days.length - 6];
    expect(beforeMid.cumulative).toBe(1);
    expect(afterMid.cumulative).toBe(2);
    expect(days[days.length - 1].cumulative).toBe(3); // điểm cuối = tổng hiện tại
  });

  it("fallback last_lookup_at cho entry cũ chưa đóng dấu learned_at", () => {
    const entries = [
      makeEntry({ term: "legacy", status: "LEARNED", last_lookup_at: midnightDaysAgo(2) + 500 }),
    ];
    const days = learnedOverTime(entries, NOW);
    expect(days[days.length - 3].cumulative).toBe(1);
    expect(days[days.length - 4].cumulative).toBe(0);
  });

  it("không đếm từ chưa thuộc hoặc đã xoá", () => {
    const entries = [
      makeEntry({ term: "learning", status: "LEARNING", learned_at: NOW }),
      makeEntry({ term: "relapsed", status: "RELAPSED", learned_at: NOW }),
      makeEntry({ term: "gone", status: "LEARNED", learned_at: NOW, deleted_at: NOW }),
    ];
    const days = learnedOverTime(entries, NOW);
    expect(days[days.length - 1].cumulative).toBe(0);
  });
});

describe("contiguousRuns", () => {
  it("tách các đoạn có dữ liệu, ngày trống là khoảng hở", () => {
    const items = [1, 2, 0, 0, 3, 0, 4, 5];
    expect(contiguousRuns(items, (n) => n > 0)).toEqual([[1, 2], [3], [4, 5]]);
  });

  it("mảng toàn trống → không có đoạn nào", () => {
    expect(contiguousRuns([0, 0], (n) => n > 0)).toEqual([]);
  });
});

describe("nhãn trục thời gian", () => {
  it("formatDayMonth ra dd/MM có đệm số 0", () => {
    expect(formatDayMonth(new Date(2026, 6, 5).getTime())).toBe("05/07");
  });

  it("forecastDayLabel: hai ngày đầu gọi tên, còn lại dd/MM", () => {
    expect(forecastDayLabel(0, midnightDaysAgo(0))).toBe("Hôm nay");
    expect(forecastDayLabel(1, midnightDaysAgo(-1))).toBe("Ngày mai");
    expect(forecastDayLabel(2, new Date(2026, 6, 28).getTime())).toBe("28/07");
  });
});

describe("activityByDay (#150)", () => {
  it("trả đủ 7 phần tử cũ → mới, phần tử cuối là hôm nay", () => {
    const days = activityByDay([], NOW);
    expect(days).toHaveLength(ACTIVITY_DAYS);
    expect(days[days.length - 1].dayStart).toBe(midnightDaysAgo(0));
    expect(days[0].dayStart).toBe(midnightDaysAgo(ACTIVITY_DAYS - 1));
    expect(days.every((d) => d.count === 0)).toBe(true);
  });

  it("đếm MỌI lượt (kể cả learning step) theo ngày địa phương; ngoài cửa sổ bỏ qua", () => {
    const yesterday = midnightDaysAgo(1);
    const log = [
      makeLog({ ts: yesterday + 1000, interval_before: 0 }), // thẻ NEW vẫn đếm
      makeLog({ ts: yesterday + 2000, interval_before: 10 }), // step 10 phút vẫn đếm
      makeLog({ ts: NOW }),
      makeLog({ ts: midnightDaysAgo(ACTIVITY_DAYS) + 1000 }), // rơi trước cửa sổ
    ];

    const days = activityByDay(log, NOW);
    expect(days[days.length - 2].count).toBe(2);
    expect(days[days.length - 1].count).toBe(1);
    expect(days.reduce((sum, d) => sum + d.count, 0)).toBe(3);
  });
});

describe("mostForgotten (#150)", () => {
  it("xếp theo lapses giảm dần, đồng hạng thì từ tra gần đây trước, cắt đúng limit", () => {
    const entries = [
      makeEntry({ term: "it", lapses: 1 }),
      makeEntry({ term: "top", lapses: 5 }),
      makeEntry({ term: "mid-old", lapses: 3, last_lookup_at: 1_000 }),
      makeEntry({ term: "mid-new", lapses: 3, last_lookup_at: 2_000 }),
    ];
    expect(mostForgotten(entries).map((e) => e.term)).toEqual(["top", "mid-new", "mid-old"]);
  });

  it("bỏ từ chưa từng rớt và từ đã xoá", () => {
    const entries = [
      makeEntry({ term: "never", lapses: 0 }),
      makeEntry({ term: "gone", lapses: 9, deleted_at: 123 }),
      makeEntry({ term: "real", lapses: 2 }),
    ];
    expect(mostForgotten(entries).map((e) => e.term)).toEqual(["real"]);
  });
});
