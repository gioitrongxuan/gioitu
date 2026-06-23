import { describe, it, expect } from "vitest";
import {
  buildCloud,
  computeShade,
  effectiveCount,
  filterByLang,
  groupByPeriod,
  isVisibleOnCloud,
  periodOf,
} from "@/features/review/domain/wordcloud";
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
