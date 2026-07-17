import { describe, expect, it } from "vitest";
import {
  MAX_COMMENT_LENGTH,
  canDeleteComment,
  sortComments,
  validateComment,
  wordKey,
  type Comment,
} from "./comment";

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
