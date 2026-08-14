// Popover mini của một thẻ Word Cloud (#159): nghĩa ngắn + hành động nhanh
// (ôn / đã thuộc / xoá) — thay cho tooltip `title` và "Chế độ xoá" toàn cục.
// Hai chế độ mở:
//   - hover (chuột): thẻ tin nhất thời, KHÔNG cướp focus; Esc hoặc rời chuột
//     thì đóng, rê vào trong popover giữ nó mở (onHoverChange).
//   - pinned (long-press / chuột phải): hành xử như overlay đúng hệ — dùng
//     useDialog chung (Esc đóng, focus nút đầu, trả focus) + backdrop bấm ngoài.

import { useEffect, type RefObject } from "react";
import { tagPopoverContent, CloudTag } from "../domain/wordcloud";
import { popoverPlacement, AnchorRect } from "../domain/tagPopover";
import { entryLabels } from "../domain/labels";
import { useDialog } from "@/shared/ui/useDialog";
import { TrashIcon } from "@/shared/ui/icons";
import { VocabEntry } from "@/shared/types";
import "./labels.css";

interface Props {
  tag: CloudTag;
  anchor: AnchorRect;
  /** true = mở bằng long-press/chuột phải (ghim như menu); false = hover. */
  pinned: boolean;
  /** Mốc thời gian tính "đến hạn"/"ôn sau X" — caller inject để test được. */
  now: number;
  onClose: () => void;
  /** Ôn ngay chỉ mỗi từ này — nút chỉ hiện khi từ đến hạn. */
  onReview?: (entry: VocabEntry) => void;
  onMarkKnown: (entry: VocabEntry) => void;
  onDelete: (entry: VocabEntry) => void;
  /** Mở hộp thoại gắn nhãn cho từ này (#249). */
  onEditLabels: (entry: VocabEntry) => void;
  /** Chuột đang đậu trong popover (chế độ hover) — báo cloud giữ popover mở. */
  onHoverChange?: (inside: boolean) => void;
}

export function TagPopover(props: Props) {
  return props.pinned ? <PinnedPopover {...props} /> : <HoverPopover {...props} />;
}

function PinnedPopover(props: Props) {
  const dialogRef = useDialog<HTMLDivElement>(props.onClose);
  return (
    <>
      <div className="menu-backdrop" onClick={props.onClose} />
      <PopoverCard {...props} dialogRef={dialogRef} />
    </>
  );
}

function HoverPopover(props: Props) {
  const { onClose } = props;
  // Popover hover không cướp focus (không qua useDialog) nên Esc bắt ở document.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  return <PopoverCard {...props} />;
}

function PopoverCard({
  tag,
  anchor,
  pinned,
  now,
  onClose,
  onReview,
  onMarkKnown,
  onDelete,
  onEditLabels,
  onHoverChange,
  dialogRef,
}: Props & { dialogRef?: RefObject<HTMLDivElement> }) {
  const { entry } = tag;
  const content = tagPopoverContent(entry, now);
  const labels = entryLabels(entry);
  const pos = popoverPlacement(anchor, { width: window.innerWidth, height: window.innerHeight });
  // Mỗi hành động chạy xong thì đóng popover — nó là menu một phát, không phải panel.
  const act = (run: (e: VocabEntry) => void) => () => {
    run(entry);
    onClose();
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal={pinned || undefined}
      aria-label={`Từ “${entry.term}”`}
      className="tag-popover"
      style={{ left: pos.left, top: pos.top, bottom: pos.bottom }}
      onPointerEnter={() => onHoverChange?.(true)}
      onPointerLeave={() => onHoverChange?.(false)}
    >
      <div className="tag-popover-head">
        <span className="tag-popover-term" lang={entry.term_lang === "ja" ? "ja" : undefined}>
          {entry.term}
        </span>
        {content.reading && <span className="tag-popover-reading" lang="ja">{content.reading}</span>}
      </div>
      {content.gloss && <p className="tag-popover-gloss">{content.gloss}</p>}
      {/* "đến hạn" là lý do thẻ đang sáng viền — tách khỏi số lần tra để nó
          không chìm trong cùng một dòng xám. */}
      <p className="tag-popover-meta">
        {content.schedule && (
          <>
            <span className={tag.due ? "is-due" : undefined}>{content.schedule}</span>
            {" · "}
          </>
        )}
        {content.lookupText}
      </p>
      {labels.length > 0 && (
        <ul className="label-chips" aria-label="Nhãn">
          {labels.map((label) => (
            <li key={label}><span className="label-chip">{label}</span></li>
          ))}
        </ul>
      )}
      <div className="tag-popover-actions">
        {tag.due && onReview && (
          <button type="button" className="chip-toggle" onClick={act(onReview)}>
            Ôn từ này
          </button>
        )}
        <button type="button" className="chip-toggle" onClick={act(onEditLabels)}>
          Nhãn
        </button>
        <button type="button" className="chip-toggle" onClick={act(onMarkKnown)}>
          Đã thuộc
        </button>
        {/* Icon + màu --warn: nút phá huỷ phải khác hẳn ba nút lành tính bên cạnh,
            và khác cả khi người dùng không phân biệt được màu (#265). */}
        <button type="button" className="chip-toggle danger" onClick={act(onDelete)}>
          <TrashIcon size={14} />
          Xoá
        </button>
      </div>
    </div>
  );
}
