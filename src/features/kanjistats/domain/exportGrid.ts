// Pure layout helpers for exporting the kanji grid to a PNG (issue #161,
// bounded to the kanji grid — the Word Cloud's text-measuring line-wrap lives
// in review/domain/exportCloud.ts). These mirror the CSS
// grid's `repeat(auto-fill, Npx)` column math so the exported image reflows
// the same way the on-screen `.kanji-grid` does.

/**
 * Column count `grid-template-columns: repeat(auto-fill, cellSize)` picks for
 * a track of `containerWidth` with `gap` between cells: a track fits while
 * `cellSize + gap` keeps dividing into the remaining space (the last cell has
 * no trailing gap, hence the `+ gap` on the numerator).
 */
export function computeGridColumns(containerWidth: number, cellSize: number, gap: number): number {
  if (containerWidth <= 0 || cellSize <= 0) return 1;
  return Math.max(1, Math.floor((containerWidth + gap) / (cellSize + gap)));
}

/** Split a flat list into fixed-width rows, left-to-right top-to-bottom — the
 * same reading order the CSS grid lays its cells out in. */
export function chunkIntoRows<T>(items: T[], columns: number): T[][] {
  if (columns <= 0) return items.length ? [items] : [];
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += columns) rows.push(items.slice(i, i + columns));
  return rows;
}
