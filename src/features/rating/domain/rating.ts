// Logic thuần cho đánh giá ứng dụng (#245): thang sao, kiểm tra bản nháp trước
// khi gửi, và biến tổng hợp của server thành các hàng vẽ được. Tách khỏi UI để
// test được, và để form không tự bịa luật riêng — server
// (`server/src/features/rating/ratingStore.ts`) kiểm lại đúng các luật này.

export type Stars = 1 | 2 | 3 | 4 | 5;

/** Thang sao theo thứ tự tăng dần; nhãn là chữ người dùng đọc. */
export const RATING_STARS: { stars: Stars; label: string }[] = [
  { stars: 1, label: "Rất tệ" },
  { stars: 2, label: "Chưa tốt" },
  { stars: 3, label: "Bình thường" },
  { stars: 4, label: "Tốt" },
  { stars: 5, label: "Rất tốt" },
];

/** Trần độ dài nhận xét kèm theo — khớp MAX_NOTE của server. */
export const RATING_NOTE_MAX = 500;

/** Nhãn của một mức sao. Mức lạ (dữ liệu cũ/hỏng) trả về chuỗi rỗng. */
export function starLabel(stars: number): string {
  return RATING_STARS.find((s) => s.stars === stars)?.label ?? "";
}

export interface RatingDraft {
  /** null = chưa chọn sao nào (trạng thái mở form lần đầu). */
  stars: number | null;
  note: string;
}

export type RatingCheck =
  | { ok: true; value: { stars: Stars; note: string } }
  | { ok: false; error: string };

/**
 * Bản nháp đã gửi được chưa. Trả về nhận xét đã trim để chỗ gọi gửi đúng thứ
 * server sẽ lưu (không lệch một dấu cách so với con số đếm ký tự trên form).
 * Nhận xét là **tuỳ chọn**: chấm sao thôi vẫn là một đánh giá hợp lệ.
 */
export function checkRating(draft: RatingDraft): RatingCheck {
  const stars = RATING_STARS.find((s) => s.stars === draft.stars)?.stars;
  if (!stars) return { ok: false, error: "Hãy chọn từ 1 đến 5 sao" };
  const note = draft.note.trim();
  if (note.length > RATING_NOTE_MAX) {
    return { ok: false, error: `Nhận xét quá dài (tối đa ${RATING_NOTE_MAX} ký tự)` };
  }
  return { ok: true, value: { stars, note } };
}

/** Tổng hợp toàn bảng do server tính (danh sách có trần nên không suy từ nó). */
export interface RatingSummary {
  count: number;
  average: number;
  /** Số phiếu theo mức sao, khoá "1".."5". */
  byStar: Record<string, number>;
}

export interface DistributionRow {
  stars: Stars;
  count: number;
  /** Phần trăm trên tổng số phiếu — bề rộng thanh, 0-100. */
  percent: number;
}

/**
 * Phân bố phiếu để vẽ, **5 sao trước** (đọc từ tốt xuống tệ như mọi bảng xếp
 * hạng). Chưa có phiếu nào thì mọi hàng về 0 thay vì NaN — `count === 0` là
 * trạng thái bình thường của một app vừa mở tính năng, không phải lỗi.
 */
export function distributionRows(summary: RatingSummary): DistributionRow[] {
  return [...RATING_STARS]
    .reverse()
    .map(({ stars }) => {
      const count = summary.byStar?.[String(stars)] ?? 0;
      return { stars, count, percent: summary.count > 0 ? (count / summary.count) * 100 : 0 };
    });
}

/**
 * Điểm trung bình một chữ số thập phân, dấu phẩy kiểu Việt. Chưa có phiếu nào
 * thì "—": số 0,0 sẽ đọc như "app bị chấm 0 sao" trong khi thật ra chưa ai chấm.
 */
export function formatAverage(summary: RatingSummary): string {
  if (summary.count === 0) return "—";
  return summary.average.toFixed(1).replace(".", ",");
}
