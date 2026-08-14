import { describe, it, expect } from "vitest";
import {
  buildCloud,
  computeShade,
  dueEntriesInGroup,
  effectiveCount,
  filterByAddedWithin,
  filterByLang,
  groupByPeriod,
  groupBySrsTier,
  isVisibleOnCloud,
  periodOf,
  srsTier,
  tagPopoverContent,
} from "@/features/review/domain/wordcloud";
import { DAY, DEFAULT_SRS_CONFIG } from "@/features/review/domain/constants";
import { makeEntry } from "./fixtures";

describe("visibility depends on SRS status (constraint 4)", () => {
  it("shows LEARNING and RELAPSED, hides LEARNED", () => {
    expect(isVisibleOnCloud({ status: "LEARNING" })).toBe(true);
    expect(isVisibleOnCloud({ status: "RELAPSED" })).toBe(true);
    expect(isVisibleOnCloud({ status: "LEARNED" })).toBe(false);
  });

  it("hides deleted words regardless of status", () => {
    expect(isVisibleOnCloud({ status: "LEARNING", deleted_at: 1 })).toBe(false);
    expect(isVisibleOnCloud({ status: "RELAPSED", deleted_at: 1 })).toBe(false);
  });
});

describe("log-normalized shade (fix point 7)", () => {
  it("0 count -> 0, max count -> 1, and is monotonic", () => {
    expect(computeShade(0, 100)).toBe(0);
    expect(computeShade(100, 100)).toBe(1);
    expect(computeShade(5, 100)).toBeGreaterThan(computeShade(2, 100));
    expect(computeShade(5, 100)).toBeLessThan(1);
  });

  it("returns 0 when there is no positive max", () => {
    expect(computeShade(0, 0)).toBe(0);
  });
});

describe("buildCloud", () => {
  it("filters out LEARNED, flags badges and normalizes by visible max", () => {
    const entries = [
      makeEntry({ term: "a", status: "LEARNING", lookup_count: 1 }),
      makeEntry({ term: "b", status: "RELAPSED", lookup_count: 10 }),
      makeEntry({ term: "c", status: "LEARNED", lookup_count: 99 }),
    ];
    const cloud = buildCloud(entries, { now: 0 });
    expect(cloud.map((t) => t.entry.term).sort()).toEqual(["a", "b"]);
    const b = cloud.find((t) => t.entry.term === "b")!;
    expect(b.hasBadge).toBe(true); // RELAPSED carries the badge
    expect(b.shade).toBe(1); // highest among visible (LEARNED excluded)
  });

  it("colour is independent of SRS (constraint 3): badge word can be lighter", () => {
    const entries = [
      makeEntry({ term: "x", status: "RELAPSED", lookup_count: 1 }),
      makeEntry({ term: "y", status: "LEARNING", lookup_count: 50 }),
    ];
    const cloud = buildCloud(entries, { now: 0 });
    const x = cloud.find((t) => t.entry.term === "x")!;
    const y = cloud.find((t) => t.entry.term === "y")!;
    expect(x.shade).toBeLessThan(y.shade);
  });
});

describe("cloud ordering", () => {
  const entries = [
    makeEntry({ term: "old", status: "LEARNING", lookup_count: 9, last_lookup_at: 100 }),
    makeEntry({ term: "new", status: "LEARNING", lookup_count: 2, last_lookup_at: 300 }),
    makeEntry({ term: "mid", status: "LEARNING", lookup_count: 5, last_lookup_at: 200 }),
  ];

  it("defaults to recent-first (newly looked-up words on top)", () => {
    const cloud = buildCloud(entries, { now: 1000 });
    expect(cloud.map((t) => t.entry.term)).toEqual(["new", "mid", "old"]);
  });

  it("sorts by frequency when requested", () => {
    const cloud = buildCloud(entries, { now: 1000, sort: "frequency" });
    expect(cloud.map((t) => t.entry.term)).toEqual(["old", "mid", "new"]);
  });

  it("sort does not change the normalization max (colour stays stable)", () => {
    const recent = buildCloud(entries, { now: 1000, sort: "recent" });
    const freq = buildCloud(entries, { now: 1000, sort: "frequency" });
    const shadeOf = (c: typeof recent, term: string) => c.find((t) => t.entry.term === term)!.shade;
    expect(shadeOf(recent, "old")).toBeCloseTo(shadeOf(freq, "old"));
  });
});

