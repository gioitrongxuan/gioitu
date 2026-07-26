// Canvas rendering + download for the Word Cloud PNG export (issue #161, phần
// Word Cloud — lưới kanji đã đi trước ở #199, cùng cấu trúc: vẽ imperative ở
// đây, còn toán xếp dòng thuần nằm ở domain/exportCloud.ts). Màu lấy từ Theme
// đang hiệu lực (heatBackgroundRgb/heatTextColor) nên ảnh xuất bám bảng màu
// người dùng như trên màn.

import { Theme, heatBackgroundRgb, heatTextColor } from "@/features/theme/domain/theme";
import { roundRectPath, downloadCanvasPng } from "@/shared/ui/pngExport";
import { layoutCloudExport, CloudExportMetrics } from "../domain/exportCloud";

export interface ExportCloudTag {
  term: string;
  /** log-normalized shade [0,1] như trên màn — quyết định màu nền/chữ của tag. */
  shade: number;
  /** Từ tái quên (RELAPSED) — vẽ badge "!" như trên màn (tín hiệu, DESIGN §1). */
  hasBadge: boolean;
}

export interface ExportCloudSection {
  /** Tiêu đề nhóm ("Hôm nay", "Sắp quên"…); cloud phẳng thì bỏ. */
  label?: string;
  tags: ExportCloudTag[];
}

// Số đo soi gương CSS trên màn (.tag / .word-cloud / .cloud-group-head trong
// styles.css) để ảnh xuất trông đúng là cái cloud đang hiển thị.
const TAG_HEIGHT = 38;
const TAG_PAD_X = 14;
const TAG_RADIUS = 8;
const TAG_FONT = "15px sans-serif";
const GAP = 8;
const PADDING = 24;
const HEADER_H = 28;
const SECTION_GAP = 16;
// .tag .badge: đường tròn 16px đè góc trên-phải (top/right -6px), chữ trắng.
const BADGE_RADIUS = 8;
const BADGE_OVERHANG = 6;
const BADGE_TEXT = "#ffffff"; // khớp styles.css `.tag .badge { color: #fff }`
// Bề rộng xếp tag cố định bất kể viewport — ảnh chia sẻ cần bố cục ổn định,
// không phải chụp lại số cột ngẫu nhiên của cửa sổ hiện tại (như lưới kanji).
const EXPORT_WIDTH = 640;

const METRICS: CloudExportMetrics = {
  contentWidth: EXPORT_WIDTH,
  gap: GAP,
  tagHeight: TAG_HEIGHT,
  padding: PADDING,
  headerHeight: HEADER_H,
  sectionGap: SECTION_GAP,
};

/** Draws `sections` to an offscreen canvas and triggers a PNG download. */
export function exportWordCloudPng(
  sections: ExportCloudSection[],
  theme: Theme,
  filename = "word-cloud.png",
): Promise<void> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve();

  // Đo trước, vẽ sau: cần độ rộng từng tag mới biết kích thước canvas, mà đổi
  // kích thước canvas lại reset state của context — nên đo xong mới set size.
  ctx.font = TAG_FONT;
  const widthOf = (tag: ExportCloudTag) => Math.ceil(ctx.measureText(tag.term).width) + TAG_PAD_X * 2;
  const layout = layoutCloudExport(
    sections.map((s) => ({ label: s.label, items: s.tags })),
    widthOf,
    METRICS,
  );

  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(layout.width * ratio));
  canvas.height = Math.max(1, Math.round(layout.height * ratio));
  ctx.scale(ratio, ratio);
  ctx.fillStyle = theme.surface;
  ctx.fillRect(0, 0, layout.width, layout.height);

  for (const section of layout.sections) {
    if (section.label != null) {
      ctx.fillStyle = theme.muted;
      ctx.font = "600 13px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(section.label, PADDING, section.headerY);
    }
    for (const { item, x, y, width } of section.boxes) drawTag(ctx, x, y, width, item, theme);
  }

  return downloadCanvasPng(canvas, filename);
}

function drawTag(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  tag: ExportCloudTag,
  theme: Theme,
) {
  roundRectPath(ctx, x, y, width, TAG_HEIGHT, TAG_RADIUS);
  ctx.fillStyle = heatBackgroundRgb(tag.shade, theme);
  ctx.fill();

  // Clip chữ vào trong tag: tag dài hơn khung đã bị domain kẹp bề rộng lại,
  // đừng để phần chữ thừa vẽ đè lên hàng xóm.
  ctx.save();
  ctx.clip();
  ctx.fillStyle = heatTextColor(tag.shade, theme);
  ctx.font = TAG_FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(tag.term, x + width / 2, y + TAG_HEIGHT / 2 + 1);
  ctx.restore();

  if (tag.hasBadge) drawRelapseBadge(ctx, x, y, width, theme);
}

/** Badge "!" đè góc trên-phải — nhô ra `BADGE_OVERHANG` như CSS, lọt trong gap. */
function drawRelapseBadge(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, theme: Theme) {
  const cx = x + width + BADGE_OVERHANG - BADGE_RADIUS;
  const cy = y - BADGE_OVERHANG + BADGE_RADIUS;
  ctx.beginPath();
  ctx.arc(cx, cy, BADGE_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = theme.warn;
  ctx.fill();
  ctx.fillStyle = BADGE_TEXT;
  ctx.font = "700 11px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("!", cx, cy + 0.5);
}
