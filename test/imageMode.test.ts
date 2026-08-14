import { describe, expect, it } from "vitest";
import {
  buildImagePlaylist,
  cardSteps,
  GIVE_UP_AFTER_MISSES,
  imageableEntries,
  MAX_IMAGES_PER_CARD,
  pickImages,
  shouldGiveUp,
  wordImageKey,
} from "@/features/review/domain/imageMode";
import { parseImageModeSettings } from "@/features/review/domain/imageModeSettings";
import type { DictEntry } from "@/shared/db";
import { makeEntry } from "./fixtures";

describe("wordImageKey", () => {
  const base = { term: "辛い", term_lang: "ja", native_lang: "vi" };

  it("đồng âm khác cách đọc là hai khoá khác nhau — không dùng chung ảnh", () => {
    expect(wordImageKey({ ...base, reading: "からい" })).not.toBe(
      wordImageKey({ ...base, reading: "つらい" }),
    );
  });

  it("vắng reading vẫn ra khoá ổn định", () => {
    expect(wordImageKey(base)).toBe(wordImageKey({ ...base, reading: undefined }));
  });

  it("cùng mặt chữ nhưng khác cặp ngôn ngữ là hai khoá khác nhau", () => {
    expect(wordImageKey({ term: "cat", term_lang: "en", native_lang: "vi" })).not.toBe(
      wordImageKey({ term: "cat", term_lang: "en", native_lang: "ja" }),
    );
  });
});

describe("cardSteps", () => {
  it("mặc định: ảnh trần để tự nhớ, rồi hiện đáp án — hai bước cùng độ dài", () => {
    expect(cardSteps({ holdMs: 5000, revealAtOnce: false })).toEqual([
      { kind: "recall", ms: 5000 },
      { kind: "reveal", ms: 5000 },
    ]);
  });

  it("hiện đáp án ngay → thẻ rút còn đúng một bước", () => {
    expect(cardSteps({ holdMs: 3000, revealAtOnce: true })).toEqual([
      { kind: "reveal", ms: 3000 },
    ]);
  });
});

describe("buildImagePlaylist", () => {
  // rng luôn trả 0: Fisher–Yates đảo [A,B,C] thành [B,C,A] — tất định để test.
  const zeroRng = () => 0;

  const ja = (term: string, over = {}) => makeEntry({ term, term_lang: "ja", ...over });

  it("chỉ lấy từ đang học, bỏ từ đã thuộc và từ đã xoá", () => {
    const entries = [
      ja("A"),
      ja("B", { status: "LEARNED" }),
      ja("C", { deleted_at: 1 }),
      ja("D", { status: "RELAPSED" }),
    ];
    const terms = buildImagePlaylist(entries, "all", zeroRng).map((e) => e.term);
    expect(terms.sort()).toEqual(["A", "D"]);
  });

  it("lọc theo ngôn ngữ đang chọn", () => {
    const entries = [ja("日"), makeEntry({ term: "cat", term_lang: "en" })];
    expect(buildImagePlaylist(entries, "ja", zeroRng).map((e) => e.term)).toEqual(["日"]);
    expect(buildImagePlaylist(entries, "en", zeroRng).map((e) => e.term)).toEqual(["cat"]);
  });

  it("KHÔNG loại từ trống nghĩa — ảnh mới là nội dung chính ở chế độ này", () => {
    const entries = [ja("A"), ja("B", { meaning: "" })];
    expect(buildImagePlaylist(entries, "all", zeroRng).map((e) => e.term).sort()).toEqual([
      "A",
      "B",
    ]);
  });

  it("xáo trộn theo rng được truyền vào", () => {
    const entries = [ja("A"), ja("B"), ja("C")];
    expect(buildImagePlaylist(entries, "all", zeroRng).map((e) => e.term)).toEqual([
      "B",
      "C",
      "A",
    ]);
  });

  it("imageableEntries giữ nguyên thứ tự gốc — nút Hình ảnh chỉ cần đếm", () => {
    const entries = [ja("A"), ja("B", { status: "LEARNED" }), ja("C")];
    expect(imageableEntries(entries, "all").map((e) => e.term)).toEqual(["A", "C"]);
  });
});

