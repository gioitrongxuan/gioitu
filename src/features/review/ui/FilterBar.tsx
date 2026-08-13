// Filter Bar (SPEC 3, 4.3): highlight/limit due words and choose cloud order.
// Highlighting/sorting does NOT change tag colours (colour stays by lookup_count).
// Desktop trải phẳng thành một hàng; màn hẹp gom mọi control vào popover sau
// nút "Bộ lọc" (CSS quyết định — cùng một markup) để chỉ còn [Bộ lọc][Ôn tập].

import { useMemo, useState } from "react";
import {
  buildCloud,
  groupByPeriod,
  groupBySrsTier,
  isVisibleOnCloud,
  CloudSort,
  CloudLang,
  CloudGrouping,
  CloudTag,
} from "../domain/wordcloud";
import { labelCounts, LabelFilter } from "../domain/labels";
import { CloudViewControls } from "./CloudViewControls";
import { exportWordCloudPng, ExportCloudSection, ExportCloudTag } from "./wordCloudPng";
import { useTheme } from "@/features/theme/ThemeProvider";
import { ChevronDownIcon, DownloadIcon, HeadphonesIcon } from "@/shared/ui/icons";
import { VocabEntry } from "@/shared/types";
import "./review.css";

interface Props {
  /** Toàn bộ entry của bản đồ — chỉ dùng cho nút "Tải ảnh PNG" (issue #161). */
  entries: VocabEntry[];
  dueCount: number;
  highlightDue: boolean;
  onlyDue: boolean;
  sort: CloudSort;
  lang: CloudLang;
  /** Nhãn đang lọc (#249) — "all" khi không lọc. */
  label: LabelFilter;
  grouping: CloudGrouping;
  onToggleHighlight: () => void;
  onToggleOnlyDue: () => void;
  onSortChange: (sort: CloudSort) => void;
  onLangChange: (lang: CloudLang) => void;
  onLabelChange: (label: LabelFilter) => void;
  onGroupingChange: (grouping: CloudGrouping) => void;
  onStartReview: () => void;
  /** Số từ nghe được ở phạm vi hiện tại — 0 thì không mở được chế độ nghe. */
  listenCount: number;
  onStartListen: () => void;
}

export function FilterBar({
  entries,
  dueCount,
  highlightDue,
  onlyDue,
  sort,
  lang,
  label,
  grouping,
  onToggleHighlight,
  onToggleOnlyDue,
  onSortChange,
  onLangChange,
  onLabelChange,
  onGroupingChange,
  onStartReview,
  listenCount,
  onStartListen,
}: Props) {
  const [open, setOpen] = useState(false);
  const { theme } = useTheme();
  // Vẽ + toBlob() là bất đồng bộ — chặn double-click, không phải vì việc chậm.
  const [exporting, setExporting] = useState(false);
  const hasCloudTags = useMemo(() => entries.some(isVisibleOnCloud), [entries]);
  // Chỉ những từ đang hiện trên bản đồ mới cấp nhãn cho bộ lọc — nhãn của từ đã
  // thuộc mà lọt vào đây thì chọn xong chỉ ra bản đồ trống.
  const labels = useMemo(() => labelCounts(entries.filter(isVisibleOnCloud)), [entries]);

  // Soi gương pipeline của WordCloud.tsx (buildCloud → lọc onlyDue → nhóm) để
  // ảnh xuất đúng cái đang hiển thị. Trạng thái highlight/dim là tín hiệu hành
  // động nhất thời, không phải dữ liệu — cố ý không tái tạo trong ảnh.
  const exportSections = (): ExportCloudSection[] => {
    const now = Date.now();
    const tags = buildCloud(entries, { now, sort, lang, label }).filter((t) => (onlyDue ? t.due : true));
    const toTag = ({ entry, shade, hasBadge }: CloudTag): ExportCloudTag => ({ term: entry.term, shade, hasBadge });
    if (grouping === "none") return [{ tags: tags.map(toTag) }];
    const groups = grouping === "srs" ? groupBySrsTier(tags) : groupByPeriod(tags, grouping, now);
    return groups.map((g) => ({ label: g.label, tags: g.items.map(toTag) }));
  };

  const handleExport = async () => {
    const sections = exportSections();
    // Bộ lọc hiện hành có thể vét sạch cloud — đừng tải về một ảnh trắng.
    if (sections.every((s) => s.tags.length === 0)) return;
    setExporting(true);
    try {
      await exportWordCloudPng(sections, theme);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="filter-bar">
      <button
        type="button"
        className="chip-toggle filter-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Bộ lọc <span className="caret" aria-hidden><ChevronDownIcon /></span>
      </button>
      {open && <div className="menu-backdrop" onClick={() => setOpen(false)} />}
      <div className={`filter-controls${open ? " open" : ""}`}>
        <CloudViewControls
          lang={lang}
          grouping={grouping}
          onLangChange={onLangChange}
          onGroupingChange={onGroupingChange}
          enableSrsTier
        />
        <label className="sort-select">
          Sắp xếp
          <select value={sort} onChange={(e) => onSortChange(e.target.value as CloudSort)}>
            <option value="recent">Mới tra nhất</option>
            <option value="frequency">Tần suất tra</option>
          </select>
        </label>
        {/* Kho chưa có nhãn nào thì không dựng ô lọc rỗng cho chật thanh. */}
        {labels.length > 0 && (
          <label className="sort-select">
            Nhãn
            <select value={label} onChange={(e) => onLabelChange(e.target.value as LabelFilter)}>
              <option value="all">Tất cả</option>
              <option value="none">Chưa gắn nhãn</option>
              {labels.map(({ label: name, count }) => (
                <option key={name} value={name}>{`${name} (${count})`}</option>
              ))}
            </select>
          </label>
        )}
        {/* Chip bật/tắt thay checkbox — cùng ngôn ngữ pill với phần còn lại. */}
        <button type="button" className={`chip-toggle${highlightDue ? " on" : ""}`} aria-pressed={highlightDue} onClick={onToggleHighlight}>
          Nổi bật từ cần ôn
        </button>
        <button type="button" className={`chip-toggle${onlyDue ? " on" : ""}`} aria-pressed={onlyDue} onClick={onToggleOnlyDue}>
          Chỉ hiện từ cần ôn
        </button>
        <button type="button" className="export-btn" onClick={handleExport} disabled={exporting || !hasCloudTags}>
          <DownloadIcon size={16} />
          {exporting ? "Đang xuất…" : "Tải ảnh PNG"}
        </button>
      </div>
      <button className="review-btn" disabled={dueCount === 0} onClick={onStartReview}>
        Ôn tập hôm nay ({dueCount})
      </button>
      {/* Nghe không phụ thuộc hạn ôn: nó chạy trên toàn bộ từ đang học, nên
          vẫn bấm được cả khi hôm nay không còn từ đến hạn. */}
      <button className="listen-btn" disabled={listenCount === 0} onClick={onStartListen}>
        <HeadphonesIcon size={16} />
        Nghe
      </button>
    </div>
  );
}
