// Filter Bar (SPEC 3, 4.3): highlight/limit due words and choose cloud order.
// Highlighting/sorting does NOT change tag colours (colour stays by lookup_count).
//
// Thanh này chỉ có HAI vùng và luôn đọc được như một hàng: bên trái là trạng
// thái xem (nút "Bộ lọc" + hai chip từ-cần-ôn), bên phải là hành động ("Nghe",
// "Hình ảnh", "Ôn tập hôm nay"). Mọi select nằm trong popover "Bộ lọc" ở MỌI bề rộng —
// trước đây desktop trải phẳng 6 select + 5 nút lên một hàng wrap, xuống dòng
// thành những mảnh lệch nhau (nút "Nghe" mồ côi hẳn một dòng). Cùng lý do,
// hai hành động chạy trên đúng tập từ đang hiện (gắn nhãn AI, tải PNG) nằm
// trong panel, ngay dưới bộ lọc dựng nên tập ấy.

import { useMemo, useState } from "react";
import {
  buildCloud,
  groupByPeriod,
  groupBySrsTier,
  isOnWordMap,
  isAddedPreset,
  narrowsAdded,
  ADDED_WINDOW_LABEL,
  AddedWindow,
  AddedWindowPreset,
  EMPTY_ADDED_RANGE,
  CloudSort,
  CloudLang,
  CloudGrouping,
  CloudTag,
} from "../domain/wordcloud";
import { labelCounts, LabelCount, LabelFilter } from "../domain/labels";
import { CloudViewControls } from "./CloudViewControls";
import { exportWordCloudPng, ExportCloudSection, ExportCloudTag } from "./wordCloudPng";
import { useTheme } from "@/features/theme/ThemeProvider";
import { useDialog } from "@/shared/ui/useDialog";
import { ChevronDownIcon, DownloadIcon, FilterIcon, HeadphonesIcon, ImageIcon } from "@/shared/ui/icons";
import { VocabEntry } from "@/shared/types";
import { toDateInput } from "@/shared/date";
import "./review.css";

