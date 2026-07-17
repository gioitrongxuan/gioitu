// Default SM-2 / SRS parameters (SPEC 4.4, configurable).
// All durations expressed in MINUTES to match VocabEntry.srs_interval.

export const MINUTE = 1;
export const DAY = 24 * 60; // 1440 minutes

export interface SrsConfig {
  /** Learning steps in minutes (SPEC default [1 min, 10 min]). */
  learningSteps: number[];
  /** Interval granted on graduating via "Good" from the last learning step. */
  graduatingInterval: number;
  /** Interval granted on graduating via "Easy". */
  easyInterval: number;
  /** Initial ease factor for new cards. */
  initialEaseFactor: number;
  /** Hard lower bound on ease factor. */
  minEaseFactor: number;
  /** Multiplier applied to interval when grading "Hard" in REVIEW. */
  hardIntervalMultiplier: number;
  /** Extra multiplier applied on top of EF when grading "Easy" in REVIEW. */
  easyBonus: number;
  /** Relearning step(s) entered after "Again" from REVIEW. */
  relearningSteps: number[];
  /** Interval (minutes) at/above which a word graduates to LEARNED ("mature"). */
  matureThreshold: number;
  /**
   * Trần cứng (phút) cho mọi interval sinh ra ở REVIEW. Khi "Hard/Good/Easy"
   * nhân interval lên, kết quả bị kẹp tại đây để thẻ không trôi tới những khoảng
   * cách nhiều năm vô nghĩa. Giữ **bằng** `knownInterval` (~1 năm) để một thẻ tự
   * nhiên chạm trần và một thẻ "tự khai đã thuộc" cùng nằm ở đỉnh thang — không
   * mâu thuẫn nhau.
   */
  maxInterval: number;
  /**
   * Khi một thẻ tốt nghiệp KHỎI relearning, interval mới được khôi phục theo
   * phần trăm interval NGAY TRƯỚC lúc lapse thay vì rơi thẳng về
   * `graduatingInterval`: một từ đã chín muồi lỡ quên một lần không nên tụt hẳn
   * về 1 ngày rồi phải leo lại từ đầu.
   */
  lapseIntervalMultiplier: number;
  /** Sàn (phút) cho interval khôi phục sau lapse — không bao giờ thấp hơn ngưỡng này. */
  lapseMinInterval: number;
  /**
   * Interval (minutes) granted when the user asserts they already know a word
   * outright ("Đã nhớ" / "Đánh dấu đã biết"). Deliberately far above
   * `matureThreshold`: the user is vouching they know it cold, so it reads as
   * (near-)fully mastered on the kanji-stats heatmap and won't resurface for a
   * long time — unlike a word that merely *reached* maturity through reviews.
   */
  knownInterval: number;
  /** Ease penalty for "Again". */
  againEaseDelta: number;
  /** Ease penalty for "Hard". */
  hardEaseDelta: number;
  /** Ease bonus for "Easy". */
  easyEaseDelta: number;
}

export const DEFAULT_SRS_CONFIG: SrsConfig = {
  learningSteps: [1 * MINUTE, 10 * MINUTE],
  graduatingInterval: 1 * DAY,
  easyInterval: 4 * DAY,
  initialEaseFactor: 2.5,
  minEaseFactor: 1.3,
  hardIntervalMultiplier: 1.2,
  easyBonus: 1.3,
  relearningSteps: [10 * MINUTE],
  matureThreshold: 21 * DAY,
  maxInterval: 365 * DAY, // trần cứng, bằng knownInterval để cùng nằm ở đỉnh thang
  lapseIntervalMultiplier: 0.5, // khôi phục nửa interval trước lapse (gọn, dễ giải thích)
  lapseMinInterval: 1 * DAY, // = graduatingInterval → thẻ interval nhỏ vẫn hành xử như cũ
  knownInterval: 365 * DAY, // "thuộc lòng": ~1 năm → gần trần thang thành thạo

  againEaseDelta: -0.2,
  hardEaseDelta: -0.15,
  easyEaseDelta: 0.15,
};

/** Debounce window for counting a repeated lookup of the same term (SPEC 4.1). */
export const LOOKUP_DEBOUNCE_MS = 2000;

/** Minimum lookups before an SRS card is auto-created (SPEC 4.4 gating). */
export const SRS_GATING_THRESHOLD = 2;
