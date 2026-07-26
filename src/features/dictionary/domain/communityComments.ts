// Bình luận cộng đồng nhập kèm từ điển (Mazii) — logic thuần cho thứ tự hiển
// thị. Không phụ thuộc React/DOM.

import type { DictComment } from "@/shared/dictionary";

/** Thiếu `likes` thì coi là 0: dữ liệu nhập từ nguồn ngoài không phải lúc nào
 *  cũng đủ trường, và `undefined` lọt vào phép trừ sẽ cho NaN — sort hỏng câm. */
function likeCount(comment: DictComment): number {
  return Number.isFinite(comment.likes) ? comment.likes : 0;
}

/**
 * Xếp bình luận nhiều like lên trước, để phần thu gọn hiện đúng ý kiến được
 * cộng đồng tán thành nhất thay vì ba cái đầu tuỳ nguồn nhập. Bằng like thì
 * giữ nguyên thứ tự gốc (Array.sort ổn định) — không tự ý xáo thêm. Trả mảng
 * mới, không đột biến `entry.comments`.
 */
export function rankByLikes(comments: DictComment[]): DictComment[] {
  return [...comments].sort((a, b) => likeCount(b) - likeCount(a));
}
