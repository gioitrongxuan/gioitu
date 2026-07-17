// Xin trình duyệt đừng tự thu hồi IndexedDB khi máy thiếu dung lượng. Với người
// dùng khách, IndexedDB là BẢN DUY NHẤT của dữ liệu học (chưa có cloud) — mất là
// mất trắng. "Persistent storage" (Storage API) hạ rủi ro đó: trình duyệt cam
// kết chỉ xoá khi người dùng chủ động xoá, không tự dọn để giải phóng chỗ.

// Nhớ kết quả cho cả phiên: trạng thái persisted không đổi trong một phiên, và
// một số trình duyệt tính lời-gọi-persist là một lần xin quyền — không hỏi lại.
let persistRequest: Promise<boolean> | null = null;

/**
 * Xin trình duyệt cấp lưu trữ bền. Trả về `true` nếu đã/được cấp, `false` nếu bị
 * từ chối hoặc không hỗ trợ. KHÔNG bao giờ ném lỗi — lưu trữ bền là "có thì tốt";
 * thiếu API (Safari cũ, môi trường test) thì app vẫn chạy như thường.
 */
export function requestPersistentStorage(): Promise<boolean> {
  if (persistRequest) return persistRequest;
  persistRequest = (async () => {
    try {
      const storage = typeof navigator !== "undefined" ? navigator.storage : undefined;
      if (!storage?.persist) return false;
      // Đã bền sẵn thì khỏi gọi persist() lần nữa (tránh nhắc quyền thừa).
      if (storage.persisted && (await storage.persisted())) return true;
      return await storage.persist();
    } catch {
      return false;
    }
  })();
  return persistRequest;
}

/** Cho test: quên kết quả đã nhớ để lần gọi sau chạy lại thật. */
export function _resetPersistRequest(): void {
  persistRequest = null;
}