describe("language split", () => {
  const entries = [
    makeEntry({ term: "食べる", term_lang: "ja", status: "LEARNING", lookup_count: 5 }),
    makeEntry({ term: "apple", term_lang: "en", status: "LEARNING", lookup_count: 3 }),
    makeEntry({ term: "学校", term_lang: "ja", status: "RELAPSED", lookup_count: 1 }),
  ];

  it("filterByLang keeps only the chosen language; 'all' keeps everything", () => {
    expect(filterByLang(entries, "all")).toHaveLength(3);
    expect(filterByLang(entries, "ja").map((e) => e.term)).toEqual(["食べる", "学校"]);
    expect(filterByLang(entries, "en").map((e) => e.term)).toEqual(["apple"]);
  });

  it("buildCloud filters by language and renormalizes the max within it", () => {
    const ja = buildCloud(entries, { now: 0, lang: "ja" });
    expect(ja.map((t) => t.entry.term).sort()).toEqual(["学校", "食べる"]);
    // Within ja the max lookup_count is 5 (食べる) → shade 1; the en word is gone.
    expect(ja.find((t) => t.entry.term === "食べる")!.shade).toBe(1);
    expect(ja.some((t) => t.entry.term === "apple")).toBe(false);
  });
});

describe("cửa sổ 'thêm gần đây' (#250)", () => {
  const now = new Date(2026, 5, 23, 10).getTime(); // 2026-06-23 local time
  const daysAgo = (d: number) => now - d * 24 * 60 * 60 * 1000;
  const entries = [
    makeEntry({ term: "s3", created_at: daysAgo(0.5), status: "LEARNING", lookup_count: 1 }),
    makeEntry({ term: "ec2", created_at: daysAgo(3), status: "LEARNING", lookup_count: 5 }),
    makeEntry({ term: "sakura", created_at: daysAgo(200), status: "LEARNING", lookup_count: 9 }),
  ];

  it("giữ đúng từ thêm trong cửa sổ; 'all' giữ tất cả", () => {
    expect(filterByAddedWithin(entries, "all", now)).toHaveLength(3);
    expect(filterByAddedWithin(entries, "1d", now).map((e) => e.term)).toEqual(["s3"]);
    expect(filterByAddedWithin(entries, "7d", now).map((e) => e.term)).toEqual(["s3", "ec2"]);
    expect(filterByAddedWithin(entries, "90d", now).map((e) => e.term)).toEqual(["s3", "ec2"]);
  });

  it("lọc theo lúc THÊM, không theo lượt tra gần nhất", () => {
    // Từ cũ vừa tra lại hôm nay vẫn nằm ngoài cửa sổ 7 ngày.
    const old = makeEntry({ term: "cũ", created_at: daysAgo(100), last_lookup_at: now });
    expect(filterByAddedWithin([old], "7d", now)).toEqual([]);
  });

  it("mốc cắt tính theo bao gồm (>= now - N ngày)", () => {
    const edge = makeEntry({ term: "biên", created_at: daysAgo(7) });
    expect(filterByAddedWithin([edge], "7d", now)).toHaveLength(1);
  });

  it("buildCloud thu hẹp theo cửa sổ và chuẩn hoá lại max trong đó", () => {
    const recent = buildCloud(entries, { now, addedWindow: "7d" });
    expect(recent.map((t) => t.entry.term).sort()).toEqual(["ec2", "s3"]);
    // Trong cửa sổ, max lookup_count là 5 (ec2) → shade 1; từ cũ (9 lượt) đã rơi ra.
    expect(recent.find((t) => t.entry.term === "ec2")!.shade).toBe(1);
  });
});

describe("time bucketing (periodOf)", () => {
  const now = new Date(2026, 5, 23, 10).getTime(); // 2026-06-23 local time

  it("labels day buckets, with relative 'Hôm nay'/'Hôm qua'", () => {
    expect(periodOf(new Date(2026, 5, 23, 8).getTime(), "day", now)).toEqual({ key: "2026-06-23", label: "Hôm nay" });
    expect(periodOf(new Date(2026, 5, 22, 23).getTime(), "day", now)).toEqual({ key: "2026-06-22", label: "Hôm qua" });
    expect(periodOf(new Date(2026, 5, 1).getTime(), "day", now)).toEqual({ key: "2026-06-01", label: "01/06/2026" });
  });

  it("labels month and year buckets", () => {
    expect(periodOf(new Date(2026, 5, 9).getTime(), "month", now)).toEqual({ key: "2026-06", label: "Tháng 6 2026" });
    expect(periodOf(new Date(2025, 11, 31).getTime(), "year", now)).toEqual({ key: "2025", label: "2025" });
  });
});

