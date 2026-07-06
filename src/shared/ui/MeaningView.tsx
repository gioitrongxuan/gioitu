// The one place that renders a *saved* word, shared by the detail panel and the
// review card so a word looks identical wherever it appears and regardless of
// where it came from (gioitu dictionary or Yomitan). It mirrors the live
// structured-content layout: a furigana headword, part-of-speech chips, then
// the gloss lines — reusing the `.senses/.sense/.gloss` and `.pos-tag` styles
// so there is a single style to tweak.
//
// Stored meanings are plain gloss lines (a JSON string[] — see
// review/domain/lookup and the Yomitan sync), so the glossary is text-only;
// live dictionary search keeps its richer renderer in StructuredContent. Example
// sentences are stored the same way (a JSON string[]) so a word can gather
// several contexts as it is re-added from Yomitan.

import { useState } from "react";
import { Furigana } from "./Furigana";
import { SentenceAnalysis } from "@/shared/types";

interface Props {
  /** Headword; rendered with furigana when `reading` is given. Omit to hide it
   *  (e.g. the detail panel already shows the word in its title). */
  term?: string;
  reading?: string;
  /** Part-of-speech text, e.g. "noun, suru verb". */
  pos?: string;
  /** Stored meaning (JSON string[] or plain text). */
  meaning: string;
  /** Stored example sentence(s) (JSON string[] or legacy plain text). */
  example?: string;
  /**
   * Phân tích AI (Premium) cho từng câu, lưu kèm entry (JSON `Record<câu,
   * SentenceAnalysis>`). Mỗi câu có phân tích sẽ có một nút thả xuống để xem
   * (mặc định đóng cho gọn). Tuỳ chọn — vắng thì không hiện nút.
   */
  analysis?: string;
  /** Rút gọn định nghĩa dài: chỉ hiện vài dòng đầu, phần còn lại sau "Xem thêm". */
  compact?: boolean;
}

// Compact mode (ghi chú cá nhân trong panel): chỉ hiện ngần này dòng nghĩa, phần
// còn lại ẩn sau nút mở rộng để thẻ không quá dài — định nghĩa từ điển đầy đủ đã
// nằm ngay bên dưới.
const COMPACT_GLOSS_LINES = 3;

/** Parse a stored `meaning` (JSON string[] or plain text) into gloss lines. */
export function meaningToLines(meaning: string): string[] {
  try {
    const parsed = JSON.parse(meaning);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {
    /* plain text, not JSON */
  }
  return meaning ? [meaning] : [];
}

/** Parse a stored `example` (JSON string[] or legacy plain text) into sentences. */
export function exampleToLines(example: string | undefined): string[] {
  if (!example) return [];
  try {
    const parsed = JSON.parse(example);
    if (Array.isArray(parsed)) return parsed.map((s) => String(s).trim()).filter(Boolean);
  } catch {
    /* legacy plain text, not JSON */
  }
  const text = example.trim();
  return text ? [text] : [];
}

/**
 * Parse a stored `analysis` (JSON `Record<câu, SentenceAnalysis>`) thành bản đồ
 * tra nhanh theo câu. Khoan dung: payload hỏng/kiểu lạ → bản đồ rỗng (UI chỉ ẩn
 * nút phân tích, không lỗi).
 */
export function analysisToMap(analysis: string | undefined): Record<string, SentenceAnalysis> {
  if (!analysis) return {};
  try {
    const parsed = JSON.parse(analysis);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: Record<string, SentenceAnalysis> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (v && typeof v === "object") {
          const a = v as Record<string, unknown>;
          const usage = typeof a.usage === "string" ? a.usage : "";
          const meaning = typeof a.meaning === "string" ? a.meaning : "";
          if (usage || meaning) out[k] = { usage, meaning };
        }
      }
      return out;
    }
  } catch {
    /* not JSON */
  }
  return {};
}

export function MeaningView({ term, reading, pos, meaning, example, analysis, compact }: Props) {
  const lines = meaningToLines(meaning);
  const examples = exampleToLines(example);
  const analysisMap = analysisToMap(analysis);
  const posTags = pos ? pos.split(/[,、;；]/).map((t) => t.trim()).filter(Boolean) : [];

  const [expanded, setExpanded] = useState(false);
  const hasOverflow = lines.length > COMPACT_GLOSS_LINES;
  const collapsed = compact === true && !expanded && hasOverflow;
  const shownLines = collapsed ? lines.slice(0, COMPACT_GLOSS_LINES) : lines;

  return (
    <div className={`meaning-view${collapsed ? " collapsed" : ""}`}>
      {term && (
        <div className="meaning-headword">
          <Furigana term={term} reading={reading} />
        </div>
      )}

      {posTags.length > 0 && (
        <div className="meaning-pos">
          {posTags.map((p, i) => (
            <span className="pos-tag" key={i}>{p}</span>
          ))}
        </div>
      )}

      {lines.length > 0 && (
        <ol className="senses">
          {shownLines.map((line, i) => (
            <li className="sense" key={i}>
              <div className="sense-body">
                <div className="gloss">{line}</div>
              </div>
            </li>
          ))}
        </ol>
      )}

      {compact && hasOverflow && (
        <button type="button" className="link meaning-more" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Thu gọn" : `Xem thêm (${lines.length - COMPACT_GLOSS_LINES})`}
        </button>
      )}

      {examples.length > 0 && (
        <div className="meaning-examples">
          {examples.map((ex, i) => {
            const ai = analysisMap[ex];
            return (
              <div className="meaning-example" key={i}>
                <p className="meaning-example-text">{ex}</p>
                {ai && (
                  <details className="meaning-ai">
                    <summary>Phân tích AI</summary>
                    <div className="meaning-ai-body">
                      {ai.usage && (
                        <p>
                          <span className="meaning-ai-label">Cách dùng:</span> {ai.usage}
                        </p>
                      )}
                      {ai.meaning && (
                        <p>
                          <span className="meaning-ai-label">Ý nghĩa câu:</span> {ai.meaning}
                        </p>
                      )}
                    </div>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
