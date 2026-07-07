import { describe, it, expect } from "vitest";
import {
  scoreAdjust,
  kanjiOf,
  computeKanjiStats,
  knownKanji,
  applyGrouping,
  percent,
  STRONG_INTERVAL_DAYS,
  KanjiGrouping,
} from "@/features/kanjistats/domain/kanjigrid";
import { DEFAULT_SRS_CONFIG } from "@/features/review/domain/constants";

const DAY = 1440; // minutes

/** A minimal source word: only the fields computeKanjiStats reads. */
const word = (term: string, days: number) => ({ term, srs_interval: days * DAY });

describe("scoreAdjust", () => {
  it("maps the interval ratio into [0,1) along the add-on's curve", () => {
    expect(scoreAdjust(0)).toBe(0);
    expect(scoreAdjust(1)).toBeCloseTo(0.75, 5); // 1 - 1/4
    expect(scoreAdjust(3)).toBeCloseTo(0.9375, 5); // 1 - 1/16
  });

  it("rises monotonically and never reaches 1", () => {
    expect(scoreAdjust(100)).toBeLessThan(1);
    expect(scoreAdjust(2)).toBeGreaterThan(scoreAdjust(1));
  });
});

describe("kanjiOf", () => {
  it("keeps only kanji, in first-seen order, deduped", () => {
    expect(kanjiOf("食べ物")).toEqual(["食", "物"]);
    expect(kanjiOf("時々")).toEqual(["時"]); // 々 (iteration mark) is not a CJK ideograph
    expect(kanjiOf("日本語で日本")).toEqual(["日", "本", "語"]);
  });

  it("returns nothing for kana-only or non-Japanese terms", () => {
    expect(kanjiOf("たべもの")).toEqual([]);
    expect(kanjiOf("hello")).toEqual([]);
  });
});

describe("computeKanjiStats", () => {
  it("counts every word containing a kanji and averages their intervals", () => {
    const stats = computeKanjiStats([word("日本", 30), word("日曜日", 90)]);
    const nichi = stats.get("日")!;
    expect(nichi.wordCount).toBe(2);
    expect(nichi.avgInterval).toBe(((30 + 90) / 2) * DAY);
    // 本 and 語-less: 本 appears once.
    expect(stats.get("本")!.wordCount).toBe(1);
  });

  it("scores a kanji by its averaged interval against the strong threshold", () => {
    const stats = computeKanjiStats([word("山", STRONG_INTERVAL_DAYS)]);
    // avg == strong ⇒ ratio 1 ⇒ scoreAdjust(1) == 0.75.
    expect(stats.get("山")!.score).toBeCloseTo(0.75, 5);
  });

  it("reads a word asserted known ('Đã biết' → knownInterval) as near-fully mastered", () => {
    const stats = computeKanjiStats([{ term: "一", srs_interval: DEFAULT_SRS_CONFIG.knownInterval }]);
    expect(stats.get("一")!.score).toBeGreaterThan(0.97);
  });

  it("gives a zero-interval word a zero score but still counts it as seen", () => {
    const stats = computeKanjiStats([word("川", 0)]);
    expect(stats.get("川")!.wordCount).toBe(1);
    expect(stats.get("川")!.score).toBe(0);
  });

  it("ignores words without any kanji", () => {
    expect(computeKanjiStats([word("ねこ", 30), word("cat", 30)]).size).toBe(0);
  });
});

describe("knownKanji", () => {
  it("orders known kanji strongest first", () => {
    const stats = computeKanjiStats([word("山", 200), word("川", 10)]);
    expect(knownKanji(stats).map((s) => s.kanji)).toEqual(["山", "川"]);
  });
});

const grouping: KanjiGrouping = {
  name: "Test",
  lang: "ja",
  source: "test",
  leftover_group: "Ngoài nhóm",
  groups: [
    { name: "G1", characters: "日本" },
    { name: "G2", characters: "山川" },
  ],
};

describe("applyGrouping", () => {
  it("flags each group kanji known/missing in order and counts coverage", () => {
    const stats = computeKanjiStats([word("日本", 30)]); // knows 日 and 本
    const cov = applyGrouping(stats, grouping);

    const g1 = cov.groups[0];
    expect(g1.cells.map((c) => c.kanji)).toEqual(["日", "本"]);
    expect(g1.cells.every((c) => c.stat !== null)).toBe(true);
    expect(g1.knownCount).toBe(2);
    expect(g1.total).toBe(2);

    const g2 = cov.groups[1];
    expect(g2.knownCount).toBe(0);
    expect(g2.cells.every((c) => c.stat === null)).toBe(true);
  });

  it("aggregates known-in-grouping and grouping totals across groups", () => {
    const stats = computeKanjiStats([word("日本", 30), word("山", 30)]);
    const cov = applyGrouping(stats, grouping);
    expect(cov.groupingTotal).toBe(4); // 日 本 山 川
    expect(cov.knownInGrouping).toBe(3); // 日 本 山
  });

  it("collects known kanji outside every group into the leftover bucket", () => {
    const stats = computeKanjiStats([word("犬", 30)]); // 犬 is in no group
    const cov = applyGrouping(stats, grouping);
    expect(cov.leftover.known.map((s) => s.kanji)).toEqual(["犬"]);
  });
});

describe("percent", () => {
  it("rounds and guards against divide-by-zero", () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(0, 0)).toBe(0);
    expect(percent(3, 4)).toBe(75);
  });
});
