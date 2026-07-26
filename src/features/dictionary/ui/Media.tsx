// Nội dung cộng đồng nhập từ Mazii: gallery ảnh minh hoạ và bình luận.

import { useState } from "react";
import type { DictImage, DictComment } from "@/shared/dictionary";

/** Số bình luận cộng đồng hiện sẵn; từ phổ biến có hàng chục cái, đổ hết ra thì
 *  phần nghĩa bị đẩy khỏi tầm mắt. Phần còn lại nằm sau nút "Xem thêm". */
const COLLAPSED_COMMENT_COUNT = 3;

/** Gallery ảnh minh hoạ (read-only, hotlink). Ẩn ảnh hỏng; mở lớn ở tab mới. */
export function ImageGallery({ images }: { images?: DictImage[] }) {
  if (!images || !images.length) return null;
  return (
    <div className="word-images" aria-label="Ảnh minh hoạ">
      {images.map((im, i) => (
        <a key={i} className="word-image" href={im.url} target="_blank" rel="noopener noreferrer">
          <img
            src={im.url}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(e) => {
              const a = e.currentTarget.closest(".word-image");
              if (a instanceof HTMLElement) a.style.display = "none";
            }}
          />
        </a>
      ))}
    </div>
  );
}

/** Bình luận cộng đồng (read-only, nhập từ Mazii). Chỉ hiện vài cái đầu, phần
 *  còn lại mở ra khi bấm — dữ liệu đã có sẵn nên chỉ là chuyện thu/mở. */
export function CommentList({ comments }: { comments?: DictComment[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!comments || !comments.length) return null;
  const shown = expanded ? comments : comments.slice(0, COLLAPSED_COMMENT_COUNT);
  const hiddenCount = comments.length - shown.length;
  return (
    <div className="word-comments">
      <div className="word-comments-head">
        Bình luận cộng đồng ({comments.length}) <span className="muted">· Mazii</span>
      </div>
      <ul>
        {shown.map((c, i) => (
          <li className="comment" key={i}>
            {c.avatar && (
              <img
                className="comment-avatar"
                src={c.avatar}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.style.visibility = "hidden";
                }}
              />
            )}
            <div className="comment-body">
              <div className="comment-mean">{c.mean}</div>
              <div className="comment-meta muted">
                {c.author && <span className="comment-author">{c.author}</span>}
                {(c.likes ?? 0) > 0 && <span className="comment-likes">👍 {c.likes}</span>}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {/* Nút đứng dưới danh sách: phần mở thêm mọc xuống, không đẩy chỗ đang đọc. */}
      {comments.length > COLLAPSED_COMMENT_COUNT && (
        <button
          className="link comment-more"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Thu gọn" : `Xem thêm (${hiddenCount})`}
        </button>
      )}
    </div>
  );
}
