// Review-session ordering & queue state (SPEC 4.4). Pure functions only — the UI
// owns the async grading/persistence and feeds the graded entry back in.
//
// Vì sao cần snapshot + tự quản con trỏ: `dueEntries` của store là danh sách dẫn
// xuất *sống*. Chấm một thẻ đẩy next_review sang tương lai nên thẻ rơi khỏi
// dueEntries và mảng co lại dưới chân phiên ôn. Một con trỏ chỉ tăng index sẽ
// nhảy cóc qua thẻ vừa trượt vào ô trống. Ta chụp một lần lúc mở phiên và tự
// quản hàng đợi ở đây.

import { VocabEntry } from "@/shared/types";
import { REVIEW_BATCH_SIZE } from "./constants";

export interface ReviewSession {
  /** Thẻ còn phải ôn trong lô hiện tại; `queue[0]` là thẻ hiện tại. */
  queue: VocabEntry[];
  /** Các thẻ đến hạn đã xếp thứ tự nhưng chưa được kéo vào lô nào — chờ lô kế. */
  pending: VocabEntry[];
  /** Kích thước mỗi lô; giữ trong phiên để lấy lô kế không cần truyền lại. */
  batchSize: number;
  /** Số lượt đã chấm trong CẢ phiên (cộng dồn qua các lô). */
  reviewed: number;
  /** Ảnh chụp trạng thái *trước* mỗi lượt chấm, mới nhất ở cuối — dùng cho Hoàn tác. */
  history: SessionSnapshot[];
}

interface SessionSnapshot {
  queue: VocabEntry[];
  reviewed: number;
}

/** Fisher–Yates, trả về mảng mới (không đụng input — giữ caller thuần). */
function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Sắp thứ tự thẻ đến hạn cho một phiên: xáo trộn để đỡ nhàm, rồi stable-sort theo
 * `next_review` để thẻ quá hạn lâu lên trước, còn các thẻ hoà (vd thẻ mới cùng đến
 * hạn "ngay bây giờ") đổi thứ tự mỗi phiên. Array.sort ổn định từ ES2019.
 */
export function orderSession(due: VocabEntry[], rng: () => number = Math.random): VocabEntry[] {
  return shuffle(due, rng).sort((a, b) => (a.next_review ?? 0) - (b.next_review ?? 0));
}

/**
 * Mở phiên trên một *ảnh chụp* các thẻ đang đến hạn. Xếp cả danh sách theo mức
 * quá hạn (quá hạn lâu nhất trước) RỒI mới chia lô: lô đầu (`queue`) gồm
 * `batchSize` thẻ cấp thiết nhất, phần còn lại nằm ở `pending` chờ người dùng
 * đồng ý ôn tiếp. `batchSize ≤ 0` được coi là "không chia lô" (một lô chứa tất cả).
 */
export function startSession(
  due: VocabEntry[],
  rng: () => number = Math.random,
  batchSize: number = REVIEW_BATCH_SIZE,
): ReviewSession {
  const ordered = orderSession(due, rng);
  const size = batchSize > 0 ? batchSize : ordered.length;
  return {
    queue: ordered.slice(0, size),
    pending: ordered.slice(size),
    batchSize: size,
    reviewed: 0,
    history: [],
  };
}

/** Thẻ đang hiển thị, hoặc `undefined` khi lô hiện tại đã hết. */
export function currentCard(s: ReviewSession): VocabEntry | undefined {
  return s.queue[0];
}

/** Còn lô nữa để ôn sau khi hết lô hiện tại không? */
export function hasNextBatch(s: ReviewSession): boolean {
  return s.pending.length > 0;
}

/** Số thẻ trong lô kế (lô cuối có thể ít hơn `batchSize`). */
export function nextBatchSize(s: ReviewSession): number {
  return Math.min(s.batchSize, s.pending.length);
}

/**
 * Kéo lô kế từ `pending` vào `queue`. Xoá lịch sử hoàn tác: hoàn tác không vượt
 * ranh giới lô (khôi phục một `queue` rỗng của lô trước sẽ vô nghĩa), và mỗi lô
 * là một chặng khép kín. `reviewed` cộng dồn nên tổng kết cuối phiên vẫn đúng.
 */
export function loadNextBatch(s: ReviewSession): ReviewSession {
  return {
    ...s,
    queue: s.pending.slice(0, s.batchSize),
    pending: s.pending.slice(s.batchSize),
    history: [],
  };
}

/**
 * Thẻ vừa bị chấm rơi lại pha học/học lại vẫn còn bước ngắn (1–10 phút) chưa chạy;
 * đưa nó trở lại cuối phiên thay vì bỏ đi hàng phút. Thẻ đã lên REVIEW đã có
 * interval thực nên rời phiên.
 */
export function shouldRequeue(graded: Pick<VocabEntry, "card_state">): boolean {
  return graded.card_state === "LEARNING";
}

/**
 * Bỏ qua thẻ hiện tại sau khi chấm. `graded` là entry engine SRS trả về cho
 * `queue[0]`. Thẻ còn ở pha học được chèn lại *cuối* hàng đợi để người dùng ôn
 * hết phần còn lại trước và không gặp cùng một thẻ hai lần liên tiếp.
 */
export function applyGrade(s: ReviewSession, graded: VocabEntry): ReviewSession {
  const rest = s.queue.slice(1);
  // Re-queue giữ thẻ trong LÔ hiện tại (thêm vào cuối `queue`), không đẩy sang
  // `pending`: một thẻ còn bước học ngắn phải ôn nốt trong lô này, không lùi ra
  // sau cả phần backlog. `pending`/`batchSize` đi qua nguyên vẹn.
  return {
    ...s,
    queue: shouldRequeue(graded) ? [...rest, graded] : rest,
    reviewed: s.reviewed + 1,
    history: [...s.history, { queue: s.queue, reviewed: s.reviewed }],
  };
}

export function canUndo(s: ReviewSession): boolean {
  return s.history.length > 0;
}

/**
 * Hoàn tác lượt chấm gần nhất. Trả về phiên đã khôi phục kèm entry cần ghi lại
 * (thẻ vừa chấm ở trạng thái *trước khi chấm*) để caller lăn ngược persistence.
 * `null` khi không còn gì để hoàn tác.
 */
export function undoGrade(
  s: ReviewSession,
): { session: ReviewSession; restore: VocabEntry } | null {
  const snapshot = s.history[s.history.length - 1];
  if (!snapshot) return null;
  return {
    session: { ...s, queue: snapshot.queue, reviewed: snapshot.reviewed, history: s.history.slice(0, -1) },
    restore: snapshot.queue[0],
  };
}
