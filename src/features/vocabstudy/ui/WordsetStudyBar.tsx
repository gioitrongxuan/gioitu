// Khối "Học bộ này" trên trang Học từ vựng: bấm một cái là mở phiên ôn gồm thẻ
// đến hạn của bộ, cộng đúng số từ mới bạn chọn.
//
// Vì sao phải tự chọn số từ mới thay vì có hạn mức ngày: bộ nhập ngoài không
// phải lịch học của ai cả — hôm nay rảnh thì lấy 50, tuần bận thì 0 mà vẫn ôn
// tiếp phần đã học. Hạn mức ngày kiểu Anki chỉ đúng khi bộ là *khoá học* của
// bạn, còn ở đây nó là danh sách tham chiếu bạn tự rút từ.

import { useState } from "react";
import { DEFAULT_NEW_PER_SESSION, MAX_NEW_PER_SESSION, WordsetStudyCounts } from "../domain/wordsetSrs";

export function WordsetStudyBar({
  counts,
  starting,
  onStart,
}: {
  counts: WordsetStudyCounts;
  starting: boolean;
  /** Mở phiên với `newCount` từ mới. Trả về khi phiên đã mở (hoặc đã bỏ cuộc). */
  onStart: (newCount: number) => void;
}) {
  const [newCount, setNewCount] = useState(DEFAULT_NEW_PER_SESSION);

  const canStart = counts.due > 0 || (counts.unstarted > 0 && newCount > 0);
  // Xin nhiều hơn số còn lại thì lấy hết phần còn lại — không phải báo lỗi, ý
  // định đã rõ ràng.
  const willAdd = Math.min(newCount, counts.unstarted);

  if (counts.due === 0 && counts.unstarted === 0) {
    return <p className="wordset-study-done muted">Bộ này đã đưa vào học hết và chưa có thẻ nào đến hạn.</p>;
  }

  return (
    <div className="wordset-study">
      <p className="wordset-study-counts">
        {counts.due > 0 ? (
          <>
            <b>{counts.due.toLocaleString("vi-VN")}</b> thẻ đến hạn
          </>
        ) : (
          <span className="muted">Chưa có thẻ nào đến hạn</span>
        )}
        {counts.unstarted > 0 && (
          <>
            {" · "}
            {counts.unstarted.toLocaleString("vi-VN")} từ chưa đưa vào học
          </>
        )}
      </p>

      <div className="wordset-study-actions">
        {counts.unstarted > 0 && (
          <label className="wordset-study-new">
            Thêm
            <input
              type="number"
              min={0}
              max={MAX_NEW_PER_SESSION}
              value={newCount}
              onChange={(e) => setNewCount(clamp(Number(e.target.value)))}
              inputMode="numeric"
            />
            từ mới
          </label>
        )}
        <button className="primary" disabled={!canStart || starting} onClick={() => onStart(willAdd)}>
          {starting ? "Đang mở…" : "Bắt đầu học"}
        </button>
      </div>

      <p className="muted wordset-study-note">
        Từ mới lấy theo thứ tự trong bộ. Thẻ tạo ra nằm chung vốn từ và đồng bộ như mọi thẻ khác, nhưng không hiện trên
        Bản đồ từ — bản đồ dành cho những từ bạn đã phải tra.
      </p>
    </div>
  );
}

/** Giữ số từ mới trong khoảng hợp lệ; ô trống hay chữ rác về 0. */
function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(MAX_NEW_PER_SESSION, Math.floor(value)));
}
