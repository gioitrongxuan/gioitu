import { describe, expect, it } from "vitest";
import {
  MAX_COMMENT_LENGTH,
  canDeleteComment,
  mergeComments,
  olderCursor,
  remainingComments,
  sortComments,
  validateComment,
  wordKey,
  type Comment,
} from "@/features/wordcomments/domain/comment";

function mk(id: string, user_id: string, created_at: number): Comment {
  return {
    id,
    term_lang: "ja",
    native_lang: "vi",
    term: "水",
    reading: "みず",
    user_id,
    author_name: "ai",
    body: "…",
    created_at,
  };
}

describe("validateComment", () => {
  it("từ chối chuỗi rỗng hoặc chỉ khoảng trắng", () => {
    expect(validateComment("")).toEqual({ ok: false, error: "Bình luận trống" });
    expect(validateComment("   \n\t ")).toEqual({ ok: false, error: "Bình luận trống" });
  });

  it("trim nội dung hợp lệ", () => {
    expect(validateComment("  góp ý  ")).toEqual({ ok: true, body: "góp ý" });
  });

  it("từ chối khi vượt giới hạn độ dài", () => {
    const long = "a".repeat(MAX_COMMENT_LENGTH + 1);
    const r = validateComment(long);
    expect(r.ok).toBe(false);
  });

  it("chấp nhận đúng giới hạn độ dài", () => {
    const exact = "a".repeat(MAX_COMMENT_LENGTH);
    expect(validateComment(exact)).toEqual({ ok: true, body: exact });
  });
});

describe("canDeleteComment", () => {
  const comment = { user_id: "u1" };

  it("guest (chưa đăng nhập) không xoá được", () => {
    expect(canDeleteComment(comment, null, false)).toBe(false);
  });

  it("tác giả xoá được bình luận của mình", () => {
    expect(canDeleteComment(comment, "u1", false)).toBe(true);
  });

  it("người khác không xoá được", () => {
    expect(canDeleteComment(comment, "u2", false)).toBe(false);
  });

  it("admin xoá được bình luận của bất kỳ ai", () => {
    expect(canDeleteComment(comment, "u2", true)).toBe(true);
  });
});

describe("sortComments", () => {
  it("sắp cũ → mới, không đột biến mảng gốc", () => {
    const input = [mk("b", "u", 30), mk("a", "u", 10), mk("c", "u", 20)];
    const sorted = sortComments(input);
    expect(sorted.map((c) => c.id)).toEqual(["a", "c", "b"]);
    expect(input.map((c) => c.id)).toEqual(["b", "a", "c"]);
  });
});

describe("olderCursor", () => {
  it("trả null khi chưa tải bình luận nào", () => {
    expect(olderCursor([])).toBeNull();
  });

  it("lấy bình luận cũ nhất bất kể thứ tự mảng", () => {
    expect(olderCursor([mk("b", "u", 30), mk("a", "u", 10), mk("c", "u", 20)])).toEqual({
      created_at: 10,
      id: "a",
    });
  });

  it("trùng mốc thời gian thì lấy id nhỏ hơn — khớp thứ tự con trỏ của server", () => {
    expect(olderCursor([mk("b", "u", 10), mk("a", "u", 10)])).toEqual({ created_at: 10, id: "a" });
  });
});

describe("mergeComments", () => {
  it("gộp trang cũ hơn vào đầu danh sách, giữ thứ tự cũ → mới", () => {
    const loaded = [mk("c", "u", 30), mk("d", "u", 40)];
    const older = [mk("b", "u", 20), mk("a", "u", 10)];
    expect(mergeComments(loaded, older).map((c) => c.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("khử trùng theo id (trang chồng lấn) và ưu tiên bản mới tải", () => {
    const loaded = [mk("a", "u", 10)];
    const incoming = [{ ...mk("a", "u", 10), body: "đã sửa" }, mk("b", "u", 20)];
    const merged = mergeComments(loaded, incoming);
    expect(merged.map((c) => c.id)).toEqual(["a", "b"]);
    expect(merged[0].body).toBe("đã sửa");
  });

  it("không đột biến mảng đang hiện", () => {
    const loaded = [mk("b", "u", 20)];
    mergeComments(loaded, [mk("a", "u", 10)]);
    expect(loaded.map((c) => c.id)).toEqual(["b"]);
  });
});

describe("remainingComments", () => {
  it("đếm phần cũ hơn chưa tải", () => {
    expect(remainingComments(25, 10)).toBe(15);
  });

  it("không âm khi số đã tải vượt tổng (vừa gửi thêm bình luận)", () => {
    expect(remainingComments(3, 4)).toBe(0);
  });
});

describe("wordKey", () => {
  it("reading rỗng/khoảng trắng chuẩn hoá về null", () => {
    expect(wordKey("ja", "vi", "水", "")).toEqual({
      term_lang: "ja",
      native_lang: "vi",
      term: "水",
      reading: null,
    });
    expect(wordKey("ja", "vi", "水", "  ")).toEqual({
      term_lang: "ja",
      native_lang: "vi",
      term: "水",
      reading: null,
    });
  });

  it("giữ reading khi có", () => {
    expect(wordKey("ja", "vi", "水", "みず").reading).toBe("みず");
  });
});