// Giá trị riêng của mục "Khoảng ngày…" trong select — không trùng mã cửa sổ nào
// dựng sẵn, chỉ sống trong FilterBar (state thật là một AddedRange).
const RANGE_OPTION = "range";

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
  /** Chỉ giữ từ được thêm trong cửa sổ này — thu hẹp cả bản đồ lẫn phiên ôn. */
  addedWindow: AddedWindow;
  onToggleHighlight: () => void;
  onToggleOnlyDue: () => void;
  onSortChange: (sort: CloudSort) => void;
  onLangChange: (lang: CloudLang) => void;
  onLabelChange: (label: LabelFilter) => void;
  onGroupingChange: (grouping: CloudGrouping) => void;
  onAddedWindowChange: (added: AddedWindow) => void;
  onStartReview: () => void;
  /** Số từ nghe được ở phạm vi hiện tại — 0 thì không mở được chế độ nghe. */
  listenCount: number;
  onStartListen: () => void;
  /**
   * Số từ ỨNG VIÊN của chế độ hình ảnh (#263) — không phải số từ thật sự có
   * ảnh: ảnh nằm ở từ điển máy chủ, muốn biết phải tra từng từ. Trình chiếu tự
   * bỏ qua từ trắng ảnh, ở đây chỉ cần biết có từ nào để chiếu hay không.
   */
  imageCount: number;
  onStartImages: () => void;
  /**
   * Gắn nhãn hàng loạt bằng AI (#249) cho ĐÚNG tập từ đang hiện trên bản đồ —
   * Filter Bar là nơi duy nhất biết đủ mọi bộ lọc nên nó tự dựng tập ấy. Endpoint
   * AI cần đăng nhập, chưa đăng nhập thì không dựng nút để khỏi mời gọi suông.
   */
  canBulkLabel: boolean;
  onBulkLabel: (entries: VocabEntry[]) => void;
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
  addedWindow,
  onToggleHighlight,
  onToggleOnlyDue,
  onSortChange,
  onLangChange,
  onLabelChange,
  onGroupingChange,
  onAddedWindowChange,
  onStartReview,
  listenCount,
  onStartListen,
  imageCount,
  onStartImages,
  canBulkLabel,
  onBulkLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const { theme } = useTheme();
  // Vẽ + toBlob() là bất đồng bộ — chặn double-click, không phải vì việc chậm.
  const [exporting, setExporting] = useState(false);
  const hasCloudTags = useMemo(() => entries.some(isOnWordMap), [entries]);
  // Chỉ những từ đang hiện trên bản đồ mới cấp nhãn cho bộ lọc — nhãn của từ đã
  // thuộc mà lọt vào đây thì chọn xong chỉ ra bản đồ trống.
  const labels = useMemo(() => labelCounts(entries.filter(isOnWordMap)), [entries]);

  // Con số trên nút "Bộ lọc" chỉ đếm những bộ lọc LÀM MẤT từ khỏi bản đồ (ngôn
  // ngữ, nhãn, cửa sổ thêm). "Nhóm theo"/"Sắp xếp" đổi cách bày chứ không giấu
  // gì — nhìn bản đồ là thấy — nên đếm chúng vào đây chỉ làm loãng tín hiệu
  // "đang có thứ bị che" mà panel đóng cần phát ra.
  const narrowCount =
    (lang === "all" ? 0 : 1) + (label === "all" ? 0 : 1) + (narrowsAdded(addedWindow) ? 1 : 0);

  // Soi gương pipeline của WordCloud.tsx (buildCloud → lọc onlyDue) để mọi thứ
  // đi ra từ thanh này — ảnh PNG, tập từ gắn nhãn hàng loạt — đúng bằng cái
  // người dùng đang nhìn. Tính lúc bấm chứ không mỗi lần render: cả hai đều là
  // hành động một nhát, còn buildCloud thì duyệt cả nghìn entry.
  const visibleTags = (now: number): CloudTag[] =>
    buildCloud(entries, { now, sort, lang, label, addedWindow }).filter((t) => (onlyDue ? t.due : true));

  // Trạng thái highlight/dim là tín hiệu hành động nhất thời, không phải dữ
  // liệu — cố ý không tái tạo trong ảnh.
  const exportSections = (): ExportCloudSection[] => {
    const now = Date.now();
    const tags = visibleTags(now);
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
      <div className="filter-lead">
        <button
          type="button"
          className={`filter-toggle${open ? " open" : ""}`}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <FilterIcon size={16} />
          Bộ lọc
          {narrowCount > 0 && <span className="filter-count">{narrowCount}</span>}
          <span className="caret" aria-hidden><ChevronDownIcon /></span>
        </button>
        {open && (
          <>
            <div className="menu-backdrop" onClick={() => setOpen(false)} />
            <FilterPanel
              sort={sort}
              lang={lang}
              label={label}
              labels={labels}
              grouping={grouping}
              addedWindow={addedWindow}
              onSortChange={onSortChange}
              onLangChange={onLangChange}
              onLabelChange={onLabelChange}
              onGroupingChange={onGroupingChange}
              onAddedWindowChange={onAddedWindowChange}
              canBulkLabel={canBulkLabel}
              hasCloudTags={hasCloudTags}
              exporting={exporting}
              onBulkLabel={() => onBulkLabel(visibleTags(Date.now()).map((t) => t.entry))}
              onExport={handleExport}
              onClose={() => setOpen(false)}
            />
          </>
        )}
        {/* Chip bật/tắt thay checkbox: hai công tắc đổi cách nhìn nhanh nhất nên
            ở lại ngoài thanh, không chui vào panel. */}
        <button type="button" className={`chip-toggle${highlightDue ? " on" : ""}`} aria-pressed={highlightDue} onClick={onToggleHighlight}>
          Nổi bật từ cần ôn
        </button>
        <button type="button" className={`chip-toggle${onlyDue ? " on" : ""}`} aria-pressed={onlyDue} onClick={onToggleOnlyDue}>
          Chỉ hiện từ cần ôn
        </button>
      </div>
      <div className="filter-actions">
        {/* Nghe và Hình ảnh không phụ thuộc hạn ôn: chúng chạy trên toàn bộ từ
            đang học, nên vẫn bấm được cả khi hôm nay không còn từ đến hạn. */}
        <button className="listen-btn" disabled={listenCount === 0} onClick={onStartListen}>
          <HeadphonesIcon size={16} />
          Nghe
        </button>
        <button className="image-btn" disabled={imageCount === 0} onClick={onStartImages}>
          <ImageIcon size={16} />
          Hình ảnh
        </button>
        <button className="review-btn" disabled={dueCount === 0} onClick={onStartReview}>
          Ôn tập hôm nay ({dueCount})
        </button>
      </div>
    </div>
  );
}