describe("pickImages", () => {
  const hit = (over: Partial<DictEntry>): DictEntry => ({
    term: "桜",
    definitions: [],
    term_lang: "ja",
    native_lang: "vi",
    ...over,
  });

  const img = (url: string) => ({ url });

  it("khớp cả mặt chữ lẫn cách đọc thắng khớp một nửa", () => {
    const hits = [
      hit({ term: "櫻", reading: "さくら", images: [img("a")] }),
      hit({ term: "桜", reading: "さくら", images: [img("b")] }),
    ];
    expect(pickImages(hits, { term: "桜", term_lang: "ja", native_lang: "vi", reading: "さくら" })).toEqual([
      img("b"),
    ]);
  });

  it("khớp mặt chữ thắng khớp âm đọc khi không có ứng viên khớp cả hai", () => {
    const hits = [
      hit({ term: "櫻", reading: "さくら", images: [img("a")] }),
      hit({ term: "桜", reading: "おう", images: [img("b")] }),
    ];
    expect(pickImages(hits, { term: "桜", term_lang: "ja", native_lang: "vi", reading: "さくら" })).toEqual([
      img("b"),
    ]);
  });

  it("bỏ qua ứng viên khớp nhất nhưng không có ảnh, lấy ứng viên khớp kế tiếp", () => {
    const hits = [
      hit({ term: "桜", reading: "さくら" }),
      hit({ term: "櫻", reading: "さくら", images: [img("a")] }),
    ];
    expect(pickImages(hits, { term: "桜", term_lang: "ja", native_lang: "vi", reading: "さくら" })).toEqual([
      img("a"),
    ]);
  });

  it("không ứng viên nào khớp → rỗng, thà bỏ thẻ còn hơn minh hoạ sai từ", () => {
    const hits = [hit({ term: "梅", reading: "うめ", images: [img("a")] })];
    expect(pickImages(hits, { term: "桜", term_lang: "ja", native_lang: "vi", reading: "さくら" })).toEqual(
      [],
    );
  });

  it("từ không có cách đọc vẫn khớp được theo mặt chữ", () => {
    const hits = [hit({ term: "cat", term_lang: "en", images: [img("a")] })];
    expect(pickImages(hits, { term: "cat", term_lang: "en", native_lang: "vi" })).toEqual([img("a")]);
  });

  it("cắt còn tối đa MAX_IMAGES_PER_CARD ảnh dự phòng", () => {
    const many = Array.from({ length: MAX_IMAGES_PER_CARD + 3 }, (_, i) => img(`u${i}`));
    const hits = [hit({ term: "桜", images: many })];
    expect(pickImages(hits, { term: "桜", term_lang: "ja", native_lang: "vi" })).toHaveLength(
      MAX_IMAGES_PER_CARD,
    );
  });

  it("không có kết quả nào → rỗng", () => {
    expect(pickImages([], { term: "桜", term_lang: "ja", native_lang: "vi" })).toEqual([]);
  });
});

describe("shouldGiveUp", () => {
  it("danh sách ngắn: dò hết một vòng là đủ để kết luận", () => {
    expect(shouldGiveUp(2, 3)).toBe(false);
    expect(shouldGiveUp(3, 3)).toBe(true);
  });

  it("danh sách dài: dừng ở ngưỡng thay vì gọi mạng hàng trăm lần", () => {
    expect(shouldGiveUp(GIVE_UP_AFTER_MISSES - 1, 500)).toBe(false);
    expect(shouldGiveUp(GIVE_UP_AFTER_MISSES, 500)).toBe(true);
  });

  it("danh sách rỗng không phải là 'đã dò xong' — màn rỗng lo trường hợp đó", () => {
    expect(shouldGiveUp(0, 0)).toBe(false);
  });
});

describe("parseImageModeSettings", () => {
  const DEFAULTS = { holdMs: 5000, revealAtOnce: false };

  it("chưa từng lưu → mặc định", () => {
    expect(parseImageModeSettings(null)).toEqual(DEFAULTS);
  });

  it("giá trị đã lưu hợp lệ → giữ nguyên", () => {
    expect(parseImageModeSettings(JSON.stringify({ holdMs: 8000, revealAtOnce: true }))).toEqual({
      holdMs: 8000,
      revealAtOnce: true,
    });
  });

  it("thời gian lạ → về mặc định, vẫn giữ lựa chọn đáp án hợp lệ", () => {
    expect(parseImageModeSettings(JSON.stringify({ holdMs: 999, revealAtOnce: true }))).toEqual({
      holdMs: 5000,
      revealAtOnce: true,
    });
  });

  it("revealAtOnce không phải boolean → về mặc định", () => {
    expect(parseImageModeSettings(JSON.stringify({ holdMs: 3000, revealAtOnce: "yes" }))).toEqual({
      holdMs: 3000,
      revealAtOnce: false,
    });
  });

  it("payload hỏng → mặc định", () => {
    expect(parseImageModeSettings("{")).toEqual(DEFAULTS);
    expect(parseImageModeSettings("[]")).toEqual(DEFAULTS);
  });
});
