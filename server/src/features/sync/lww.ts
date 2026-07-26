// LWW với mốc hiệu lực chống lệch đồng hồ client (#166) — logic thuần, không
// import pg để test được bằng vitest.
//
// Vấn đề: `updated_at` do client tự đóng dấu, nên một máy lệch giờ về tương lai
// sẽ thắng mọi bản ghi thật sự mới hơn ("thắng oan") cho tới khi mốc ảo đó trôi
// qua. Server không biết bản ghi được sửa lúc nào, nhưng biết chắc nó được sửa
// TRƯỚC lúc server nhận (`received_at`). Vậy mốc hiệu lực =
// min(updated_at, received_at): mốc client hợp lệ giữ nguyên, mốc chạy trước
// đồng hồ server bị ghìm về thời điểm nhận. Payload không bị sửa — client cũ
// không thấy khác biệt gì.

export interface SyncEntry {
  term: string;
  term_lang: string;
  updated_at: number;
  [k: string]: unknown;
}

/** Một bản ghi kèm mốc server đóng dấu lúc nhận (cột `received_at`). */
export interface StampedEntry {
  entry: SyncEntry;
  receivedAt: number;
}

/** Mốc hiệu lực cho LWW: không cho `updated_at` của client vượt lúc server nhận. */
export function effectiveStamp(e: StampedEntry): number {
  return Math.min(e.entry.updated_at, e.receivedAt);
}

/** Hoà mốc hiệu lực → tie-breaker theo thứ tự server nhận (bản nhận sau thắng,
 * giữ đúng hành vi `>=` cũ khi hai đồng hồ khớp nhau). */
function incomingWins(existing: StampedEntry, incoming: StampedEntry): boolean {
  const gap = effectiveStamp(incoming) - effectiveStamp(existing);
  if (gap !== 0) return gap > 0;
  return incoming.receivedAt >= existing.receivedAt;
}

/**
 * Hợp nhất field-level một cặp bản ghi cùng khoá (giống client repository.ts):
 * `lookup_count` & `lapses` lấy MAX (bộ đếm chỉ tăng), phần còn lại theo bản có
 * mốc hiệu lực mới hơn. Trả về cả `receivedAt` của bên thắng để các lần so sánh
 * sau vẫn ghìm được mốc ảo của nó.
 */
export function mergeStampedEntries(existing: StampedEntry, incoming: StampedEntry): StampedEntry {
  const winner = incomingWins(existing, incoming) ? incoming : existing;
  const num = (v: unknown) => (typeof v === "number" ? v : 0);
  return {
    entry: {
      ...winner.entry,
      lookup_count: Math.max(num(existing.entry.lookup_count), num(incoming.entry.lookup_count)),
      lapses: Math.max(num(existing.entry.lapses), num(incoming.entry.lapses)),
    },
    receivedAt: winner.receivedAt,
  };
}
