// Issue #267 — tiếng Việt dạng tổ hợp (NFD) làm dấu văng ra khỏi chữ khi hiển
// thị và làm so khớp/khoá trùng trật dù người dùng thấy hai chuỗi giống hệt.
// Test ở đây găm cả hai biên: biên hiển thị (glossary → text phẳng) và biên nhập
// liệu (nháp từ điển cá nhân → DictEntry).
//
// Các chuỗi NFD viết bằng escape `\uXXXX` có chủ đích: nếu gõ trực tiếp thì
// chính file test này bị chuẩn hoá về NFC lúc lưu và phép so sánh mất ý nghĩa.

import { describe, it, expect } from "vitest";
import { toNfc, toNfcOrEmpty } from "@/shared/text";
import { glossToText, glossaryToLines, sensesToLines } from "@/shared/structured-content";
import {
  buildDictEntry,
  dedupe,
  emptyDraft,
  termReadingKey,
  type CustomDraft,
} from "@/features/dictionary/domain/customEntry";
import { pairById } from "@/shared/languages";

const JA_VI = pairById("ja-vi");

/** "Sắp xếp": ắ = a + breve + acute, ế = e + circumflex + acute. */
const NFD_SORT = "Sa\u0306\u0301p xe\u0302\u0301p";
const NFC_SORT = "Sắp xếp";

/** "chào": à = a + grave. */
const NFD_HELLO = "cha\u0300o";
const NFC_HELLO = "chào";

function draft(over: Partial<CustomDraft> = {}): CustomDraft {
  return { ...emptyDraft(), ...over };
}

describe("toNfc", () => {
  it("dựng lại dấu rời thành ký tự dựng sẵn", () => {
    expect(NFD_SORT).not.toBe(NFC_SORT); // tiền đề: hai chuỗi khác nhau theo byte
    expect(toNfc(NFD_SORT)).toBe(NFC_SORT);
  });

  it("idempotent — chuỗi đã NFC không đổi", () => {
    expect(toNfc(NFC_SORT)).toBe(NFC_SORT);
    expect(toNfc(toNfc(NFD_SORT))).toBe(NFC_SORT);
  });

  it("không đụng kana/kanji", () => {
    expect(toNfc("猫がねこ")).toBe("猫がねこ");
  });

  it("toNfcOrEmpty khoan dung với undefined/null", () => {
    expect(toNfcOrEmpty(undefined)).toBe("");
    expect(toNfcOrEmpty(null)).toBe("");
    expect(toNfcOrEmpty(NFD_SORT)).toBe(NFC_SORT);
  });
});

describe("biên hiển thị: glossary NFD → text phẳng NFC", () => {
  it("glossToText chuẩn hoá chuỗi thuần", () => {
    expect(glossToText(NFD_SORT)).toBe(NFC_SORT);
  });

  it("glossToText chuẩn hoá structured content", () => {
    const node = {
      type: "structured-content" as const,
      content: [{ tag: "div", content: NFD_SORT }],
    };
    expect(glossToText(node)).toBe(NFC_SORT);
  });

  it("glossaryToLines chuẩn hoá từng dòng nghĩa", () => {
    expect(glossaryToLines([NFD_SORT, { type: "text", text: NFD_SORT }])).toEqual([
      NFC_SORT,
      NFC_SORT,
    ]);
  });

  it("sensesToLines chuẩn hoá qua sense (mặt sau thẻ SRS đọc lối này)", () => {
    expect(sensesToLines([{ tags: [], glossary: [NFD_SORT] }])).toEqual([NFC_SORT]);
  });
});

describe("biên nhập liệu: nháp NFD → DictEntry NFC", () => {
  it("buildDictEntry lưu từ, nghĩa, ví dụ và ghi chú ở dạng NFC", () => {
    const entry = buildDictEntry(
      draft({
        term: "整理",
        reading: "せいり",
        gloss: `${NFD_SORT}; dọn dẹp`,
        example: `部屋を整理する :: ${NFD_SORT} phòng`,
        note: NFD_SORT,
        related: NFD_SORT,
      }),
      JA_VI,
      "Sổ tay của tôi",
    );
    expect(entry.definitions).toEqual([NFC_SORT, "dọn dẹp"]);
    expect(entry.senses?.[0].examples?.[0].vi).toBe(`${NFC_SORT} phòng`);
    expect(entry.senses?.[0].info).toEqual([NFC_SORT, `Liên quan/dễ nhầm: ${NFC_SORT}`]);
  });

  it("buildDictEntry chuẩn hoá cả headword khi cặp ngôn ngữ là tiếng Việt", () => {
    const entry = buildDictEntry(draft({ term: NFD_HELLO, gloss: "hello" }), JA_VI, "Sổ tay");
    expect(entry.term).toBe(NFC_HELLO);
  });

  it("termReadingKey: dán NFD và gõ NFC cho cùng một khoá", () => {
    expect(termReadingKey(NFD_HELLO, "")).toBe(termReadingKey(NFC_HELLO, ""));
  });

  it("dedupe nhận ra trùng khi bản có sẵn lưu dạng NFC", () => {
    const existing = new Set([termReadingKey(NFC_HELLO, "")]);
    const { fresh, duplicates } = dedupe([draft({ term: NFD_HELLO, gloss: "xin chào" })], existing);
    expect(fresh).toHaveLength(0);
    expect(duplicates).toHaveLength(1);
  });
});
