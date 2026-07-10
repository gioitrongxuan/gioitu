import { describe, it, expect } from "vitest";
import { applyProgress, classify, cellShade, countProgress, percent } from "@/features/vocabstudy/domain/vocablist";
import { VocabEntry } from "@/shared/types";
import { makeEntry } from "./fixtures";

const NOW = 7_000_000;

// Helpers — đặt cặp ngôn ngữ ja→vi cho mọi entry trong test này (list học tiếng Nhật).
function jaEntry(over: Partial<VocabEntry> = {}): VocabEntry {
  return makeEntry({ term: "食べる", term_lang: "ja", native_lang: "vi", ...over });
}

describe("classify", () => {
  it("missing khi chưa có entry", () => {
    expect(classify(undefined, NOW)).toBe("missing");
  });

  it("learned khi entry đã tốt nghiệp", () => {
    expect(classify(jaEntry({ status: "LEARNED" }), NOW)).toBe("learned");
  });

  it("due khi có card và đến hạn ôn", () => {
    expect(classify(jaEntry({ card_state: "REVIEW", next_review: NOW - 1 }), NOW)).toBe("due");
  });

  it("learning khi có card nhưng chưa đến hạn", () => {
    expect(classify(jaEntry({ card_state: "REVIEW", next_review: NOW + 1000 }), NOW)).toBe("learning");
  });

  it("missing khi có entry nhưng chưa có card (giai đoạn gating)", () => {
    expect(classify(jaEntry({ card_state: null }), NOW)).toBe("missing");
  });
});

describe("applyProgress", () => {
  const words = [
    { term: "食べる", term_lang: "ja", native_lang: "vi" },
    { term: "読む", term_lang: "ja", native_lang: "vi" },
    { term: "走る", term_lang: "ja", native_lang: "vi" },
    { term: "書く", term_lang: "ja", native_lang: "vi" },
  ];

  it("phân đủ bốn trạng thái khi overlay entries lên danh sách", () => {
    const entries = [
      jaEntry({ term: "食べる", status: "LEARNED" }),
      jaEntry({ term: "読む", card_state: "REVIEW", next_review: NOW - 1 }), // due
      jaEntry({ term: "走る", card_state: "REVIEW", next_review: NOW + 1000 }), // learning
      // 書く không có entry → missing
    ];
    const cells = applyProgress(words, entries, NOW);
    expect(cells.map((c) => c.progress)).toEqual(["learned", "due", "learning", "missing"]);
  });

  it("ghép theo (term, term_lang) — cùng chữ khác ngôn ngữ không nhầm", () => {
    const entries = [jaEntry({ term: "食べる", status: "LEARNED" })];
    const cells = applyProgress(
      [
        { term: "食べる", term_lang: "ja", native_lang: "vi" },
        { term: "食べる", term_lang: "en", native_lang: "vi" }, // cùng chữ, khác lang → missing
      ],
      entries,
      NOW,
    );
    expect(cells.map((c) => c.progress)).toEqual(["learned", "missing"]);
  });

  it("bỏ qua từ trùng trong danh sách (chỉ giữ ô đầu)", () => {
    const cells = applyProgress(
      [
        { term: "食べる", term_lang: "ja", native_lang: "vi" },
        { term: "食べる", term_lang: "ja", native_lang: "vi" },
      ],
      [],
      NOW,
    );
    expect(cells).toHaveLength(1);
  });

  it("entry đã xoá (tombstone) không che từ — từ hiện lại như chưa có", () => {
    const entries = [jaEntry({ term: "食べる", deleted_at: NOW })];
    const cells = applyProgress(words, entries, NOW);
    expect(cells.find((c) => c.word.term === "食べる")!.progress).toBe("missing");
  });

  it("giữ nguyên thứ tự danh sách nguồn", () => {
    const cells = applyProgress(words, [], NOW);
    expect(cells.map((c) => c.word.term)).toEqual(["食べる", "読む", "走る", "書く"]);
  });
});

describe("cellShade", () => {
  it("đã thuộc mạnh nhất, chưa có yếu nhất, due đậm hơn learning", () => {
    expect(cellShade("learned")).toBeGreaterThan(cellShade("due"));
    expect(cellShade("due")).toBeGreaterThan(cellShade("learning"));
    expect(cellShade("learning")).toBeGreaterThan(cellShade("missing"));
    expect(cellShade("missing")).toBe(0);
  });
});

describe("countProgress", () => {
  it("đếm đúng từng nhóm và tổng", () => {
    const cells = applyProgress(
      [
        { term: "a", term_lang: "ja", native_lang: "vi" },
        { term: "b", term_lang: "ja", native_lang: "vi" },
        { term: "c", term_lang: "ja", native_lang: "vi" },
        { term: "d", term_lang: "ja", native_lang: "vi" },
      ],
      [
        jaEntry({ term: "a", status: "LEARNED" }),
        jaEntry({ term: "b", card_state: "REVIEW", next_review: NOW - 1 }),
        jaEntry({ term: "c", card_state: "REVIEW", next_review: NOW + 1000 }),
      ],
      NOW,
    );
    expect(countProgress(cells)).toEqual({ total: 4, missing: 1, learning: 1, due: 1, learned: 1 });
  });
});

describe("percent", () => {
  it("làm tròn, và 0 khi whole = 0", () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(0, 0)).toBe(0);
  });
});
