import { describe, expect, it } from "vitest";
import {
  addLabel,
  buildLabelPrompt,
  entryLabels,
  filterByLabel,
  hasLabel,
  labelCounts,
  normalizeLabel,
  parseLabelResponse,
  removeLabel,
  MAX_LABELS_PER_ENTRY,
  MAX_LABEL_LENGTH,
} from "@/features/review/domain/labels";
import { buildCloud } from "@/features/review/domain/wordcloud";
import { makeEntry } from "./fixtures";

describe("normalizeLabel", () => {
  it("cắt khoảng trắng thừa và gộp khoảng trắng giữa chừng", () => {
    expect(normalizeLabel("  ngữ   pháp  ")).toBe("ngữ pháp");
  });

  it("bỏ dấu # mở đầu (thói quen gõ hashtag)", () => {
    expect(normalizeLabel("##N3")).toBe("N3");
  });

  it("cắt theo độ dài tối đa", () => {
    expect(normalizeLabel("a".repeat(MAX_LABEL_LENGTH + 10))).toHaveLength(MAX_LABEL_LENGTH);
  });

  it("chuỗi rỗng / chỉ dấu # → rỗng", () => {
    expect(normalizeLabel("   ")).toBe("");
    expect(normalizeLabel("#")).toBe("");
  });
});

describe("entryLabels", () => {
  it("entry chưa từng gắn nhãn → mảng rỗng", () => {
    expect(entryLabels(makeEntry())).toEqual([]);
  });

  it("khử trùng không phân biệt hoa thường, giữ cách viết gặp đầu tiên", () => {
    expect(entryLabels({ labels: ["Ngữ pháp", "ngữ pháp", "N3"] })).toEqual(["Ngữ pháp", "N3"]);
  });

  it("bỏ phần tử không phải chuỗi và nhãn rỗng (dữ liệu lạ từ cloud)", () => {
    expect(entryLabels({ labels: ["N3", "", 42, null] as unknown as string[] })).toEqual(["N3"]);
  });

  it("cắt theo trần số nhãn mỗi thẻ", () => {
    const many = Array.from({ length: MAX_LABELS_PER_ENTRY + 3 }, (_, i) => `nhãn ${i}`);
    expect(entryLabels({ labels: many })).toHaveLength(MAX_LABELS_PER_ENTRY);
  });
});

describe("addLabel", () => {
  it("thêm nhãn mới đã chuẩn hoá", () => {
    expect(addLabel(["N3"], "  #ngữ pháp ")).toEqual(["N3", "ngữ pháp"]);
  });

  it("nhãn rỗng / trùng (không phân biệt hoa thường) → null, không ghi lại", () => {
    expect(addLabel(["N3"], "   ")).toBeNull();
    expect(addLabel(["N3"], "n3")).toBeNull();
  });

  it("đã chạm trần → null", () => {
    const full = Array.from({ length: MAX_LABELS_PER_ENTRY }, (_, i) => `nhãn ${i}`);
    expect(addLabel(full, "thêm nữa")).toBeNull();
  });
});

describe("removeLabel", () => {
  it("gỡ đúng nhãn, không phân biệt hoa thường", () => {
    expect(removeLabel(["Ngữ pháp", "N3"], "ngữ pháp")).toEqual(["N3"]);
  });

  it("nhãn không có → danh sách giữ nguyên", () => {
    expect(removeLabel(["N3"], "chỗ làm")).toEqual(["N3"]);
  });
});

describe("labelCounts", () => {
  it("đếm theo nhãn, nhiều thẻ nhất lên trước rồi tới alphabet", () => {
    const entries = [
      makeEntry({ term: "a", labels: ["N3", "ngữ pháp"] }),
      makeEntry({ term: "b", labels: ["n3"] }),
      makeEntry({ term: "c", labels: ["chỗ làm"] }),
    ];
    expect(labelCounts(entries)).toEqual([
      { label: "N3", count: 2 },
      { label: "chỗ làm", count: 1 },
      { label: "ngữ pháp", count: 1 },
    ]);
  });
});

describe("filterByLabel / hasLabel", () => {
  const entries = [
    makeEntry({ term: "a", labels: ["N3"] }),
    makeEntry({ term: "b", labels: ["chỗ làm"] }),
    makeEntry({ term: "c" }),
  ];

  it('"all" giữ nguyên mọi thẻ', () => {
    expect(filterByLabel(entries, "all")).toHaveLength(3);
  });

  it('"none" chỉ giữ thẻ chưa gắn nhãn', () => {
    expect(filterByLabel(entries, "none").map((e) => e.term)).toEqual(["c"]);
  });

  it("tên nhãn giữ đúng thẻ mang nhãn đó", () => {
    expect(filterByLabel(entries, "n3").map((e) => e.term)).toEqual(["a"]);
    expect(hasLabel(entries[0], "N3")).toBe(true);
    expect(hasLabel(entries[2], "N3")).toBe(false);
  });
});

describe("buildCloud với bộ lọc nhãn", () => {
  it("chỉ dựng thẻ mang nhãn đang chọn", () => {
    const entries = [
      makeEntry({ term: "a", labels: ["N3"] }),
      makeEntry({ term: "b", labels: ["chỗ làm"] }),
      makeEntry({ term: "c" }),
    ];
    expect(buildCloud(entries, { label: "N3" }).map((t) => t.entry.term)).toEqual(["a"]);
    expect(buildCloud(entries, { label: "none" }).map((t) => t.entry.term)).toEqual(["c"]);
    expect(buildCloud(entries, {})).toHaveLength(3);
  });
});

describe("buildLabelPrompt", () => {
  it("kèm từ, nghĩa, vốn nhãn sẵn có và nhãn đang mang", () => {
    const prompt = buildLabelPrompt({
      term: "会議",
      reading: "かいぎ",
      meaning: "cuộc họp",
      current: ["N3"],
      vocabulary: ["chỗ làm", "N3"],
    });
    expect(prompt).toContain("会議");
    expect(prompt).toContain("かいぎ");
    expect(prompt).toContain("cuộc họp");
    expect(prompt).toContain("- chỗ làm");
    expect(prompt).toContain("đừng lặp lại");
    expect(prompt).toContain('{ "labels": ["nhãn 1", "nhãn 2"] }');
  });

  it("thiếu nghĩa/cách đọc/vốn nhãn thì bỏ hẳn dòng đó", () => {
    const prompt = buildLabelPrompt({ term: "cat", current: [], vocabulary: [] });
    expect(prompt).not.toContain("Cách đọc");
    expect(prompt).not.toContain("Nghĩa:");
    expect(prompt).not.toContain("đừng lặp lại");
  });
});

describe("parseLabelResponse", () => {
  it("đọc object bọc { labels: [...] }", () => {
    expect(parseLabelResponse('{"labels":["ngữ pháp","N3"]}')).toEqual(["ngữ pháp", "N3"]);
  });

  it("gỡ hàng rào code và chấp nhận khoá tags", () => {
    expect(parseLabelResponse('```json\n{"tags":["chỗ làm"]}\n```')).toEqual(["chỗ làm"]);
  });

  it("chấp nhận mảng trần, bỏ phần tử không phải chuỗi", () => {
    expect(parseLabelResponse('["N3", 5, "  #ngữ pháp "]')).toEqual(["N3", "ngữ pháp"]);
  });

  it("JSON hỏng / rỗng → mảng rỗng, không ném", () => {
    expect(parseLabelResponse("xin lỗi, tôi không thể")).toEqual([]);
    expect(parseLabelResponse("")).toEqual([]);
  });
});