describe("groupByPeriod", () => {
  const now = new Date(2026, 5, 23, 12).getTime();
  const tags = [
    { entry: { last_lookup_at: new Date(2026, 5, 23, 9).getTime() } },
    { entry: { last_lookup_at: new Date(2026, 5, 22, 9).getTime() } },
    { entry: { last_lookup_at: new Date(2026, 4, 10).getTime() } },
    { entry: { last_lookup_at: new Date(2026, 5, 23, 18).getTime() } },
  ];

  it("buckets by day, newest bucket first, keeping ≥1 item per matching day", () => {
    const groups = groupByPeriod(tags, "day", now);
    expect(groups.map((g) => g.label)).toEqual(["Hôm nay", "Hôm qua", "10/05/2026"]);
    expect(groups[0].items).toHaveLength(2); // both 2026-06-23 lookups land together
  });

  it("buckets by month and year", () => {
    expect(groupByPeriod(tags, "month", now).map((g) => g.label)).toEqual(["Tháng 6 2026", "Tháng 5 2026"]);
    expect(groupByPeriod(tags, "year", now).map((g) => g.key)).toEqual(["2026"]);
  });

  it("buckets by a custom timestamp (learned_at) when tsOf is given", () => {
    // Trang Đã thuộc gom theo learned_at, không phải last_lookup_at: cùng ngày
    // tra nhưng khác ngày thuộc phải rơi vào hai nhóm khác nhau.
    const learned = [
      { entry: { last_lookup_at: now, learned_at: new Date(2026, 5, 23, 9).getTime() } },
      { entry: { last_lookup_at: now, learned_at: new Date(2026, 5, 22, 9).getTime() } },
    ];
    const groups = groupByPeriod(learned, "day", now, (e) => e.learned_at ?? e.last_lookup_at);
    expect(groups.map((g) => g.label)).toEqual(["Hôm nay", "Hôm qua"]);
  });

  it("falls back to last_lookup_at when learned_at is absent", () => {
    const legacy = [{ entry: { last_lookup_at: new Date(2026, 5, 22, 9).getTime() } }];
    const groups = groupByPeriod(legacy, "day", now, (e) => e.learned_at ?? e.last_lookup_at);
    expect(groups.map((g) => g.label)).toEqual(["Hôm qua"]);
  });
});

describe("srsTier — 3 tầng Khu vườn ký ức", () => {
  it("RELAPSED luôn là 'forgetting', kể cả interval lớn", () => {
    // Tái quên là tín hiệu mong manh nhất, thắng cả interval × ease cao.
    expect(srsTier(makeEntry({ status: "RELAPSED", card_state: "REVIEW", srs_interval: 100 * DAY, ease_factor: 2.5 }))).toBe("forgetting");
  });

  it("chưa vào REVIEW (learning/relearning/chưa có thẻ) là 'forgetting'", () => {
    expect(srsTier(makeEntry({ status: "LEARNING", card_state: "LEARNING", srs_interval: 10 }))).toBe("forgetting");
    expect(srsTier(makeEntry({ status: "LEARNING", card_state: "NEW", srs_interval: 0 }))).toBe("forgetting");
    expect(srsTier(makeEntry({ status: "LEARNING", card_state: null }))).toBe("forgetting");
  });

  it("thẻ REVIEW còn xa ngưỡng trưởng thành là 'rooting'", () => {
    // 3 ngày × 2.5 = 7.5 ngày < matureThreshold (21 ngày).
    expect(srsTier(makeEntry({ status: "LEARNING", card_state: "REVIEW", srs_interval: 3 * DAY, ease_factor: 2.5 }))).toBe("rooting");
  });

  it("thẻ REVIEW cách một lần 'Nhớ' là chạm ngưỡng → 'maturing'", () => {
    // 20 ngày × 2.5 = 50 ngày ≥ matureThreshold (21 ngày) nhưng interval hiện tại
    // (20 ngày) vẫn dưới ngưỡng nên chưa LEARNED → còn hiện trên cloud.
    expect(20 * DAY).toBeLessThan(DEFAULT_SRS_CONFIG.matureThreshold);
    expect(srsTier(makeEntry({ status: "LEARNING", card_state: "REVIEW", srs_interval: 20 * DAY, ease_factor: 2.5 }))).toBe("maturing");
  });
});

describe("groupBySrsTier", () => {
  const item = (over: Parameters<typeof makeEntry>[0]) => ({ entry: makeEntry(over) });

  it("trả về các tầng có thẻ, theo thứ tự mong manh → trưởng thành", () => {
    const items = [
      item({ term: "mature", status: "LEARNING", card_state: "REVIEW", srs_interval: 20 * DAY, ease_factor: 2.5 }),
      item({ term: "fresh", status: "LEARNING", card_state: "LEARNING", srs_interval: 10 }),
      item({ term: "growing", status: "LEARNING", card_state: "REVIEW", srs_interval: 3 * DAY, ease_factor: 2.5 }),
    ];
    const groups = groupBySrsTier(items);
    expect(groups.map((g) => g.label)).toEqual(["Sắp quên", "Đang bén rễ", "Sắp trưởng thành"]);
    expect(groups.map((g) => g.key)).toEqual(["forgetting", "rooting", "maturing"]);
  });

  it("bỏ tầng rỗng và giữ nguyên thứ tự đến của thẻ trong một tầng", () => {
    const items = [
      item({ term: "a", status: "RELAPSED", card_state: "REVIEW", srs_interval: 10 }),
      item({ term: "b", status: "LEARNING", card_state: "NEW", srs_interval: 0 }),
    ];
    const groups = groupBySrsTier(items);
    expect(groups.map((g) => g.label)).toEqual(["Sắp quên"]); // chỉ một tầng có thẻ
    expect(groups[0].items.map((i) => i.entry.term)).toEqual(["a", "b"]);
  });
});

