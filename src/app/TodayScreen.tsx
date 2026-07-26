// Khu "Hôm nay" (#149 — khung v0; #150 sẽ đắp streak + dải hoạt động 7 ngày +
// từ hay quên). Nguyên tắc cảm xúc (DESIGN §5): thấy cả TÀI SẢN (đã thuộc N)
// chứ không chỉ nợ (N từ đến hạn).

import { SearchIcon } from "@/shared/ui/icons";
import "./shell.css";

// Ước lượng "~X phút" cho hero: nhịp tự chấm một thẻ (lật + nhớ lại) chừng nửa
// phút — con số để định kỳ vọng, không phải cam kết.
const SECONDS_PER_CARD = 30;

export function estimateMinutes(dueCount: number): number {
  return Math.max(1, Math.round((dueCount * SECONDS_PER_CARD) / 60));
}

interface TodayScreenProps {
  dueCount: number;
  learnedCount: number;
  onStartReview: () => void;
  onGoSearch: () => void;
  onGoLearned: () => void;
}

export function TodayScreen({ dueCount, learnedCount, onStartReview, onGoSearch, onGoLearned }: TodayScreenProps) {
  return (
    <div className="today-screen">
      <section className="today-hero">
        {dueCount > 0 ? (
          <>
            <h2 className="today-hero-title">
              {dueCount} từ đến hạn <span className="today-hero-est">· ~{estimateMinutes(dueCount)} phút</span>
            </h2>
            <button type="button" className="primary today-hero-cta" onClick={onStartReview}>
              Ôn ngay
            </button>
          </>
        ) : (
          <>
            <h2 className="today-hero-title">Hôm nay không có từ đến hạn</h2>
            <p className="today-hero-sub">Tra một từ mới, hoặc ghé Kho từ xem lại vườn của bạn.</p>
          </>
        )}
      </section>

      <button type="button" className="today-asset link" onClick={onGoLearned}>
        Đã thuộc {learnedCount} từ 🎉
      </button>

      {/* Ô tìm thu gọn: đưa sang khu Tra cứu, nơi có SearchBar đầy đủ (gợi ý
          live, viết tay, bộ thủ) — không nhân đôi logic tra ở đây. */}
      <button type="button" className="today-search" onClick={onGoSearch}>
        <SearchIcon size={16} />
        <span>Tra từ…</span>
      </button>
    </div>
  );
}
