// Toạ độ của "Quanh ta" đặt tay theo tranh vẽ trong code, nên chỗ dễ sai nhất
// là ghim/ô chú giải trôi ra ngoài khung hoặc hai ô chồng lên nhau. Test này
// giữ đúng những bất biến hình học đó, chứ không kiểm nội dung từ vựng.

import { describe, expect, it } from "vitest";
import {
  CALLOUT_H,
  CALLOUT_W,
  calloutEdge,
  hasCallout,
  pinSide,
  pinStyle,
  SCENES,
  sceneById,
} from "@/features/scenes/domain/scenes";

describe("scenes", () => {
  it("id lạ rơi về cảnh đầu tiên", () => {
    expect(sceneById("body").id).toBe("body");
    expect(sceneById("khong-co").id).toBe(SCENES[0].id);
  });

  it("từ không trùng trong cùng một cảnh", () => {
    for (const scene of SCENES) {
      const terms = scene.pins.map((p) => p.term);
      expect(new Set(terms).size, scene.id).toBe(terms.length);
    }
  });

  it("mọi ghim nằm trong khung của cảnh", () => {
    for (const scene of SCENES) {
      for (const pin of scene.pins) {
        expect(pin.x, `${scene.id}/${pin.term}`).toBeGreaterThanOrEqual(0);
        expect(pin.x, `${scene.id}/${pin.term}`).toBeLessThanOrEqual(scene.art.w);
        expect(pin.y, `${scene.id}/${pin.term}`).toBeGreaterThanOrEqual(0);
        expect(pin.y, `${scene.id}/${pin.term}`).toBeLessThanOrEqual(scene.art.h);
      }
    }
  });

  it("ô chú giải và điểm neo không tràn khỏi khung", () => {
    for (const scene of SCENES) {
      for (const pin of scene.pins) {
        if (!hasCallout(pin)) continue;
        expect(pin.x - CALLOUT_W / 2, `${scene.id}/${pin.term}`).toBeGreaterThanOrEqual(0);
        expect(pin.x + CALLOUT_W / 2, `${scene.id}/${pin.term}`).toBeLessThanOrEqual(scene.art.w);
        expect(pin.y - CALLOUT_H / 2, `${scene.id}/${pin.term}`).toBeGreaterThanOrEqual(0);
        expect(pin.y + CALLOUT_H / 2, `${scene.id}/${pin.term}`).toBeLessThanOrEqual(scene.art.h);
        expect(pin.ax! >= 0 && pin.ax! <= scene.art.w, `${scene.id}/${pin.term}`).toBe(true);
        expect(pin.ay! >= 0 && pin.ay! <= scene.art.h, `${scene.id}/${pin.term}`).toBe(true);
      }
    }
  });

  it("hai ô chú giải cùng cột không chồng nhau", () => {
    for (const scene of SCENES) {
      const columns = new Map<number, number[]>();
      for (const pin of scene.pins) {
        if (!hasCallout(pin)) continue;
        columns.set(pin.x, [...(columns.get(pin.x) ?? []), pin.y]);
      }
      for (const [x, ys] of columns) {
        const sorted = [...ys].sort((a, b) => a - b);
        for (let i = 1; i < sorted.length; i++) {
          expect(sorted[i] - sorted[i - 1], `${scene.id} cột x=${x}`).toBeGreaterThanOrEqual(CALLOUT_H);
        }
      }
    }
  });

  it("đường dẫn rời ô ở mép quay về phía thân", () => {
    const scene = sceneById("body");
    const left = scene.pins.find((p) => p.term === "頭")!;
    const right = scene.pins.find((p) => p.term === "耳")!;
    expect(calloutEdge(scene, left)).toEqual({ x: left.x + CALLOUT_W / 2, y: left.y });
    expect(calloutEdge(scene, right)).toEqual({ x: right.x - CALLOUT_W / 2, y: right.y });
  });

  it("pinStyle chỉ cấp kích thước cho ghim có ô chú giải", () => {
    const body = sceneById("body");
    const boxed = pinStyle(body, body.pins[0]);
    expect(boxed.width).toBe(`${(CALLOUT_W / body.art.w) * 100}%`);
    expect(boxed.height).toBe(`${(CALLOUT_H / body.art.h) * 100}%`);

    const kitchen = sceneById("kitchen");
    const dot = pinStyle(kitchen, kitchen.pins[0]);
    expect(dot.width).toBeUndefined();
    expect(dot.left).toBe(`${(kitchen.pins[0].x / kitchen.art.w) * 100}%`);
  });

  it("nhãn đổ về bên trái khi ghim nằm ở nửa phải", () => {
    const body = sceneById("body");
    expect(pinSide(body, body.pins.find((p) => p.term === "頭")!)).toBe("right");
    expect(pinSide(body, body.pins.find((p) => p.term === "耳")!)).toBe("left");
  });
});
