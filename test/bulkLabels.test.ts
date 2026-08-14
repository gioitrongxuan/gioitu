import { describe, expect, it } from "vitest";
import {
  batchItems,
  buildBulkLabelPrompt,
  buildTargetLabelPrompt,
  parseBulkLabelResponse,
  parseTargetLabelResponse,
  proposeBulkLabels,
  BULK_LABEL_BATCH_SIZE,
  MAX_BULK_LABELS_PER_ENTRY,
} from "@/features/review/domain/bulkLabels";
import { mergeLabels, MAX_LABELS_PER_ENTRY } from "@/features/review/domain/labels";
import { makeEntry } from "./fixtures";

describe("batchItems", () => {
  it("chia đúng cỡ lô, lô cuối ngắn hơn", () => {
    expect(batchItems([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("danh sách rỗng → không có lô nào", () => {
    expect(batchItems([], 2)).toEqual([]);
  });

  it("mặc định theo BULK_LABEL_BATCH_SIZE", () => {
    const items = Array.from({ length: BULK_LABEL_BATCH_SIZE + 1 }, (_, i) => i);
    expect(batchItems(items)).toHaveLength(2);
    expect(batchItems(items)[0]).toHaveLength(BULK_LABEL_BATCH_SIZE);
  });
});

describe("mergeLabels", () => {
  it("thêm nhiều nhãn một lượt, bỏ nhãn trùng (không phân biệt hoa thường)", () => {
    expect(mergeLabels(["N3"], ["ngữ pháp", "n3", "  "])).toEqual(["N3", "ngữ pháp"]);
  });

  it("dừng ở trần của thẻ", () => {
    const many = Array.from({ length: MAX_LABELS_PER_ENTRY + 2 }, (_, i) => `nhãn ${i}`);
    expect(mergeLabels([], many)).toHaveLength(MAX_LABELS_PER_ENTRY);
  });
});

describe("buildBulkLabelPrompt", () => {
  const prompt = buildBulkLabelPrompt(
    [
      { term: "会議", reading: "かいぎ", meaning: "cuộc họp", current: ["N3"] },
      { term: "本", current: [] },
    ],
    ["chỗ làm"],
  );

  it("liệt kê đủ mọi từ kèm cách đọc, nghĩa và nhãn đang có", () => {
    expect(prompt).toContain("会議 [かいぎ] — cuộc họp (đã có: N3)");
    expect(prompt).toContain("- 本");
    expect(prompt).toContain("Danh sách 2 từ:");
  });

  it("nhắc tái dùng vốn nhãn và đòi JSON có mặt chữ để khớp lại thẻ", () => {
    expect(prompt).toContain("- chỗ làm");
    expect(prompt).toContain("giữ nguyên mặt chữ");
    expect(prompt).toContain('{ "results": [{ "term": "từ", "labels": ["nhãn 1", "nhãn 2"] }] }');
  });

  it("không có vốn nhãn thì bỏ hẳn đoạn đó", () => {
    expect(buildBulkLabelPrompt([{ term: "本", current: [] }], [])).not.toContain("Ưu tiên dùng lại");
  });
});

describe("parseBulkLabelResponse", () => {
  it("đọc object bọc { results: [...] }", () => {
    expect(
      parseBulkLabelResponse('{"results":[{"term":"会議","labels":["chỗ làm","N3"]}]}'),
    ).toEqual([{ term: "会議", labels: ["chỗ làm", "N3"] }]);
  });

  it("gỡ hàng rào code, chấp nhận mảng trần và khoá tags", () => {
    expect(parseBulkLabelResponse('```json\n[{"word":"本","tags":["đồ vật"]}]\n```')).toEqual([
      { term: "本", labels: ["đồ vật"] },
    ]);
  });

  it("cắt theo trần nhãn mỗi từ của lượt hàng loạt", () => {
    const many = Array.from({ length: MAX_BULK_LABELS_PER_ENTRY + 2 }, (_, i) => `nhãn ${i}`);
    const [row] = parseBulkLabelResponse(JSON.stringify([{ term: "本", labels: many }]));
    expect(row.labels).toHaveLength(MAX_BULK_LABELS_PER_ENTRY);
  });

  it("bỏ phần tử thiếu mặt chữ hoặc không còn nhãn dùng được, giữ phần còn lại", () => {
    expect(
      parseBulkLabelResponse(
        '[{"labels":["mồ côi"]},{"term":"本","labels":[7," "]},{"term":"会議","labels":["chỗ làm"]}]',
      ),
    ).toEqual([{ term: "会議", labels: ["chỗ làm"] }]);
  });

  it("một từ trả hai lần (lệch hoa/thường, thừa khoảng trắng) → lấy lượt đầu", () => {
    expect(
      parseBulkLabelResponse('[{"term":"book","labels":["đồ vật"]},{"term":" BOOK ","labels":["khác"]}]'),
    ).toEqual([{ term: "book", labels: ["đồ vật"] }]);
  });

  it("JSON hỏng / rỗng → mảng rỗng, không ném", () => {
    expect(parseBulkLabelResponse("xin lỗi, tôi không thể")).toEqual([]);
    expect(parseBulkLabelResponse("")).toEqual([]);
  });
});

describe("buildTargetLabelPrompt", () => {
  const prompt = buildTargetLabelPrompt(
    [
      { term: "会議", reading: "かいぎ", meaning: "cuộc họp", current: ["N3"] },
      { term: "S3", meaning: "kho lưu trữ đối tượng", current: [] },
    ],
    "Thuật ngữ AWS",
  );

  it("nói rõ nhãn cần sàng và liệt kê đủ mọi từ", () => {
    expect(prompt).toContain('Nhãn cần sàng: "Thuật ngữ AWS"');
    expect(prompt).toContain("Trong 2 từ dưới đây");
    expect(prompt).toContain("会議 [かいぎ] — cuộc họp (đã có: N3)");
    expect(prompt).toContain("- S3 — kho lưu trữ đối tượng");
  });

  it("cho phép trả rỗng và đòi JSON chỉ gồm từ được chọn", () => {
    expect(prompt).toContain("trả về danh sách RỖNG");
    expect(prompt).toContain("giữ nguyên mặt chữ");
    expect(prompt).toContain('{ "results": ["từ 1", "từ 2"] }');
  });
});

describe("parseTargetLabelResponse", () => {
  it("mảng chuỗi trần → mỗi từ nhận đúng nhãn người dùng gõ", () => {
    expect(parseTargetLabelResponse('{"results":["S3","EC2"]}', "Thuật ngữ AWS")).toEqual([
      { term: "S3", labels: ["Thuật ngữ AWS"] },
      { term: "EC2", labels: ["Thuật ngữ AWS"] },
    ]);
  });

  it("gỡ hàng rào code, chấp nhận mảng object có mặt chữ", () => {
    expect(parseTargetLabelResponse('```json\n[{"term":"S3"}]\n```', "AWS")).toEqual([
      { term: "S3", labels: ["AWS"] },
    ]);
  });

  it("nhãn gán là nhãn đã chuẩn hoá của người dùng, không phải chữ model trả về", () => {
    expect(parseTargetLabelResponse('["S3"]', " #Thuật ngữ AWS ")).toEqual([
      { term: "S3", labels: ["Thuật ngữ AWS"] },
    ]);
  });

  it("model trả cả danh sách kèm cờ thì bỏ những từ bị phủ định", () => {
    expect(
      parseTargetLabelResponse(
        '{"results":[{"term":"S3","match":true},{"term":"会議","match":false},{"term":"EC2","thuoc":"không"}]}',
        "AWS",
      ),
    ).toEqual([{ term: "S3", labels: ["AWS"] }]);
  });

  it("một từ trả hai lần (lệch hoa/thường) → lấy lượt đầu; phần tử rác thì bỏ", () => {
    expect(parseTargetLabelResponse('["S3"," s3 ",7,"  ",{"labels":["mồ côi"]}]', "AWS")).toEqual([
      { term: "S3", labels: ["AWS"] },
    ]);
  });

  it("nhãn rỗng sau chuẩn hoá → không có gì để gán", () => {
    expect(parseTargetLabelResponse('["S3"]', "   ")).toEqual([]);
    expect(parseTargetLabelResponse('["S3"]', "#")).toEqual([]);
  });

  it("JSON hỏng / rỗng → mảng rỗng, không ném", () => {
    expect(parseTargetLabelResponse("xin lỗi, tôi không thể", "AWS")).toEqual([]);
    expect(parseTargetLabelResponse("", "AWS")).toEqual([]);
  });

  it("cắm được thẳng vào proposeBulkLabels: chỉ thẻ đang lọc và chưa có nhãn ấy mới đổi", () => {
    const entries = [
      makeEntry({ term: "S3" }),
      makeEntry({ term: "EC2", labels: ["AWS"] }),
      makeEntry({ term: "会議" }),
    ];
    const suggestions = parseTargetLabelResponse('["S3","EC2","Lambda"]', "AWS");
    expect(proposeBulkLabels(entries, suggestions)).toEqual([
      { entry: entries[0], current: [], added: ["AWS"] },
    ]);
  });
});

describe("proposeBulkLabels", () => {
  it("chỉ trả phần nhãn SẼ thêm, khớp thẻ không phân biệt hoa thường", () => {
    const entries = [
      makeEntry({ term: "book", labels: ["N3"] }),
      makeEntry({ term: "cat" }),
    ];
    const proposals = proposeBulkLabels(entries, [
      { term: "BOOK", labels: ["đồ vật", "n3"] },
      { term: "cat", labels: ["động vật"] },
    ]);
    expect(proposals).toEqual([
      { entry: entries[0], current: ["N3"], added: ["đồ vật"] },
      { entry: entries[1], current: [], added: ["động vật"] },
    ]);
  });

  it("thẻ không có gì để thêm (nhãn đã có sẵn) thì không xuất hiện", () => {
    const entries = [makeEntry({ term: "book", labels: ["đồ vật"] })];
    expect(proposeBulkLabels(entries, [{ term: "book", labels: ["Đồ vật"] }])).toEqual([]);
  });

  it("thẻ đã chạm trần nhãn thì không đề xuất thêm", () => {
    const full = Array.from({ length: MAX_LABELS_PER_ENTRY }, (_, i) => `nhãn ${i}`);
    const entries = [makeEntry({ term: "book", labels: full })];
    expect(proposeBulkLabels(entries, [{ term: "book", labels: ["đồ vật"] }])).toEqual([]);
  });

  it("bỏ qua thẻ AI không nhắc tới", () => {
    const entries = [makeEntry({ term: "book" }), makeEntry({ term: "cat" })];
    expect(proposeBulkLabels(entries, [{ term: "cat", labels: ["động vật"] }])).toHaveLength(1);
  });

  it("AI trả từ không có trong tập đang lọc → không sinh thẻ ma", () => {
    const entries = [makeEntry({ term: "book" })];
    expect(proposeBulkLabels(entries, [{ term: "xyz", labels: ["lạ"] }])).toEqual([]);
  });
});
