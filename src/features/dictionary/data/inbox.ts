// "Hộp thư lượm nhặt" — một từ điển cá nhân cố định cho mỗi cặp ngôn ngữ, gom các
// từ "thêm nhanh" khi đang lướt web. Chỉ là I/O mỏng quanh customDict: tìm hộp
// theo nhãn, tạo nếu chưa có, rồi upsert một dòng nháp vào đó. Nhờ vậy từ vừa
// lượm hiện ngay ở nguồn "Trên máy" mà không cần schema riêng.

import { LangPair } from "@/shared/languages";
import { buildDictEntry, CustomDraft } from "../domain/customEntry";
import { QuickAddRecord } from "../domain/quickadd";
import { createLocalDictionary, listCustomDictionaries, upsertCustomEntries } from "./customDict";

/** Tên cố định của hộp thư — cũng là khoá nhận diện (mỗi cặp một hộp). */
export const INBOX_TITLE = "Từ nhặt được";

/**
 * Trả về id + tiêu đề hộp thư của một cặp ngôn ngữ, tạo mới nếu chưa có. Nhận
 * diện theo tiêu đề: hộp do chính luồng này tạo, người dùng đổi tên thì coi như
 * từ điển thường (một hộp mới sẽ được lập lại) — chấp nhận được cho luồng thêm nhanh.
 */
async function getOrCreateInbox(pair: LangPair): Promise<{ id: string; title: string }> {
  const existing = (await listCustomDictionaries(pair)).find((d) => d.title === INBOX_TITLE);
  if (existing) return { id: existing.id, title: existing.title };
  const id = await createLocalDictionary({
    title: INBOX_TITLE,
    term_lang: pair.source,
    native_lang: pair.target,
    description: "Từ lượm được khi lướt web (thêm nhanh).",
  });
  return { id, title: INBOX_TITLE };
}

/** Lưu một dòng nháp vào hộp thư lượm nhặt của cặp ngôn ngữ. Trả về tiêu đề hộp. */
export async function addToInbox(pair: LangPair, draft: CustomDraft): Promise<string> {
  const { id, title } = await getOrCreateInbox(pair);
  await upsertCustomEntries(id, title, pair, [draft]);
  return title;
}

/**
 * Lưu trọn gói một từ thêm nhanh vào CẢ hai kho: hàng ôn SRS (onRecordSrs —
 * thường là store.recordLookup) và hộp thư lượm nhặt. Dùng chung cho form
 * Thêm nhanh lẫn đường lưu ngầm ?add_save=1 của extension. Trả về mặt chữ đã lưu.
 */
export async function saveQuickAdd(
  pair: LangPair,
  draft: CustomDraft,
  onRecordSrs: (input: QuickAddRecord) => Promise<unknown>,
): Promise<string> {
  const entry = buildDictEntry(draft, pair, INBOX_TITLE);
  await onRecordSrs({
    term: entry.term,
    term_lang: entry.term_lang,
    native_lang: entry.native_lang,
    meaning: JSON.stringify(entry.definitions),
    reading: entry.reading || undefined,
    pos: draft.pos.trim() || undefined,
    is_custom: true,
  });
  await addToInbox(pair, draft);
  return entry.term;
}
