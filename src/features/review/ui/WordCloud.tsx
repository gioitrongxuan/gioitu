// Word Cloud (SPEC 4.3): flex-wrap tags, equal height, width by word length.
// Colour = log-normalized lookup_count; badge = RELAPSED; highlight = due.
// Can be split by language and grouped into time buckets (ngày/tháng/năm).
// Mỗi thẻ có popover mini (#159): hover mở thẻ tin nhanh; long-press/chuột phải
// ghim popover kèm hành động (ôn / đã thuộc / xoá) — thay "Chế độ xoá" toàn cục.

import { memo, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { buildCloud, groupByPeriod, groupBySrsTier, dueEntriesInGroup, CloudSort, CloudLang, CloudGrouping, CloudTag } from "../domain/wordcloud";
import {
  HOVER_CLOSE_DELAY_MS,
  HOVER_OPEN_DELAY_MS,
  LONG_PRESS_MS,
  isPressMoveCancelling,
  AnchorRect,
  PressPoint,
} from "../domain/tagPopover";
import { TagPopover } from "./TagPopover";
import { heatBackground, heatTextColor } from "@/features/theme/domain/theme";
import { useTheme } from "@/features/theme/ThemeProvider";
import { VocabEntry } from "@/shared/types";
import "./cloud.css";

interface Props {
  entries: VocabEntry[];
  /** When true, due-for-review words are highlighted (filter, SPEC 4.3). */
  highlightDue: boolean;
  /** When true, show ONLY due words. */
  onlyDue: boolean;
  /** Ordering of the cloud (recent-first by default). */
  sort: CloudSort;
  /** Restrict the cloud to one language ("all" = mixed). */
  lang: CloudLang;
  /**
   * Nhóm cloud: theo thời gian (day/month/year), theo tầng trí nhớ ("srs" —
   * Khu vườn ký ức) hoặc "none" = phẳng.
   */
  grouping: CloudGrouping;
  onSelect: (entry: VocabEntry) => void;
  /** "Xoá" trong popover của thẻ — "Chế độ xoá" toàn cục đã gỡ (#159). */
  onDelete: (entry: VocabEntry) => void;
  /** "Đã thuộc" trong popover: graduate thẳng từ này sang LEARNED. */
  onMarkKnown: (entry: VocabEntry) => void;
  /**
   * Bắt đầu phiên ôn với một tập con entries đến hạn: nút "Ôn N từ này" theo
   * tầng (grouping "srs") hoặc "Ôn từ này" trong popover của một thẻ (#159).
   */
  onReview?: (entries: VocabEntry[]) => void;
}

const tagKey = (t: CloudTag) => `${t.entry.term}:${t.entry.term_lang}`;

interface PopoverState {
  key: string;
  tag: CloudTag;
  anchor: AnchorRect;
  /** true = ghim bằng long-press/chuột phải; false = mở bằng hover. */
  pinned: boolean;
}

export const WordCloud = memo(function WordCloud({
  entries,
  highlightDue,
  onlyDue,
  sort,
  lang,
  grouping,
  onSelect,
  onDelete,
  onMarkKnown,
  onReview,
}: Props) {
  const { theme } = useTheme();
  // Badge tái quên là TÍN HIỆU cảnh báo, không phải trang trí: luôn dùng "!" trắng
  // trên nền --warn (styles.css .tag .badge). Skin trang trí KHÔNG được thay glyph
  // này bằng emoji dễ thương — nó làm nhoè tín hiệu (DESIGN §1).
  const relapseGlyph = "!";
  const now = Date.now();
  // buildCloud duyệt + sắp cả nghìn entry — chỉ tính lại khi tập từ, cách sắp
  // xếp hay bộ lọc đổi, không phải mỗi lần cha re-render (vd toast tự tắt).
  const tags = useMemo(
    () => buildCloud(entries, { now, sort, lang }).filter((t) => (onlyDue ? t.due : true)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- "now" cố ý không nằm trong deps: chỉ
    // dùng làm mốc chấm điểm log-decay (tắt theo mặc định), không phải để tick theo thời gian thực.
    [entries, sort, lang, onlyDue],
  );

  const [popover, setPopover] = useState<PopoverState | null>(null);
  // Timer/toạ độ của một lần tương tác — mỗi lúc chỉ có một con trỏ hoạt động
  // nên giữ chung cấp component thay vì per-tag.
  const hoverTimer = useRef<number | undefined>(undefined);
  const closeTimer = useRef<number | undefined>(undefined);
  const pressTimer = useRef<number | undefined>(undefined);
  const pressStart = useRef<PressPoint | null>(null);
  // Long-press vừa nổ thì nuốt cú click theo sau, khỏi mở nhầm panel chi tiết.
  const suppressClick = useRef(false);

  const clearTimer = (t: MutableRefObject<number | undefined>) => {
    if (t.current != null) {
      window.clearTimeout(t.current);
      t.current = undefined;
    }
  };
  const cancelPress = () => {
    clearTimer(pressTimer);
    pressStart.current = null;
  };

  useEffect(
    () => () => [hoverTimer, closeTimer, pressTimer].forEach(clearTimer),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ dọn timer lúc unmount.
    [],
  );

  // Popover neo theo toạ độ viewport (position: fixed) — cuộn/đổi cỡ là neo
  // trôi, đóng luôn thay vì bám theo.
  useEffect(() => {
    if (popover == null) return;
    const close = () => setPopover(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [popover]);

  // Thẻ đang mở popover có thể biến mất giữa chừng (xoá / đã thuộc / lọc) —
  // đóng theo để không trỏ vào entry đã cũ.
  useEffect(() => {
    if (popover != null && !tags.some((t) => tagKey(t) === popover.key)) setPopover(null);
  }, [tags, popover]);

  if (tags.length === 0) {
    return <p className="empty">Chưa có từ nào trên bản đồ. Tra một từ rồi bấm “＋ Học từ này” để bắt đầu.</p>;
  }

  const openPopover = (el: Element, tag: CloudTag, pinned: boolean) => {
    clearTimer(hoverTimer);
    clearTimer(closeTimer);
    setPopover({ key: tagKey(tag), tag, anchor: el.getBoundingClientRect(), pinned });
  };
  const closePopover = () => {
    clearTimer(closeTimer);
    setPopover(null);
  };
  // Chế độ hover: rê vào trong popover giữ nó mở; rê ra thì đóng trễ một nhịp.
  const onPopoverHoverChange = (inside: boolean) => {
    clearTimer(closeTimer);
    if (!inside) closeTimer.current = window.setTimeout(closePopover, HOVER_CLOSE_DELAY_MS);
  };

  const renderTag = (tag: CloudTag) => {
    const { entry, shade, hasBadge, due } = tag;
    const dim = highlightDue && !due;
    const className = `tag${hasBadge ? " relapsed" : ""}${highlightDue && due ? " due" : ""}${dim ? " dimmed" : ""}`;
    const style = { background: heatBackground(shade), color: heatTextColor(shade, theme) };
    const key = tagKey(tag);

    return (
      <button
        key={key}
        role="listitem"
        className={className}
        style={style}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          closePopover();
          onSelect(entry);
        }}
        onPointerEnter={(e) => {
          if (e.pointerType !== "mouse") return;
          // currentTarget chỉ sống trong lúc dispatch — giữ lại cho callback trễ.
          const el = e.currentTarget;
          clearTimer(closeTimer);
          clearTimer(hoverTimer);
          hoverTimer.current = window.setTimeout(() => openPopover(el, tag, false), HOVER_OPEN_DELAY_MS);
        }}
        onPointerLeave={() => {
          clearTimer(hoverTimer);
          cancelPress();
          if (popover?.key === key && !popover.pinned) {
            clearTimer(closeTimer);
            closeTimer.current = window.setTimeout(closePopover, HOVER_CLOSE_DELAY_MS);
          }
        }}
        onPointerDown={(e) => {
          // Chỉ nút chính; chuột phải đã có đường contextmenu riêng.
          if (e.button !== 0) return;
          suppressClick.current = false;
          pressStart.current = { x: e.clientX, y: e.clientY };
          const el = e.currentTarget;
          clearTimer(pressTimer);
          pressTimer.current = window.setTimeout(() => {
            suppressClick.current = true;
            openPopover(el, tag, true);
          }, LONG_PRESS_MS);
        }}
        onPointerMove={(e) => {
          if (pressStart.current != null && isPressMoveCancelling(pressStart.current, { x: e.clientX, y: e.clientY })) {
            cancelPress();
          }
        }}
        onPointerUp={cancelPress}
        onPointerCancel={cancelPress}
        onContextMenu={(e) => {
          // Desktop: chuột phải mở thẳng quick actions. Mobile: chặn menu hệ
          // thống nổ ra giữa chừng long-press; nuốt luôn click nếu trình duyệt
          // vẫn bắn sau đó (pointerdown kế tiếp sẽ reset cờ).
          e.preventDefault();
          cancelPress();
          suppressClick.current = true;
          openPopover(e.currentTarget, tag, true);
        }}
      >
        {hasBadge && <span className="badge" aria-label="Tái quên">{relapseGlyph}</span>}
        <span className="tag-term">{entry.term}</span>
      </button>
    );
  };

  const popoverElement = popover != null && (
    <TagPopover
      tag={popover.tag}
      anchor={popover.anchor}
      pinned={popover.pinned}
      now={now}
      onClose={closePopover}
      onReview={onReview != null ? (entry) => onReview([entry]) : undefined}
      onMarkKnown={onMarkKnown}
      onDelete={onDelete}
      onHoverChange={popover.pinned ? undefined : onPopoverHoverChange}
    />
  );

  if (grouping === "none") {
    return (
      <>
        <div className="word-cloud" role="list">
          {tags.map(renderTag)}
        </div>
        {popoverElement}
      </>
    );
  }

  // "srs" gom theo tầng trí nhớ (Khu vườn ký ức); còn lại gom theo thời gian.
  const groups = grouping === "srs" ? groupBySrsTier(tags) : groupByPeriod(tags, grouping, now);

  return (
    <>
      <div className="cloud-groups">
        {groups.map((group) => {
          // Nút "Ôn N từ này" chỉ hiện ở nhóm "srs" (Khu vườn ký ức) và chỉ khi
          // tầng có từ đến hạn — ôn tầng "Sắp trưởng thành" khi chưa ai due là vô nghĩa.
          const dueInTier = grouping === "srs" ? dueEntriesInGroup(group) : [];
          return (
            <section className="cloud-group" key={group.key}>
              <h3 className="cloud-group-head">
                {group.label}
                {dueInTier.length > 0 && (
                  <button type="button" className="link" onClick={() => onReview?.(dueInTier)}>
                    Ôn {dueInTier.length} từ này
                  </button>
                )}
              </h3>
              <div className="word-cloud" role="list">
                {group.items.map(renderTag)}
              </div>
            </section>
          );
        })}
      </div>
      {popoverElement}
    </>
  );
});
