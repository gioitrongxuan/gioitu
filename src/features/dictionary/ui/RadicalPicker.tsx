// Bảng chọn bộ thủ kiểu jisho: lưới bộ nhóm theo số nét; chọn nhiều bộ → hiện
// các kanji chứa đủ mọi bộ đã chọn, và làm mờ những bộ không còn kết hợp được.
// Lọc chạy hoàn toàn ở client (dữ liệu radkfile lười tải) nên tức thời và dùng
// được cả khi offline. Bấm một kanji → chèn vào ô tìm.

import { useEffect, useMemo, useState } from "react";
import { loadRadicalData } from "../data/radicals";
import { availableRadicals, groupByStrokes, matchingKanji, RadicalData } from "../domain/radicals";

interface Props {
  /** Chèn kanji đã chọn vào ô tìm kiếm. */
  onInsert: (kanji: string) => void;
}

export function RadicalPicker({ onInsert }: Props) {
  const [data, setData] = useState<RadicalData | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    loadRadicalData().then((d) => alive && setData(d));
    return () => {
      alive = false;
    };
  }, []);

  const groups = useMemo(() => (data ? groupByStrokes(data.radicals) : []), [data]);
  const matches = useMemo(() => (data ? matchingKanji(data, selected) : []), [data, selected]);
  const available = useMemo(
    () => (data ? availableRadicals(data, selected) : new Set<string>()),
    [data, selected],
  );

  function toggle(r: string) {
    setSelected((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  }

  if (!data) return <div className="radical-picker loading">Đang tải bộ thủ…</div>;

  return (
    <div className="radical-picker">
      <div className="radical-results" lang="ja">
        {selected.length > 0 && (
          <button
            type="button"
            className="radical-reset"
            aria-label="Bỏ chọn tất cả bộ"
            title="Bỏ chọn tất cả"
            onClick={() => setSelected([])}
          >
            ✕
          </button>
        )}
        {selected.length === 0 ? (
          <span className="radical-hint">Chọn các bộ để lọc kanji</span>
        ) : matches.length === 0 ? (
          <span className="radical-hint">Không có kanji chứa đủ các bộ đã chọn</span>
        ) : (
          matches.map((k) => (
            <button key={k} type="button" className="radical-kanji" onClick={() => onInsert(k)}>
              {k}
            </button>
          ))
        )}
      </div>

      <div className="radical-grid">
        {groups.map((group) => (
          <div key={group.strokes} className="radical-group">
            <span className="radical-strokes" aria-hidden>
              {group.strokes}
            </span>
            {group.radicals.map(({ r }) => {
              const isSelected = selected.includes(r);
              const isAvailable = available.has(r);
              return (
                <button
                  key={r}
                  type="button"
                  lang="ja"
                  className={`radical-btn${isSelected ? " selected" : ""}`}
                  disabled={!isAvailable}
                  onClick={() => toggle(r)}
                >
                  {r}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
