// Helper lịch/ngày dùng chung cho các domain thống kê (word cloud, review
// stats, streak). Thuần như chính các domain đó: mọi hàm nhận thời điểm qua
// tham số, không tự gọi Date.now(), để logic giữ được tính tất định khi test.
// "Ngày" ở đây luôn là ngày ĐỊA PHƯƠNG (đổi lúc 0h theo máy người dùng) —
// người học sống theo múi giờ của họ, không theo UTC.

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Đệm số về hai chữ số ("7" → "07") cho khoá/nhãn ngày tháng. */
export const pad2 = (n: number): string => String(n).padStart(2, "0");

/** Nửa đêm địa phương của thời điểm `ts`, epoch ms. */
export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Số thứ tự ngày địa phương chứa `ts`. Hai mốc cùng số = cùng một ngày, chênh 1
 * = hai ngày liền kề — phép so "liên tiếp" (streak) chỉ cần cộng trừ số nguyên
 * thay vì đụng tới chuyện đổi giờ.
 */
export function dayNumber(ts: number): number {
  const d = new Date(ts);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
}

/** Nhãn ngày ngắn "dd/MM" cho trục thời gian / nhãn nhóm. */
export function formatDayMonth(ts: number): string {
  const d = new Date(ts);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
}

/**
 * "YYYY-MM-DD" (theo UTC của toISOString) — mảnh ngày ổn định cho tên file /
 * revision xuất ra ngoài, nơi cần chuỗi sắp xếp được hơn là đúng múi giờ.
 */
export function isoDate(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/**
 * "YYYY-MM-DD" theo lịch ĐỊA PHƯƠNG — đúng định dạng giá trị của
 * `<input type="date">`. Khác `isoDate` (cắt theo UTC): ô chọn ngày hiển thị
 * lịch của người dùng nên mốc phải cùng hệ quy chiếu với `startOfDay`.
 */
export function toDateInput(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Nửa đêm địa phương của một chuỗi "YYYY-MM-DD" (giá trị `<input type="date">`),
 * epoch ms; `null` nếu chuỗi rỗng, sai định dạng hoặc không phải ngày có thật.
 */
export function parseDateInput(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m == null) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const at = new Date(year, month - 1, day);
  // Date tự cuộn tràn tháng (31/02 → 03/03) — chỉ nhận khi ba mảnh còn nguyên.
  if (at.getFullYear() !== year || at.getMonth() !== month - 1 || at.getDate() !== day) return null;
  return at.getTime();
}
