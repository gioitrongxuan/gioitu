// Chip tag của một mục từ: mã gọn trên chip, tên đầy đủ khi hover; màu theo
// category Yomitan (data-category → CSS). Kèm hàng huy hiệu cạnh headword.

import { ResolvedTag } from "@/shared/structured-content";

/** A part-of-speech / term tag chip: compact code label, full name on hover. */
export function TagChip({ code, meta, kind = "pos" }: { code: string; meta?: ResolvedTag; kind?: "pos" | "term" }) {
  const category = meta?.category ?? (kind === "term" ? "default" : "partOfSpeech");
  const title = meta?.name ?? code;
  return (
    <span className={kind === "term" ? "term-tag" : "pos-tag"} data-category={category} title={title}>
      {code}
    </span>
  );
}

/** Huy hiệu cạnh headword: cấp JLPT + chữ Hán-Việt (riêng cho người Việt). */
export function HeadwordBadges({ hanViet, jlpt }: { hanViet?: string; jlpt?: number }) {
  if (!hanViet && !jlpt) return null;
  return (
    <div className="headword-badges">
      {jlpt ? <span className="jlpt-badge" title={`Trình độ JLPT N${jlpt}`}>N{jlpt}</span> : null}
      {hanViet ? <span className="hanviet" title="Âm Hán-Việt">{hanViet}</span> : null}
    </div>
  );
}
