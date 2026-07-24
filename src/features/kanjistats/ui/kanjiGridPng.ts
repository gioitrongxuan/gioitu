// Canvas rendering + download for the kanji-grid PNG export (issue #161,
// kanji-grid slice). Imperative canvas drawing, same convention as
// HandwritingPad.tsx: no domain purity here since drawing is inherently
// canvas/DOM-coupled — the genuinely pure layout math lives in
// domain/exportGrid.ts.

import { Theme, heatBackgroundRgb, heatTextColor } from "@/features/theme/domain/theme";
import { computeGridColumns, chunkIntoRows } from "../domain/exportGrid";

export interface ExportCell {
  kanji: string;
  /** undefined = chưa học ("missing"): drawn at shade 0 with a dashed border,
   * same convention as KanjiStats' MissingTile. */
  shade?: number;
}

export interface ExportSection {
  name: string;
  cells: ExportCell[];
}

const CELL = 34;
const GAP = 4;
const PADDING = 24;
const HEADER_H = 28;
const SECTION_GAP = 16;
const CELL_RADIUS = 6;
// Fixed export width regardless of the viewport the grid happens to render
// at — the point of a shareable image is a consistent layout, not a capture
// of whatever column count the current window width produced.
const EXPORT_WIDTH = 640;

/** Draws `sections` to an offscreen canvas and triggers a PNG download. */
export function exportKanjiGridPng(sections: ExportSection[], theme: Theme, filename = "kanji-grid.png"): Promise<void> {
  const columns = computeGridColumns(EXPORT_WIDTH, CELL, GAP);
  const rows = sections.map((section) => chunkIntoRows(section.cells, columns));
  const width = columns * CELL + Math.max(0, columns - 1) * GAP + PADDING * 2;
  const height =
    PADDING * 2 +
    rows.reduce((sum, secRows) => sum + HEADER_H + secRows.length * (CELL + GAP), 0) +
    Math.max(0, sections.length - 1) * SECTION_GAP;

  const ratio = window.devicePixelRatio || 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * ratio));
  canvas.height = Math.max(1, Math.round(height * ratio));
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve();
  ctx.scale(ratio, ratio);
  ctx.fillStyle = theme.surface;
  ctx.fillRect(0, 0, width, height);

  let y = PADDING;
  sections.forEach((section, i) => {
    ctx.fillStyle = theme.muted;
    ctx.font = "600 13px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(section.name, PADDING, y);
    y += HEADER_H;
    for (const row of rows[i]) {
      row.forEach((cell, col) => drawCell(ctx, PADDING + col * (CELL + GAP), y, cell, theme));
      y += CELL + GAP;
    }
    y += SECTION_GAP - GAP;
  });

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, filename);
      resolve();
    }, "image/png");
  });
}

function drawCell(ctx: CanvasRenderingContext2D, x: number, y: number, cell: ExportCell, theme: Theme) {
  const shade = cell.shade ?? 0;
  const missing = cell.shade == null;

  roundRectPath(ctx, x, y, CELL, CELL, CELL_RADIUS);
  ctx.fillStyle = heatBackgroundRgb(shade, theme);
  ctx.fill();

  if (missing) {
    ctx.save();
    ctx.setLineDash([3, 2]);
    ctx.strokeStyle = theme.line;
    ctx.lineWidth = 1;
    roundRectPath(ctx, x + 0.5, y + 0.5, CELL - 1, CELL - 1, CELL_RADIUS);
    ctx.stroke();
    ctx.restore();
  }

  ctx.fillStyle = heatTextColor(shade, theme);
  ctx.font = "20px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(cell.kanji, x + CELL / 2, y + CELL / 2 + 1);
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