describe("dueEntriesInGroup", () => {
  const now = 10_000_000;

  it("chỉ giữ entry đến hạn trong nhóm, bỏ entry chưa đến hạn", () => {
    const entries = [
      makeEntry({ term: "quá hạn", status: "LEARNING", card_state: "REVIEW", srs_interval: 3 * DAY, ease_factor: 2.5, next_review: now - 1 }),
      makeEntry({ term: "chưa hạn", status: "LEARNING", card_state: "REVIEW", srs_interval: 3 * DAY, ease_factor: 2.5, next_review: now + DAY }),
    ];
    const groups = groupBySrsTier(buildCloud(entries, { now }));
    expect(groups).toHaveLength(1); // cả hai cùng tầng "rooting"
    expect(dueEntriesInGroup(groups[0]).map((e) => e.term)).toEqual(["quá hạn"]);
  });

  it("trả về mảng rỗng khi không có entry nào due trong nhóm", () => {
    const entries = [
      makeEntry({ term: "a", status: "LEARNING", card_state: "REVIEW", srs_interval: 3 * DAY, ease_factor: 2.5, next_review: now + DAY }),
    ];
    const groups = groupBySrsTier(buildCloud(entries, { now }));
    expect(dueEntriesInGroup(groups[0])).toEqual([]);
  });
});

describe("tagPopoverContent (nội dung popover mini, #159 — thay tooltip title)", () => {
  const now = 10_000_000;
  const DAY = 24 * 60 * 60 * 1000;

  it("gồm cách đọc, nghĩa đầu, lịch ôn và số lần tra", () => {
    const e = makeEntry({
      reading: "たべる",
      meaning: JSON.stringify(["ăn", "xơi"]),
      lookup_count: 5,
      card_state: "REVIEW",
      next_review: now + 2 * DAY,
    });
    expect(tagPopoverContent(e, now)).toEqual({
      reading: "たべる",
      gloss: "ăn",
      schedule: "ôn sau 2.0 ngày",
      lookupText: "tra 5 lần",
    });
  });

  it("đọc 'đến hạn' cho thẻ quá hạn và bỏ reading khi thiếu", () => {
    const e = makeEntry({
      term_lang: "en",
      reading: undefined,
      meaning: JSON.stringify(["empathy"]),
      lookup_count: 1,
      card_state: "REVIEW",
      next_review: now - 1,
    });
    expect(tagPopoverContent(e, now)).toEqual({
      reading: undefined,
      gloss: "empathy",
      schedule: "đến hạn",
      lookupText: "tra 1 lần",
    });
  });

  it("bỏ lịch ôn khi từ chưa có thẻ SRS", () => {
    const e = makeEntry({
      reading: "か",
      meaning: JSON.stringify(["nghĩa"]),
      lookup_count: 3,
      card_state: null,
      next_review: null,
    });
    expect(tagPopoverContent(e, now)).toEqual({
      reading: "か",
      gloss: "nghĩa",
      schedule: undefined,
      lookupText: "tra 3 lần",
    });
  });

  it("nhận meaning dạng chữ trơn và bỏ gloss rỗng", () => {
    expect(tagPopoverContent(makeEntry({ reading: undefined, meaning: "chào", lookup_count: 2, card_state: null }), now).gloss)
      .toBe("chào");
    expect(tagPopoverContent(makeEntry({ reading: undefined, meaning: "", lookup_count: 2, card_state: null }), now).gloss)
      .toBeUndefined();
  });
});

describe("time-decay (optional, default off)", () => {
  it("returns raw count when disabled", () => {
    const e = makeEntry({ lookup_count: 10, last_lookup_at: 0 });
    expect(effectiveCount(e)).toBe(10);
  });

  it("decays weight by time when enabled", () => {
    const e = makeEntry({ lookup_count: 10, last_lookup_at: 0 });
    const decayed = effectiveCount(e, { timeDecay: true, lambda: 0.1, now: 10 * 24 * 60 * 60 * 1000 });
    expect(decayed).toBeLessThan(10);
    expect(decayed).toBeGreaterThan(0);
  });
});
