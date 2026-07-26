// "Thêm nhanh" — logic thuần cho luồng lượm từ khi đang lướt web. Một từ bắt được
// (overlay của extension, bookmarklet trên máy tính, Share Target trên điện thoại)
// tới app qua query param; ở đây đoán cặp ngôn ngữ mặc định từ chữ viết và đọc
// yêu cầu từ param. Dựng entry và khử trùng vẫn dùng chung domain/customEntry —
// không nhân bản.

import { LANG_PAIRS, LangPair, pairById, pairId } from "@/shared/languages";
import { CustomDraft, emptyDraft } from "./customEntry";

// Có mặt hiragana, katakana hoặc kanji ⇒ coi là tiếng Nhật. Không cần bao phủ
// mọi khối Unicode CJK hiếm — chỉ cần tách "có chữ Nhật" khỏi "toàn chữ Latin"
// để chọn cặp mặc định; người dùng đổi lại được trong form.
const JAPANESE = /[぀-ゟ゠-ヿ㐀-鿿豈-﫿]/;

/**
 * Đoán cặp ngôn ngữ cho một từ lượm được: có chữ Nhật → Nhật→Việt, còn lại
 * (chữ Latin) → Anh→Việt. Đích luôn là tiếng Việt vì đây là sổ tay của người
 * học người Việt; muốn khác thì đổi trong form.
 */
export function guessPairForText(text: string): LangPair {
  const source = JAPANESE.test(text) ? "ja" : "en";
  return pairById(pairId(source, "vi"));
}

/** Các trường tối thiểu để ghi một từ vào hàng ôn SRS (khớp recordLookup của store). */
export interface QuickAddRecord {
  term: string;
  term_lang: string;
  native_lang: string;
  meaning: string;
  reading?: string;
  pos?: string;
  is_custom?: boolean;
}

/** Toàn bộ query param của luồng ?add= — App xoá sạch khỏi URL sau khi đọc. */
export const ADD_PARAM_KEYS = ["add", "add_title", "add_reading", "add_meaning", "add_pair", "add_save"] as const;

export interface AddRequest {
  draft: CustomDraft;
  pair: LangPair;
  /** Người dùng đã soạn/duyệt ngay trên overlay của extension → app lưu ngầm, không mở form. */
  autosave: boolean;
}

/**
 * Đọc yêu cầu thêm nhanh từ query param. `add` (hoặc `add_title` của Share
 * Target) là mặt chữ — vắng cả hai nghĩa là không có yêu cầu (null). Overlay
 * của extension gửi kèm nghĩa/cách đọc/cặp và `add_save=1` để lưu ngầm; cặp
 * không hợp lệ thì đoán lại theo chữ viết như form.
 */
export function parseAddParams(params: URLSearchParams): AddRequest | null {
  const term = params.get("add") ?? params.get("add_title");
  if (term == null) return null;
  const draft: CustomDraft = {
    ...emptyDraft(),
    term: term.trim(),
    reading: (params.get("add_reading") ?? "").trim(),
    gloss: (params.get("add_meaning") ?? "").trim(),
  };
  const pairParam = params.get("add_pair");
  const pair = LANG_PAIRS.find((p) => p.id === pairParam) ?? guessPairForText(draft.term);
  return { draft, pair, autosave: params.get("add_save") === "1" };
}
