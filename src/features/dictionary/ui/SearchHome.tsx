// Trang Tra cứu khi chưa mở từ nào (#269): thay vì một câu "gõ đi" trơ trọi,
// kể lại lịch sử tra cứu của chính người dùng — "Tra gần đây" để mở lại nhanh,
// "Tra nhiều nhất" để thấy từ nào cứ phải tra đi tra lại (một lần tra là tín
// hiệu của sự quên).
//
// Chỉ hiện lịch sử của CẶP NGÔN NGỮ đang chọn: bấm một từ là tra lại nó bằng ô
// tìm chung trên header, mà ô đó luôn tra theo cặp đang chọn.

import { useCallback, useEffect, useRef, useState } from "react";
import { SearchHistoryEntry } from "@/shared/types";
import { LangPair } from "@/shared/languages";
import { Skeleton } from "@/shared/ui/Skeleton";
import { pushToast } from "@/shared/ui/Toasts";
import { clearSearchHistory, getSearchHistory, restoreSearchHistory } from "../data/searchHistory";
import { recentSearches, topSearches } from "../domain/searchHistory";
import "./search.css";

interface Props {
  userId: string;
  pair: LangPair;
  /** Tra lại một từ trong lịch sử (đi qua đúng đường tra thường). */
  onLookup: (term: string) => void;
}

export function SearchHome({ userId, pair, onLookup }: Props) {
  const [rows, setRows] = useState<SearchHistoryEntry[] | null>(null);
  // Đổi cặp ngôn ngữ giữa chừng: lượt đọc cũ về muộn không được đè lên lượt mới
  // (cùng idiom epoch với SearchBar/useLookup).
  const epochRef = useRef(0);

  const load = useCallback(async () => {
    const epoch = ++epochRef.current;
    const all = await getSearchHistory(userId);
    if (epoch !== epochRef.current) return;
    setRows(all.filter((r) => r.term_lang === pair.source && r.native_lang === pair.target));
  }, [userId, pair.source, pair.target]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onClear() {
    // Xoá là hành động phá huỷ nhưng nhẹ: toast "Hoàn tác" thay cho hộp xác nhận
    // (DESIGN §3.6), đặt lại đúng các dòng vừa xoá.
    const removed = await clearSearchHistory(userId);
    await load();
    pushToast("Đã xoá lịch sử tra cứu", "info", {
      label: "Hoàn tác",
      onClick: () => {
        void restoreSearchHistory(removed).then(load);
      },
    });
  }

  if (rows == null) return <Skeleton lines={3} className="empty" />;

  const recent = recentSearches(rows);
  const top = topSearches(rows);

  if (recent.length === 0)
    return <p className="empty">Tra một từ ở ô bên trên — kết quả hiện ở đây.</p>;

  return (
    <div className="search-home">
      <p className="empty search-home-hint">Tra một từ ở ô bên trên — kết quả hiện ở đây.</p>

      {top.length > 0 && (
        <section className="search-home-section" aria-label="Từ tra nhiều nhất">
          <h2 className="search-home-title">Tra nhiều nhất</h2>
          <WordList words={top} lang={pair.source} onLookup={onLookup} showCount />
        </section>
      )}

      <section className="search-home-section" aria-label="Từ vừa tra">
        <h2 className="search-home-title">Tra gần đây</h2>
        <WordList words={recent} lang={pair.source} onLookup={onLookup} />
      </section>

      <button type="button" className="link search-home-clear" onClick={onClear}>
        Xoá lịch sử tra cứu
      </button>
    </div>
  );
}

function WordList({
  words,
  lang,
  onLookup,
  showCount = false,
}: {
  words: SearchHistoryEntry[];
  lang: string;
  onLookup: (term: string) => void;
  showCount?: boolean;
}) {
  return (
    <div className="search-home-words">
      {words.map((w) => (
        <button
          key={`${w.term}:${w.reading ?? ""}`}
          type="button"
          className="search-home-word"
          onClick={() => onLookup(w.term)}
        >
          <span lang={lang}>{w.term}</span>
          {w.reading && w.reading !== w.term && (
            <span className="search-home-reading" lang={lang}>
              {w.reading}
            </span>
          )}
          {showCount && <span className="search-home-count">{w.count} lượt</span>}
        </button>
      ))}
    </div>
  );
}
