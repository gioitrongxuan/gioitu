// "Instant Action" — lấp khoảng trống bên phải bảng viết tay / bộ thủ trên
// desktop. Thay vì ẩn gợi ý hẳn khi một công cụ nhập đang mở (như dropdown
// suggestions dưới ô tìm), đây ta vẫn chạy searchSuggest theo nội dung ô tìm
// (kể cả ký tự vừa chèn qua viết tay / bộ thủ) và hiện danh sách dọc bên cạnh.
// Bấm một mục → tra ngay (forward-only, qua onPick), đúng tinh thần "instant".
//
// Chỉ hiển thị khi đã có chữ trong ô tìm; rỗng thì ẩn để khỏi vẽ thẻ trắng. Giữ
// panel ngay cả khi gợi ý trống (vẫn hiện câu "không có") để bố cục không giật
// khi kết quả tới / mất.

import { useEffect, useRef, useState } from "react";
import { DictEntry } from "@/shared/db";
import { searchSuggest } from "../data/search";
import { glossToText } from "@/shared/structured-content";
import { LangPair } from "@/shared/languages";
import { DictSource } from "../domain/source";

interface Props {
  /** Nội dung ô tìm hiện tại — ký tự chèn qua công cụ cũng nối vào đây. */
  query: string;
  pair: LangPair;
  source: DictSource;
  /** Tra ngay từ đã chọn (giống nút tìm của ô tìm). */
  onPick: (term: string) => void;
}

const SUGGEST_DELAY_MS = 120;
const MAX_ITEMS = 8;

export function InstantActions({ query, pair, source, onPick }: Props) {
  const [items, setItems] = useState<DictEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const epochRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const trimmed = query.trim();
    window.clearTimeout(timerRef.current);
    if (!trimmed) {
      setItems([]);
      setLoading(false);
      return;
    }
    timerRef.current = window.setTimeout(async () => {
      const epoch = ++epochRef.current;
      setLoading(true);
      try {
        const res = await searchSuggest(trimmed, pair, source);
        if (epoch === epochRef.current) setItems(res.slice(0, MAX_ITEMS));
      } finally {
        if (epoch === epochRef.current) setLoading(false);
      }
    }, SUGGEST_DELAY_MS);
    return () => window.clearTimeout(timerRef.current);
  }, [query, pair, source]);

  if (!query.trim()) return null;

  return (
    <aside className="instant-actions" aria-label="Tìm nhanh từ liên quan">
      <h3 className="instant-actions-title">Tìm nhanh</h3>
      {items.length === 0 ? (
        <p className="instant-actions-empty">
          {loading ? "Đang tìm…" : "Chưa có gợi ý"}
        </p>
      ) : (
        <ul className="instant-actions-list">
          {items.map((s) => (
            <li key={`${s.term}:${s.reading ?? ""}`}>
              <button type="button" onClick={() => onPick(s.term)}>
                <span className="ia-term" lang={pair.source}>{s.term}</span>
                {s.reading && (
                  <span className="ia-reading" lang={pair.source}>{s.reading}</span>
                )}
                <span className="ia-def">{glossToText(s.definitions[0])}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
