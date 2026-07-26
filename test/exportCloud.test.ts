import { describe, it, expect } from "vitest";
import { wrapIntoLines, layoutCloudExport, CloudExportMetrics } from "@/features/review/domain/exportCloud";

// Items are their own widths — the injected measurer stays trivial in tests.
const widthOf = (w: number) => w;

describe("wrapIntoLines", () => {
  it("mimics flex-wrap: a tag that no longer fits (gap included) starts a new line", () => {
    // 40 + 10 + 40 = 90 fits in 100; a third 40 would need 140 → wraps.
    expect(wrapIntoLines([40, 40, 40], widthOf, 100, 10)).toEqual([
      [{ item: 40, width: 40 }, { item: 40, width: 40 }],
      [{ item: 40, width: 40 }],
    ]);
  });

  it("keeps an exact fit on one line", () => {
    // 45 + 10 + 45 = 100 exactly.
    expect(wrapIntoLines([45, 45], widthOf, 100, 10)).toEqual([
      [{ item: 45, width: 45 }, { item: 45, width: 45 }],
    ]);
  });

  it("clamps an overlong tag to the container width, alone on its line", () => {
    expect(wrapIntoLines([150, 40], widthOf, 100, 10)).toEqual([
      [{ item: 150, width: 100 }],
      [{ item: 40, width: 40 }],
    ]);
  });

  it("guards non-positive measured widths to 1px", () => {
    expect(wrapIntoLines([0], widthOf, 100, 10)).toEqual([[{ item: 0, width: 1 }]]);
  });

  it("returns no lines for an empty list", () => {
    expect(wrapIntoLines([], widthOf, 100, 10)).toEqual([]);
  });
});

describe("layoutCloudExport", () => {
  const metrics: CloudExportMetrics = {
    contentWidth: 100,
    gap: 10,
    tagHeight: 38,
    padding: 20,
    headerHeight: 30,
    sectionGap: 15,
  };

  it("positions tags left-to-right then wraps to the next line", () => {
    const layout = layoutCloudExport([{ items: [40, 40, 40] }], widthOf, metrics);
    expect(layout.sections[0].boxes).toEqual([
      { item: 40, x: 20, y: 20, width: 40 },
      { item: 40, x: 70, y: 20, width: 40 },
      { item: 40, x: 20, y: 68, width: 40 }, // 20 + 38 + 10
    ]);
    // width = content + padding×2; height = bottom of last line + padding,
    // without a trailing line-gap: 68 + 38 + 20.
    expect(layout.width).toBe(140);
    expect(layout.height).toBe(126);
  });

  it("reserves header height only for labelled sections", () => {
    const flat = layoutCloudExport([{ items: [40] }], widthOf, metrics);
    expect(flat.sections[0].boxes[0].y).toBe(20);

    const labelled = layoutCloudExport([{ label: "Hôm nay", items: [40] }], widthOf, metrics);
    expect(labelled.sections[0].headerY).toBe(20);
    expect(labelled.sections[0].boxes[0].y).toBe(50); // padding + headerHeight
    expect(labelled.height).toBe(108); // 50 + 38 + 20
  });

  it("stacks sections with sectionGap between them", () => {
    const layout = layoutCloudExport(
      [
        { label: "A", items: [40] },
        { label: "B", items: [40] },
      ],
      widthOf,
      metrics,
    );
    // Section A ends at 50 + 38 = 88; B starts after the 15px section gap.
    expect(layout.sections[1].headerY).toBe(103);
    expect(layout.sections[1].boxes[0].y).toBe(133);
    expect(layout.height).toBe(191);
  });

  it("keeps the incoming tag order inside a section", () => {
    const layout = layoutCloudExport([{ items: [30, 20, 10] }], () => 30, metrics);
    expect(layout.sections[0].boxes.map((b) => b.item)).toEqual([30, 20, 10]);
  });

  it("collapses to a padding-only canvas when there is nothing to draw", () => {
    expect(layoutCloudExport([], widthOf, metrics)).toEqual({ width: 140, height: 40, sections: [] });
    // An empty section adds no line gap either.
    expect(layoutCloudExport([{ items: [] }], widthOf, metrics).height).toBe(40);
  });
});
