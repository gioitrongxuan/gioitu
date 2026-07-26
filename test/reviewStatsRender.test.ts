// Smoke test render ba biểu đồ SVG của Thống kê ôn tập bằng SSR (react-dom/
// server chạy được trong môi trường node, không cần DOM): bắt lỗi hình học
// (NaN trong toạ độ, path hỏng) mà test domain thuần không thấy được.

import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  RetentionChart,
  ForecastChart,
  LearnedChart,
} from "@/features/review/ui/ReviewStats/ReviewStats";
import {
  retentionByDay,
  forecastDueByDay,
  learnedOverTime,
} from "@/features/review/domain/reviewStats";
import { DAY } from "@/features/review/domain/constants";
import { makeEntry } from "./fixtures";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 6, 26, 12, 0, 0).getTime();

describe("biểu đồ thống kê render ra SVG hợp lệ (không NaN)", () => {
  it("RetentionChart: ngày trống là khoảng hở — có điểm nhưng không nối xuyên", () => {
    // Hai cụm ngày có dữ liệu cách nhau một ngày trống → 2 polyline? Không:
    // cụm 1 điểm chỉ ra circle. Dữ liệu: hôm nay + hôm qua (nối nhau), và một
    // ngày lẻ cách 5 ngày (điểm đơn).
    const log = [
      { user_id: "u", term: "a", term_lang: "ja", grade: "good" as const, ts: NOW, interval_before: DAY, interval_after: 2 * DAY },
      { user_id: "u", term: "a", term_lang: "ja", grade: "again" as const, ts: NOW - DAY_MS, interval_before: DAY, interval_after: DAY },
      { user_id: "u", term: "a", term_lang: "ja", grade: "good" as const, ts: NOW - 5 * DAY_MS, interval_before: DAY, interval_after: 2 * DAY },
    ];
    const html = renderToStaticMarkup(
      createElement(RetentionChart, { days: retentionByDay(log, NOW) }),
    );

    expect(html).toContain("<svg");
    expect(html).not.toContain("NaN");
    // Một đoạn liền (hôm qua + hôm nay) → đúng 1 polyline; 3 ngày có dữ liệu → 3 điểm.
    expect(html.match(/<polyline/g)).toHaveLength(1);
    expect(html.match(/<circle/g)).toHaveLength(3);
    expect(html).toContain("Hôm nay");
  });

  it("ForecastChart: mỗi ngày có thẻ một cột, ngày 0 thẻ chỉ có nhãn", () => {
    const entries = [
      makeEntry({ term: "a", card_state: "REVIEW", next_review: NOW - DAY_MS }), // quá hạn → hôm nay
      makeEntry({ term: "b", card_state: "REVIEW", next_review: NOW + 3 * DAY_MS }),
    ];
    const html = renderToStaticMarkup(
      createElement(ForecastChart, { days: forecastDueByDay(entries, NOW) }),
    );

    expect(html).not.toContain("NaN");
    // 2 ngày có thẻ → 2 cột (path); nhãn đủ 7 ngày.
    expect(html.match(/rs-bar/g)).toHaveLength(2);
    expect(html).toContain("Hôm nay");
    expect(html).toContain("Ngày mai");
  });

  it("LearnedChart: có vùng tô + đường luỹ kế, tooltip theo ngày", () => {
    const entries = [
      makeEntry({ term: "a", status: "LEARNED", learned_at: NOW - 10 * DAY_MS }),
      makeEntry({ term: "b", status: "LEARNED", learned_at: NOW }),
    ];
    const html = renderToStaticMarkup(
      createElement(LearnedChart, { days: learnedOverTime(entries, NOW) }),
    );

    expect(html).not.toContain("NaN");
    expect(html).toContain("rs-area");
    expect(html).toContain("rs-learned-line");
    expect(html).toContain("2 từ");
  });
});
