// Pure layout for exporting the Word Cloud to a PNG (issue #161, phần còn lại
// sau lưới kanji ở #199). Khác lưới kanji ô vuông cố định, tag của cloud co
// giãn theo độ dài chữ — đo chữ là việc của canvas (DOM) nên caller inject
// `widthOf`; ở đây chỉ còn toán xếp dòng kiểu flex-wrap, thuần để test được.

export interface CloudExportMetrics {
  /** Bề rộng vùng xếp tag (chưa tính lề hai bên). */
  contentWidth: number;
  /** Khoảng cách giữa các tag, cả ngang lẫn dọc (CSS `.word-cloud` gap). */
  gap: number;
  tagHeight: number;
  /** Lề trắng quanh toàn ảnh. */
  padding: number;
  /** Chiều cao dành cho tiêu đề nhóm (chỉ cộng khi section có label). */
  headerHeight: number;
  /** Khoảng cách dọc giữa hai section. */
  sectionGap: number;
}

/** Một tag đã đo và đặt chỗ xong — toạ độ tuyệt đối trên ảnh xuất. */
export interface CloudTagBox<T> {
  item: T;
  x: number;
  y: number;
  width: number;
}

export interface CloudSectionLayout<T> {
  /** Tiêu đề nhóm; cloud phẳng (không nhóm) thì bỏ. */
  label?: string;
  /** Mép trên của tiêu đề nhóm — chỉ có nghĩa khi `label` tồn tại. */
  headerY: number;
  boxes: CloudTagBox<T>[];
}

export interface CloudExportLayout<T> {
  /** Kích thước ảnh (đơn vị CSS px, chưa nhân devicePixelRatio). */
  width: number;
  height: number;
  sections: CloudSectionLayout<T>[];
}

/**
 * Mô phỏng flex-wrap của `.word-cloud`: xếp tag lần lượt trái→phải, tag nào
 * không còn vừa (kể cả gap trước nó) thì xuống dòng mới. Tag dài hơn cả khung
 * bị kẹp về `maxWidth` và chiếm trọn một dòng — không bao giờ tràn ngang.
 */
export function wrapIntoLines<T>(
  items: T[],
  widthOf: (item: T) => number,
  maxWidth: number,
  gap: number,
): Array<Array<{ item: T; width: number }>> {
  const lines: Array<Array<{ item: T; width: number }>> = [];
  let line: Array<{ item: T; width: number }> = [];
  let lineWidth = 0;
  for (const item of items) {
    const width = Math.min(Math.max(1, widthOf(item)), maxWidth);
    if (line.length > 0 && lineWidth + gap + width > maxWidth) {
      lines.push(line);
      line = [];
      lineWidth = 0;
    }
    lineWidth += (line.length > 0 ? gap : 0) + width;
    line.push({ item, width });
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

/**
 * Đặt chỗ toàn bộ ảnh xuất: từng section (tiêu đề nếu có + các dòng tag đã
 * wrap) xếp dọc, cách nhau `sectionGap`, tất cả lọt trong lề `padding`. Trả về
 * toạ độ tuyệt đối của mọi tag + kích thước ảnh, để lớp UI chỉ còn việc vẽ.
 */
export function layoutCloudExport<T>(
  sections: Array<{ label?: string; items: T[] }>,
  widthOf: (item: T) => number,
  metrics: CloudExportMetrics,
): CloudExportLayout<T> {
  const laidOut: CloudSectionLayout<T>[] = [];
  let y = metrics.padding;

  sections.forEach((section, i) => {
    if (i > 0) y += metrics.sectionGap;
    const headerY = y;
    if (section.label != null) y += metrics.headerHeight;

    const boxes: CloudTagBox<T>[] = [];
    for (const line of wrapIntoLines(section.items, widthOf, metrics.contentWidth, metrics.gap)) {
      let x = metrics.padding;
      for (const { item, width } of line) {
        boxes.push({ item, x, y, width });
        x += width + metrics.gap;
      }
      y += metrics.tagHeight + metrics.gap;
    }
    // Dòng cuối không có gap phía dưới — như flex-wrap chỉ chèn gap GIỮA các dòng.
    if (boxes.length > 0) y -= metrics.gap;

    laidOut.push({ label: section.label, headerY, boxes });
  });

  return {
    width: metrics.contentWidth + metrics.padding * 2,
    height: y + metrics.padding,
    sections: laidOut,
  };
}
