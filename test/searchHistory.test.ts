import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import {
  HISTORY_LIMIT,
  PANEL_LIMIT,
  bumpSearch,
  recentSearches,
  staleSearches,
  topSearches,
} from "@/features/dictionary/domain/searchHistory";
import {
  clearSearchHistory,
  getSearchHistory,
  recordSearch,
  restoreSearchHistory,
} from "@/features/dictionary/data/searchHistory";
import { SearchHistoryEntry } from "@/shared/types";

function row(over: Partial<SearchHistoryEntry> = {}): SearchHistoryEntry {
  return {
    user_id: "u1",
    term: "猫",
    term_lang: "ja",
    native_lang: "vi",
    count: 1,
    lastAt: 1_000,
    ...over,
  };
}

describe("bumpSearch (domain, thuần)", () => {
  const seed = { user_id: "u1", term: "猫", term_lang: "ja", native_lang: "vi", reading: "ねこ" };

  it("từ chưa có → đếm 1, mốc thời gian là lượt tra này", () => {
    expect(bumpSearch(undefined, seed, 5_000)).toEqual({ ...seed, count: 1, lastAt: 5_000 });
  });

  it("tra lại → +1 và dời lastAt", () => {
    const prev = row({ reading: "ねこ", count: 3, lastAt: 1_000 });
    expect(bumpSearch(prev, seed, 9_000)).toMatchObject({ count: 4, lastAt: 9_000 });
  });

  it("lượt tra không có cách đọc thì giữ cách đọc đã lưu", () => {
    const prev = row({ reading: "ねこ" });
    const noReading = { user_id: "u1", term: "猫", term_lang: "ja", native_lang: "vi" };
    expect(bumpSearch(prev, noReading, 2_000).reading).toBe("ねこ");
  });
});

describe("recentSearches / topSearches (domain, thuần)", () => {
  it("gần đây: mới nhất trước", () => {
    const rows = [
      row({ term: "a", lastAt: 100 }),
      row({ term: "b", lastAt: 300 }),
      row({ term: "c", lastAt: 200 }),
    ];
    expect(recentSearches(rows).map((r) => r.term)).toEqual(["b", "c", "a"]);
  });

  it("nhiều nhất: theo số lượt, hoà thì từ tra gần đây hơn đứng trước", () => {
    const rows = [
      row({ term: "a", count: 2, lastAt: 100 }),
      row({ term: "b", count: 5, lastAt: 100 }),
      row({ term: "c", count: 2, lastAt: 500 }),
    ];
    expect(topSearches(rows).map((r) => r.term)).toEqual(["b", "c", "a"]);
  });

  it("chưa từ nào tra lại → mục 'nhiều nhất' rỗng (đừng nhại lại 'gần đây')", () => {
    const rows = [row({ term: "a" }), row({ term: "b" })];
    expect(topSearches(rows)).toEqual([]);
    expect(recentSearches(rows)).toHaveLength(2);
  });

  it("cả hai mục cắt còn PANEL_LIMIT từ", () => {
    const rows = Array.from({ length: PANEL_LIMIT + 5 }, (_, i) =>
      row({ term: `t${i}`, count: 2, lastAt: i }),
    );
    expect(recentSearches(rows)).toHaveLength(PANEL_LIMIT);
    expect(topSearches(rows)).toHaveLength(PANEL_LIMIT);
  });

  it("không sửa mảng gốc (sort tại chỗ là bẫy quen thuộc)", () => {
    const rows = [row({ term: "a", lastAt: 100 }), row({ term: "b", lastAt: 300 })];
    recentSearches(rows);
    staleSearches(rows, 1);
    expect(rows.map((r) => r.term)).toEqual(["a", "b"]);
  });
});

describe("staleSearches (domain, thuần)", () => {
  it("giữ N dòng tra gần nhất, trả phần rơi ra ngoài để xoá", () => {
    const rows = [
      row({ term: "cũ", lastAt: 1 }),
      row({ term: "mới", lastAt: 3 }),
      row({ term: "giữa", lastAt: 2 }),
    ];
    expect(staleSearches(rows, 2).map((r) => r.term)).toEqual(["cũ"]);
  });

  it("dưới trần thì không xoá gì", () => {
    expect(staleSearches([row(), row({ term: "x" })], HISTORY_LIMIT)).toEqual([]);
  });
});

describe("recordSearch + getSearchHistory (data, IndexedDB)", () => {
  it("tra hai lần cùng một từ chỉ là MỘT dòng, đếm 2", async () => {
    const seed = { user_id: "alice", term: "食べる", term_lang: "ja", native_lang: "vi" };
    await recordSearch(seed, 1_000);
    await recordSearch({ ...seed, reading: "たべる" }, 2_000);

    const rows = await getSearchHistory("alice");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ term: "食べる", reading: "たべる", count: 2, lastAt: 2_000 });
  });

  it("cùng mặt chữ nhưng khác cặp ngôn ngữ là hai dòng riêng", async () => {
    await recordSearch({ user_id: "bob", term: "sale", term_lang: "en", native_lang: "vi" }, 1);
    await recordSearch({ user_id: "bob", term: "sale", term_lang: "ja", native_lang: "vi" }, 2);
    expect(await getSearchHistory("bob")).toHaveLength(2);
  });

  it("chỉ trả lịch sử của đúng người dùng", async () => {
    await recordSearch({ user_id: "carol", term: "x", term_lang: "en", native_lang: "vi" }, 1);
    await recordSearch({ user_id: "dave", term: "y", term_lang: "en", native_lang: "vi" }, 1);

    const rows = await getSearchHistory("carol");
    expect(rows.map((r) => r.term)).toEqual(["x"]);
  });

  it("vượt trần thì rụng đúng những từ lâu không tra", async () => {
    for (let i = 0; i < HISTORY_LIMIT + 3; i++)
      await recordSearch({ user_id: "erin", term: `t${i}`, term_lang: "en", native_lang: "vi" }, i + 1);

    const rows = await getSearchHistory("erin");
    expect(rows).toHaveLength(HISTORY_LIMIT);
    // Ba từ tra sớm nhất (t0, t1, t2) đã bị cắt; từ mới nhất còn nguyên.
    expect(rows.map((r) => r.term)).not.toContain("t0");
    expect(rows.map((r) => r.term)).toContain(`t${HISTORY_LIMIT + 2}`);
  });
});

describe("clearSearchHistory + restoreSearchHistory (data, IndexedDB)", () => {
  it("xoá sạch lịch sử của mình, trả lại đủ dòng để hoàn tác", async () => {
    await recordSearch({ user_id: "frank", term: "a", term_lang: "en", native_lang: "vi" }, 1);
    await recordSearch({ user_id: "frank", term: "b", term_lang: "en", native_lang: "vi" }, 2);
    await recordSearch({ user_id: "grace", term: "c", term_lang: "en", native_lang: "vi" }, 3);

    const removed = await clearSearchHistory("frank");
    expect(removed).toHaveLength(2);
    expect(await getSearchHistory("frank")).toEqual([]);
    // Lịch sử người khác không hề hấn gì.
    expect(await getSearchHistory("grace")).toHaveLength(1);

    await restoreSearchHistory(removed);
    expect((await getSearchHistory("frank")).map((r) => r.term).sort()).toEqual(["a", "b"]);
  });
});
