// Hai mốc đồng bộ nhật ký ôn, lưu theo user trong localStorage (như lastSync.ts).
// Nhật ký append-only nên mỗi lượt đồng bộ chỉ cần chuyển PHẦN MỚI; hai mốc này
// là chỗ nhớ "mới" nghĩa là gì cho từng chiều.

const KEY_PREFIX = "gioitu.reviewLogSync.v1";

export interface ReviewLogCursor {
  /** `ts` lớn nhất đã đẩy lên thành công — lượt sau chỉ đẩy từ mốc này trở đi. */
  pushedThrough: number;
  /** Con trỏ `seq` server của dòng cuối đã kéo về — lượt sau chỉ kéo phần sau nó. */
  pulledSeq: number;
}

const EMPTY: ReviewLogCursor = { pushedThrough: 0, pulledSeq: 0 };

/** localStorage có thể vắng (Node/SSR/test) — hạ cấp êm như lastSync.ts. */
function storage(): Storage | null {
  return typeof localStorage !== "undefined" ? localStorage : null;
}

function keyFor(user_id: string): string {
  return `${KEY_PREFIX}:${user_id}`;
}

function finite(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/**
 * Mốc đang lưu. Mọi hỏng hóc (thiếu, JSON rác, số không hợp lệ) đều lùi về 0 =
 * "đồng bộ lại từ đầu": tốn một lượt chuyển nhiều dữ liệu, nhưng không bao giờ
 * bỏ sót — khử trùng lặp ở hai đầu chịu được việc gửi/nhận lại.
 */
export function readReviewLogCursor(user_id: string): ReviewLogCursor {
  const raw = storage()?.getItem(keyFor(user_id));
  if (!raw) return { ...EMPTY };
  try {
    const parsed = JSON.parse(raw) as Partial<ReviewLogCursor>;
    return { pushedThrough: finite(parsed.pushedThrough), pulledSeq: finite(parsed.pulledSeq) };
  } catch {
    return { ...EMPTY };
  }
}

export function writeReviewLogCursor(user_id: string, cursor: ReviewLogCursor): void {
  storage()?.setItem(keyFor(user_id), JSON.stringify(cursor));
}

/**
 * Hạ mốc đẩy xuống `ts` khi vừa ghi thêm nhật ký CŨ vào kho (nhập file backup):
 * những dòng đó nằm dưới mốc hiện tại nên nếu không lùi lại, chúng sẽ không bao
 * giờ được đẩy lên cloud và các máy khác mất hẳn phần lịch sử vừa phục hồi.
 */
export function rewindPushedThrough(user_id: string, ts: number): void {
  const cursor = readReviewLogCursor(user_id);
  if (ts >= cursor.pushedThrough) return;
  writeReviewLogCursor(user_id, { ...cursor, pushedThrough: ts });
}