interface PanelProps {
  sort: CloudSort;
  lang: CloudLang;
  label: LabelFilter;
  labels: LabelCount[];
  grouping: CloudGrouping;
  addedWindow: AddedWindow;
  onSortChange: (sort: CloudSort) => void;
  onLangChange: (lang: CloudLang) => void;
  onLabelChange: (label: LabelFilter) => void;
  onGroupingChange: (grouping: CloudGrouping) => void;
  onAddedWindowChange: (added: AddedWindow) => void;
  canBulkLabel: boolean;
  hasCloudTags: boolean;
  exporting: boolean;
  onBulkLabel: () => void;
  onExport: () => void;
  onClose: () => void;
}

/**
 * Popover "Bộ lọc" — tách thành component riêng để `useDialog` (DESIGN §3.3)
 * chạy đúng lúc panel mount/unmount: Escape đóng, focus vào control đầu, trả
 * focus về nút đã mở.
 */
function FilterPanel({
  sort,
  lang,
  label,
  labels,
  grouping,
  addedWindow,
  onSortChange,
  onLangChange,
  onLabelChange,
  onGroupingChange,
  onAddedWindowChange,
  canBulkLabel,
  hasCloudTags,
  exporting,
  onBulkLabel,
  onExport,
  onClose,
}: PanelProps) {
  const ref = useDialog<HTMLDivElement>(onClose);
  // Không ai thêm từ ở tương lai — chặn ngay trong lịch thay vì để người dùng
  // chọn xong mới thấy bản đồ trống.
  const today = toDateInput(Date.now());

  return (
    <div className="filter-panel" ref={ref} role="group" aria-label="Bộ lọc bản đồ từ">
      <div className="filter-group">
        <p className="filter-group-label">Hiển thị</p>
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
      </div>

      <div className="filter-group">
        <p className="filter-group-label">Phạm vi</p>
        {/* Khoanh vùng theo đợt học: chỉ ôn những từ mới thêm gần đây (#250). */}
        <label className="sort-select">
          Thêm trong
          <select
            value={isAddedPreset(addedWindow) ? addedWindow : RANGE_OPTION}
            onChange={(e) =>
              onAddedWindowChange(
                e.target.value === RANGE_OPTION
                  ? EMPTY_ADDED_RANGE
                  : (e.target.value as AddedWindowPreset),
              )
            }
          >
            {Object.entries(ADDED_WINDOW_LABEL).map(([value, windowLabel]) => (
              <option key={value} value={value}>
                {windowLabel}
              </option>
            ))}
            <option value={RANGE_OPTION}>Khoảng ngày…</option>
          </select>
        </label>
        {/* Đợt học không rơi đúng mốc "N ngày qua" thì chọn thẳng hai đầu ngày
            (#259). Bỏ trống một đầu là để ngỏ đầu đó — "từ 01/05 đến nay". */}
        {!isAddedPreset(addedWindow) && (
          <div className="added-range">
            <label className="sort-select">
              Từ
              <input
                type="date"
                value={addedWindow.from}
                max={addedWindow.to || today}
                onChange={(e) => onAddedWindowChange({ ...addedWindow, from: e.target.value })}
              />
            </label>
            <label className="sort-select">
              Đến
              <input
                type="date"
                value={addedWindow.to}
                min={addedWindow.from || undefined}
                max={today}
                onChange={(e) => onAddedWindowChange({ ...addedWindow, to: e.target.value })}
              />
            </label>
          </div>
        )}
        {/* Kho chưa có nhãn nào thì không dựng ô lọc rỗng cho chật panel. */}
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
      </div>

      <div className="filter-group">
        <p className="filter-group-label">Với các từ đang hiện</p>
        <div className="filter-group-actions">
          {canBulkLabel && (
            <button type="button" className="chip-toggle" disabled={!hasCloudTags} onClick={onBulkLabel}>
              Gắn nhãn AI
            </button>
          )}
          <button type="button" className="export-btn" onClick={onExport} disabled={exporting || !hasCloudTags}>
            <DownloadIcon size={16} />
            {exporting ? "Đang xuất…" : "Tải ảnh PNG"}
          </button>
        </div>
      </div>
    </div>
  );
}
