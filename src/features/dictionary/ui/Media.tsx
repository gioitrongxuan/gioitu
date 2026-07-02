// Nội dung cộng đồng nhập từ Mazii: gallery ảnh minh hoạ và bình luận.

import type { DictImage, DictComment } from "@/shared/dictionary";

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

/** Bình luận cộng đồng (read-only, nhập từ Mazii). */
export function CommentList({ comments }: { comments?: DictComment[] }) {
  if (!comments || !comments.length) return null;
  return (
    <div className="word-comments">
      <div className="word-comments-head">
        Bình luận cộng đồng <span className="muted">· Mazii</span>
      </div>
      <ul>
        {comments.map((c, i) => (
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
    </div>
  );
}
