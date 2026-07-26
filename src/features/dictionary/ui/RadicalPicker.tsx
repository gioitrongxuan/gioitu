// Bảng chọn bộ thủ kiểu jisho: lưới bộ nhóm theo số nét; chọn nhiều bộ → hiện
// các kanji chứa đủ mọi bộ đã chọn, và làm mờ những bộ không còn kết hợp được.
// Lọc chạy hoàn toàn ở client (dữ liệu radkfile lười tải) nên tức thời và dùng
// được cả khi offline. Bấm một kanji → chèn vào ô tìm.

import { useEffect, useMemo, useState } from "react";
import { loadRadicalData } from "../data/radicals";
import { availableRadicals, groupByStrokes, matchingKanji, RadicalData } from "../domain/radicals";
import { Skeleton } from "@/shared/ui/Skeleton";
import { CloseIcon } from "@/shared/ui/icons";

interface Props {
  /** Chèn kanji đã chọn vào ô tìm kiếm. */
  onInsert: (kanji: string) => void;
}

export function RadicalPicker({ onInsert }: Props) {
  const [data, setData] = useState<RadicalData | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    // Dữ liệu bộ thủ nằm trong chunk lười tải; offline mà chưa cache thì import
    // hỏng — bắt lỗi để hiện thông báo thay vì treo skeleton mãi (DESIGN §3.9).
    loadRadicalData().then(
      (d) => alive && setData(d),
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, [retry]);

  const groups = useMemo(() => (data ? groupByStrokes(data.radicals) : []), [data]);
  const matches = useMemo(() => (data ? matchingKanji(data, selected) : []), [data, selected]);
  const available = useMemo(
    () => (data ? availableRadicals(data, selected) : new Set<string>()),
    [data, selected],
  );

  function toggle(r: string) {
    setSelected((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]));
  }

  if (failed)
    return (
      <div className="radical-picker">
        <div className="radical-error">
          <p className="radical-hint">Không tải được dữ liệu bộ thủ — cần mạng ở lần đầu dùng.</p>
          <button type="button" className="radical-retry" onClick={() => setRetry((n) => n + 1)}>
            Thử lại
          </button>
        </div>
      </div>
    );

  if (!data) return <div className="radical-picker loading"><Skeleton lines={3} /></div>;

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
            <CloseIcon size={16} />
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
