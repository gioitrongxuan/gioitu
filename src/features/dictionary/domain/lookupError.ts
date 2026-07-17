// Phân biệt "tra không được vì mạng/máy chủ" với "tra xong nhưng không có từ".
// Nguồn Server có thể vắng mặt (mất mạng, deploy tĩnh, máy chủ lỗi); khi đó ta
// KHÔNG được kết luận "không tìm thấy" — đó là lời mời "Tự định nghĩa" sai chỗ.
// Vì vậy một lượt tra trả kèm cờ lỗi thay vì nuốt lỗi thành mảng rỗng.

/** Vì sao một lượt tra thất bại. Hiện chỉ có lỗi mạng/máy chủ (gộp làm một). */
export type LookupErrorKind = "network";

/** Kết quả một lượt tra: danh sách khớp + cờ lỗi (null khi tra được, kể cả rỗng). */
export interface LookupResult<T> {
  results: T[];
  error: LookupErrorKind | null;
}

/** Tra thành công (results có thể rỗng — thật sự không có từ nào khớp). */
export const found = <T>(results: T[]): LookupResult<T> => ({ results, error: null });

/** Tra thất bại vì lỗi; không có kết quả nào tin được nên results luôn rỗng. */
export const lookupFailed = <T>(error: LookupErrorKind): LookupResult<T> => ({
  results: [],
  error,
});

/** Thông điệp tiếng Việt hiển thị cho người dùng khi một lượt tra thất bại. */
export interface LookupErrorMessage {
  /** Nguyên nhân, một câu ngắn. */
  title: string;
  /** Gợi ý hành động — kể cả chuyển nguồn sang "Trên máy" để tra offline. */
  hint: string;
}

export function describeLookupError(error: LookupErrorKind): LookupErrorMessage {
  // Chỉ nguồn Server mới sinh lỗi này (nguồn "Trên máy" chạy offline từ
  // IndexedDB), nên lời khuyên chuyển sang "Trên máy" luôn hợp lệ.
  switch (error) {
    case "network":
      return {
        title: "Không kết nối được máy chủ từ điển.",
        hint: "Kiểm tra kết nối mạng, hoặc chuyển nguồn sang “Trên máy” để tra offline. Bạn cũng có thể tự định nghĩa từ này:",
      };
  }
}
