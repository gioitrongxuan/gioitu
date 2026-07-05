// Chip tag của một mục từ: mã gọn trên chip, tên đầy đủ khi hover; màu theo
// category Yomitan (data-category → CSS). Kèm hàng huy hiệu cạnh headword và
// hàng chip tần suất corpus.

import { ResolvedTag } from "@/shared/structured-content";
import { TermFrequency } from "@/shared/term-meta";

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

// Mỗi nguồn tần suất một màu ổn định: băm tên từ điển vào bảng màu trong CSS
// (data-freq-color) — component không giữ mã màu nào.
const FREQ_COLOR_COUNT = 6;
function freqColorIndex(name = ""): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return hash % FREQ_COLOR_COUNT;
}

/**
 * Hàng chip tần suất corpus kiểu jisho (Anime 200, News 12k…). Đây là dữ liệu
 * tham khảo từ từ điển tần suất bên ngoài — khác hẳn "Số lần tra" cá nhân
 * trên thanh SRS, vốn là tín hiệu của sự quên.
 */
export function FrequencyTags({ frequencies }: { frequencies?: TermFrequency[] }) {
  if (!frequencies || frequencies.length === 0) return null;
  return (
    <div className="freq-tags">
      {frequencies.map((f, i) => (
        <span
          key={f.dictionary ?? i}
          className="freq-tag"
          data-freq-color={freqColorIndex(f.dictionary)}
          title={`Độ phổ biến theo ${f.dictionary ?? "từ điển tần suất"} — hạng càng nhỏ càng thông dụng (nguồn ngoài, không phải số lần bạn tra)`}
        >
          {f.dictionary && <span className="freq-dict">{f.dictionary}</span>}
          <b>{f.display}</b>
        </span>
      ))}
    </div>
  );
}
