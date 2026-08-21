// Khu "Hôm nay" (#149 dựng khung, #150 đắp đầy): hero due → vào phiên, chuỗi
// ngày + dải hoạt động 7 ngày, từ hay quên. Nguyên tắc cảm xúc (DESIGN §5):
// thấy cả TÀI SẢN (đã thuộc N, chuỗi ngày) chứ không chỉ nợ (N từ đến hạn).

import { useEffect, useState } from "react";
import { VocabEntry } from "@/shared/types";
import { TodayStats } from "@/features/review/data/todayStats";
import { addedWindowPhrase, narrowsAdded, AddedWindow, CloudLang } from "@/features/review/domain/wordcloud";
import { LangSelect } from "@/features/review/ui/LangSelect";
import "./shell.css";

// Chỉ "ja"/"en" thực sự chọn được qua LangSelect — "all" không có nhãn vì lúc
// đó ngôn ngữ không phải thứ đang che hàng đợi.
const LANG_LABELS: Partial<Record<CloudLang, string>> = {
  ja: "tiếng Nhật",
  en: "tiếng Anh",
};

// Ước lượng "~X phút" cho hero: nhịp tự chấm một thẻ (lật + nhớ lại) chừng nửa
// phút — con số để định kỳ vọng, không phải cam kết.
const SECONDS_PER_CARD = 30;

function estimateMinutes(dueCount: number): number {
  return Math.max(1, Math.round((dueCount * SECONDS_PER_CARD) / 60));
}

// Nhãn thứ theo Date.getDay() (0 = Chủ nhật).
const WEEKDAY_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

// Ngày có ôn dù ít vẫn phải thấy được cột — sàn chiều cao thanh hoạt động.
const MIN_BAR_PERCENT = 15;

interface TodayScreenProps {
  /** Số đến hạn đã lọc theo `lang` — dùng cho tiêu đề hero + nút "Ôn ngay". */
  dueCount: number;
  /** Số đến hạn KHÔNG lọc — chỉ để phân biệt "hết nợ thật" với "bị lọc khỏi tầm nhìn". */
  totalDueCount: number;
  lang: CloudLang;
  onLangChange: (lang: CloudLang) => void;
  /** Cửa sổ "Thêm trong" đang lọc hàng đợi — chỉ để gọi tên đúng bộ lọc đang che. */
  addedWindow: AddedWindow;
  learnedCount: number;
  /** Từ hay quên nhất (rớt nhiều lần nhất) — App tính sẵn từ store. */
  forgotten: VocabEntry[];
  /** Đọc chuỗi ngày + dải hoạt động từ nhật ký ôn (I/O do App inject). */
  loadStats: () => Promise<TodayStats>;
  onStartReview: () => void;
  onGoLearned: () => void;
  onSelectWord: (entry: VocabEntry) => void;
}

export function TodayScreen({
  dueCount,
  totalDueCount,
  lang,
  onLangChange,
  addedWindow,
  learnedCount,
  forgotten,
  loadStats,
  onStartReview,
  onGoLearned,
  onSelectWord,
}: TodayScreenProps) {
  const [stats, setStats] = useState<TodayStats | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadStats().then((s) => {
      if (!cancelled) setStats(s);
    });
    return () => {
      cancelled = true;
    };
  }, [loadStats]);

  const maxActivity = stats == null ? 0 : Math.max(...stats.activity.map((d) => d.count));

  // Còn nợ nhưng hero trống nghĩa là một bộ lọc đang che hàng đợi — gọi tên
  // đúng bộ lọc đó, và chỉ đường tới nơi chỉnh được nó (ô "Thêm trong" nằm ở
  // Kho từ, không có mặt trên màn này).
  const hiddenBy = [LANG_LABELS[lang], narrowsAdded(addedWindow) ? addedWindowPhrase(addedWindow) : undefined]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="today-screen">
      <section className="today-hero">
        <div className="today-hero-lang">
          <LangSelect lang={lang} onLangChange={onLangChange} />
        </div>
        {dueCount > 0 ? (
          <>
            <h2 className="today-hero-title">
              {dueCount} từ đến hạn <span className="today-hero-est">· ~{estimateMinutes(dueCount)} phút</span>
            </h2>
            <button type="button" className="primary today-hero-cta" onClick={onStartReview}>
              Ôn ngay
            </button>
          </>
        ) : totalDueCount > 0 ? (
          <>
            <h2 className="today-hero-title">{`Không có từ ${hiddenBy ? `${hiddenBy} ` : ""}đến hạn`}</h2>
            <p className="today-hero-sub">
              {!narrowsAdded(addedWindow)
                ? "Đổi ngôn ngữ ở trên để xem các từ đến hạn khác."
                : "Nới bộ lọc “Thêm trong” ở Kho từ để xem các từ đến hạn khác."}
            </p>
          </>
        ) : (
          <>
            <h2 className="today-hero-title">Hôm nay không có từ đến hạn</h2>
            <p className="today-hero-sub">Tra một từ mới, hoặc ghé Kho từ xem lại vườn của bạn.</p>
          </>
        )}
      </section>

      {stats && (
        <section className="today-activity" aria-label="Hoạt động 7 ngày gần nhất">
          <p className="today-streak">
            {stats.streak.current > 0 ? (
              <>
                Chuỗi <strong>{stats.streak.current} ngày</strong>
                {stats.streak.longest > stats.streak.current && (
                  <span className="today-streak-sub"> · dài nhất {stats.streak.longest}</span>
                )}
              </>
            ) : (
              "Ôn hôm nay để bắt đầu một chuỗi ngày mới"
            )}
          </p>
          <div className="today-days">
            {stats.activity.map((day) => {
              const label = WEEKDAY_LABELS[new Date(day.dayStart).getDay()];
              const percent =
                day.count === 0 ? 0 : Math.max(MIN_BAR_PERCENT, (day.count / maxActivity) * 100);
              return (
                <div key={day.dayStart} className="today-day" title={`${label}: ${day.count} lượt ôn`}>
                  <span className="today-day-track">
                    <span className="today-day-fill" style={{ height: `${percent}%` }} />
                  </span>
                  <span className="today-day-label">{label}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {forgotten.length > 0 && (
        <section className="today-forgotten" aria-label="Từ hay quên">
          <h3 className="today-section-title">Từ hay quên — chạm mặt lại một chút?</h3>
          <div className="today-forgotten-words">
            {forgotten.map((entry) => (
              <button
                key={`${entry.term}:${entry.term_lang}`}
                type="button"
                className="today-forgotten-word"
                onClick={() => onSelectWord(entry)}
              >
                <span lang={entry.term_lang}>{entry.term}</span>
                <span className="today-forgotten-count">quên {entry.lapses} lần</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <button type="button" className="today-asset link" onClick={onGoLearned}>
        Đã thuộc {learnedCount} từ
      </button>
    </div>
  );
}
