import { describe, expect, it } from "vitest";
import { guessPairForText, parseAddParams } from "@/features/dictionary/domain/quickadd";

describe("guessPairForText", () => {
  it("từ có kanji → Nhật→Việt", () => {
    expect(guessPairForText("勉強").id).toBe("ja-vi");
  });

  it("từ có hiragana → Nhật→Việt", () => {
    expect(guessPairForText("たべる").id).toBe("ja-vi");
  });

  it("từ có katakana → Nhật→Việt", () => {
    expect(guessPairForText("コーヒー").id).toBe("ja-vi");
  });

  it("chữ Latin thuần → Anh→Việt", () => {
    expect(guessPairForText("serendipity").id).toBe("en-vi");
  });

  it("lẫn Latin + kanji vẫn coi là tiếng Nhật", () => {
    expect(guessPairForText("iPhoneの設定").id).toBe("ja-vi");
  });
});

describe("parseAddParams", () => {
  it("vắng cả add lẫn add_title → không có yêu cầu", () => {
    expect(parseAddParams(new URLSearchParams("q=abc"))).toBeNull();
  });

  it("chỉ có add → draft mang mặt chữ, đoán cặp theo chữ viết, không autosave", () => {
    const req = parseAddParams(new URLSearchParams("add=勉強"));
    expect(req?.draft.term).toBe("勉強");
    expect(req?.draft.gloss).toBe("");
    expect(req?.pair.id).toBe("ja-vi");
    expect(req?.autosave).toBe(false);
  });

  it("?add= rỗng vẫn là một yêu cầu (mở form trống như trước)", () => {
    const req = parseAddParams(new URLSearchParams("add="));
    expect(req).not.toBeNull();
    expect(req?.draft.term).toBe("");
  });

  it("add_title của Share Target thay được cho add", () => {
    expect(parseAddParams(new URLSearchParams("add_title=coffee"))?.draft.term).toBe("coffee");
  });

  it("đủ trường + add_save=1 → autosave với cặp chỉ định", () => {
    const req = parseAddParams(
      new URLSearchParams("add=勉強&add_reading=べんきょう&add_meaning=học tập&add_pair=ja-en&add_save=1"),
    );
    expect(req?.draft).toMatchObject({ term: "勉強", reading: "べんきょう", gloss: "học tập" });
    expect(req?.pair.id).toBe("ja-en");
    expect(req?.autosave).toBe(true);
  });

  it("add_pair không hợp lệ → đoán lại theo chữ viết", () => {
    expect(parseAddParams(new URLSearchParams("add=coffee&add_pair=xx-yy"))?.pair.id).toBe("en-vi");
  });

  it("add_save khác '1' → không autosave", () => {
    expect(parseAddParams(new URLSearchParams("add=coffee&add_save=0"))?.autosave).toBe(false);
  });

  it("mặc định không aiFill/solo, openerOrigin null", () => {
    const req = parseAddParams(new URLSearchParams("add=coffee"));
    expect(req).toMatchObject({ aiFill: false, solo: false, openerOrigin: null });
  });

  it("add_pos/add_example/add_note đổ vào draft (AI điền trên overlay gửi kèm lúc lưu)", () => {
    const req = parseAddParams(
      new URLSearchParams("add=勉強&add_pos=n vs&add_example=毎日勉強する :: Học mỗi ngày&add_note=ghi chú"),
    );
    expect(req?.draft).toMatchObject({ pos: "n vs", example: "毎日勉強する :: Học mỗi ngày", note: "ghi chú" });
  });

  it("add_ai=1 + add_origin → yêu cầu proxy AI kèm origin trang mở", () => {
    const req = parseAddParams(
      new URLSearchParams("add=勉強&add_ai=1&add_origin=" + encodeURIComponent("https://example.com")),
    );
    expect(req?.aiFill).toBe(true);
    expect(req?.openerOrigin).toBe("https://example.com");
  });

  it("add_solo=1 → chỉ vẽ form, không vỏ app", () => {
    expect(parseAddParams(new URLSearchParams("add=coffee&add_solo=1"))?.solo).toBe(true);
  });
});
