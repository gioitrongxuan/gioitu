// Chuyển đổi thuần giữa hợp đồng SỬA (EditableTerm/EditableSense — thứ người dùng
// gõ) và mô hình lưu (Sense/Heading kế thừa jisho). Không chạm DB → test được
// không cần Postgres. dictStore chỉ lo phần SQL, gọi các hàm này để nắn dữ liệu.

import type {
  EditableSense,
  Gloss,
  Heading,
  ImportedSensePreview,
  JlptLevel,
  Sense,
} from "@/shared/dictionary";

const glossText = (g: Gloss): string => (typeof g === "string" ? g : g.text);

/** Bỏ dòng trống, thu về mảng đã trim; rỗng → undefined để không lưu mảng rỗng. */
function cleanLines(lines: string[] | undefined): string[] | undefined {
  const out = (lines ?? []).map((s) => s.trim()).filter(Boolean);
  return out.length ? out : undefined;
}

/** EditableSense[] → Sense[] để lưu; loại nghĩa không có dòng gloss nào. */
export function editableToSenses(senses: EditableSense[]): Sense[] {
  const out: Sense[] = [];
  for (const s of senses) {
    const gloss = cleanLines(s.gloss);
    if (!gloss) continue; // nghĩa rỗng thì bỏ
    // Mã POS/misc do người dùng gõ (string) — ép về union tag của jisho.
    const sense: Sense = { pos: (s.pos ?? []) as Sense["pos"], gloss };
    const misc = (s.misc ?? []).filter(Boolean);
    if (misc.length) sense.misc = misc as Sense["misc"];
    const info = cleanLines(s.info);
    if (info) sense.info = info;
    const examples = (s.examples ?? [])
      .map((e) => ({ ja: e.ja.trim(), vi: e.vi.trim() }))
      .filter((e) => e.ja || e.vi);
    if (examples.length) sense.examples = examples;
    out.push(sense);
  }
  return out;
}

/** Sense[] (đã lưu) → EditableSense[] để mở form sửa. */
export function sensesToEditable(senses: Sense[]): EditableSense[] {
  return senses.map((s) => ({
    pos: s.pos ?? [],
    misc: s.misc ?? [],
    gloss: (s.gloss ?? []).map(glossText),
    info: s.info,
    examples: s.examples?.map((e) => ({ ja: e.ja, vi: e.vi })),
  }));
}

/** Nghĩa từ các từ điển đã nhập → bản xem read-only (gộp theo tên từ điển). */
export function importedPreview(senses: Sense[]): ImportedSensePreview[] {
  return senses.map((s) => ({
    dictionary: s.dictionary,
    gloss: (s.gloss ?? []).map(glossText),
  }));
}

/**
 * Vá cách viết chính của một từ với thuộc tính vừa sửa (reading/Hán-Việt/JLPT).
 * Ưu tiên heading có base trùng `term`; không có thì vá heading đầu; từ mới thì
 * tạo heading. Trường bỏ trống được XOÁ khỏi heading (không giữ giá trị cũ).
 */
export function patchPrimaryHeading(
  headings: Heading[],
  patch: { term: string; reading?: string; hanViet?: string; jlpt?: JlptLevel },
): Heading[] {
  const list = headings.length ? headings.map((h) => ({ ...h })) : [{ base: patch.term }];
  let idx = list.findIndex((h) => h.base === patch.term);
  if (idx < 0) idx = 0;

  const h = list[idx];
  h.base = patch.term;
  if (patch.reading) h.reading = patch.reading;
  else delete h.reading;
  if (patch.hanViet) h.hanViet = patch.hanViet;
  else delete h.hanViet;
  if (patch.jlpt) h.jlpt = patch.jlpt;
  else delete h.jlpt;
  return list;
}
