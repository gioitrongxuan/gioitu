// Quyết định có hỏi trước khi gộp dữ liệu học của phiên khách vào tài khoản vừa
// đăng nhập. Máy dùng chung dễ trộn dữ liệu người khác: nếu trên máy đang có
// tiến trình khách, đăng nhập KHÔNG được lặng lẽ nuốt nó vào tài khoản mới —
// phải hỏi. Logic thuần ở đây để test được; App bọc `window.confirm` quanh nó.

/**
 * Câu hỏi xác nhận trước khi adopt dữ liệu khách, hoặc `null` khi không cần hỏi
 * (không có gì để gộp). Nêu rõ số từ và nhắc bấm Huỷ trên máy dùng chung.
 */
export function guestAdoptionPrompt(guestEntryCount: number): string | null {
  if (guestEntryCount <= 0) return null;
  return (
    `Máy này đang có ${guestEntryCount} từ học ở chế độ khách. ` +
    `Gộp số từ này vào tài khoản của bạn?\n\n` +
    `Chọn Huỷ nếu đây là máy dùng chung và dữ liệu đó không phải của bạn.`
  );
}
