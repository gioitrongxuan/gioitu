// Trạng thái một lần đồng bộ dữ liệu học với cloud. Trước đây mọi thất bại
// (offline, token hết hạn) bị nuốt im lặng thành "no-op" và caller vẫn báo "Đã
// đồng bộ" — sai với người dùng. Ba trạng thái dưới đây để phản hồi trung thực
// và tách riêng cách xử lý token hết hạn. Logic thuần, không I/O, dễ test.

/**
 *  - ok:            liên lạc được server, dữ liệu đã đồng bộ hai chiều.
 *  - offline:       không tới được server (mất mạng / máy chủ lỗi / chưa đăng
 *                   nhập) — bản local vẫn nguyên, thử lại sau.
 *  - unauthorized:  server từ chối vì token hết hạn/không hợp lệ (401) — cần
 *                   đăng nhập lại (JWT chỉ sống 30 ngày).
 */
export type SyncStatus = "ok" | "offline" | "unauthorized";

// Mã HTTP duy nhất ta phân biệt riêng: token hết hạn/không hợp lệ.
const HTTP_UNAUTHORIZED = 401;

/**
 * Quy một phản hồi HTTP về trạng thái đồng bộ. 2xx (`res.ok`) → ok; 401 →
 * unauthorized; mọi mã còn lại (5xx, 4xx khác) gộp về offline: với người dùng hệ
 * quả giống mất mạng — dữ liệu ở lại máy, thử lại sau.
 */
export function classifyResponse(res: { ok: boolean; status: number }): SyncStatus {
  if (res.ok) return "ok";
  if (res.status === HTTP_UNAUTHORIZED) return "unauthorized";
  return "offline";
}

// Hai chữ số cho giờ/phút ("09:05" chứ không "9:5").
const CLOCK_PAD = 2;

/**
 * "lần cuối hh:mm" gọn cho nhãn cạnh nút Đồng bộ; null (chưa đồng bộ lần nào) →
 * chuỗi rỗng để caller ẩn hẳn phần này. Giờ theo đồng hồ máy người dùng, 24h.
 */
export function formatLastSync(ts: number | null): string {
  if (ts == null) return "";
  const at = new Date(ts);
  const hh = String(at.getHours()).padStart(CLOCK_PAD, "0");
  const mm = String(at.getMinutes()).padStart(CLOCK_PAD, "0");
  return `lần cuối ${hh}:${mm}`;
}
