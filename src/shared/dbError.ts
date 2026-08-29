// Diễn giải lỗi mở IndexedDB thành câu người dùng đọc được, kèm cách thoát ra.
// Hàm thuần (không chạm DOM/IDB) để test được ở môi trường node.
//
// Vì sao cần: `getDb()` hỏng là hỏng TOÀN BỘ dữ liệu học — store `user_data`
// không đọc được thì `loaded` không bao giờ bật, và màn hình đứng ở skeleton
// vĩnh viễn, im lặng. Người dùng nhìn thấy "app treo" rồi đoán là lỗi máy chủ,
// trong khi máy chủ không dính dáng gì: bản đồ từ đọc thẳng từ IndexedDB.

/** Mở CSDL bằng version THẤP HƠN bản đang có trên máy — IndexedDB từ chối thẳng.
 *  Xảy ra khi một bản app mới hơn đã nâng cấp CSDL, rồi người dùng quay lại bản
 *  cũ (đổi nhánh, mở bản deploy cũ, service worker phục vụ chunk cũ). */
const VERSION_ERROR =
  "Dữ liệu trên máy đã được một phiên bản app MỚI HƠN nâng cấp, nên bản đang chạy " +
  "không mở được. Hãy tải lại trang bằng bản mới nhất (Ctrl/Cmd + Shift + R). Dữ " +
  "liệu học của bạn vẫn còn nguyên — không xoá dữ liệu trình duyệt.";

/** Chờ mãi không mở được: gần như luôn là một tab khác đang giữ CSDL ở version cũ,
 *  chặn nâng cấp (`onblocked`). Không có cách nào ép tab kia đóng từ đây. */
export const DB_BLOCKED_MESSAGE =
  "Không mở được dữ liệu trên máy. Thường là do một tab Gioitu khác đang mở ở " +
  "phiên bản cũ và chặn việc nâng cấp — đóng các tab Gioitu khác rồi tải lại trang.";

/** Bao lâu thì coi là "treo" và nói cho người dùng biết. Đủ dài để một lần mở
 *  chậm bình thường (máy yếu, CSDL lớn) không hiện báo động giả. */
export const DB_SLOW_MS = 8000;

export function describeDbError(error: unknown): string {
  const name = (error as { name?: string } | null)?.name;
  if (name === "VersionError") return VERSION_ERROR;
  if (name === "QuotaExceededError")
    return "Máy đã hết chỗ trống cho dữ liệu ngoại tuyến. Dọn bớt dung lượng trình duyệt rồi tải lại trang.";
  return "Không đọc được dữ liệu học trên máy. Tải lại trang; nếu vẫn lỗi, hãy báo lại kèm nội dung Console.";
}
