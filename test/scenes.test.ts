// Toạ độ của "Quanh ta" đặt tay, còn hình người và nội tạng thì sinh tự động
// từ bộ anatomogram — chỗ dễ sai nhất là hai bên lệch nhau: ô chú giải trôi ra
// ngoài khung, hai ô chồng lên nhau, hay neo trỏ ra ngoài hình. Test này giữ
// đúng những bất biến hình học đó, không kiểm nội dung từ vựng.

import { describe, expect, it } from "vitest";
import { ANATOMY_VIEW, ORGANS } from "@/features/scenes/domain/anatomy";
import {
  BODY_FIGURE,
  CALLOUT_H,
  CALLOUT_W,
  calloutEdge,
  calloutFit,
  figurePoint,
  hasCallout,
  pinAnchor,
  pinSide,
  pinStyle,
  SCENES,
  sceneById,
} from "@/features/scenes/domain/scenes";

const bodyScenes = SCENES.filter((s) => s.pins.some((p) => p.ax != null || p.organ != null));

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

  it("ô chú giải nằm trọn trong khung", () => {
    for (const scene of SCENES) {
      for (const pin of scene.pins) {
        if (!hasCallout(pin)) continue;
        const where = `${scene.id}/${pin.term}`;
        expect(pin.x - CALLOUT_W / 2, where).toBeGreaterThanOrEqual(0);
        expect(pin.x + CALLOUT_W / 2, where).toBeLessThanOrEqual(scene.art.w);
        expect(pin.y - CALLOUT_H / 2, where).toBeGreaterThanOrEqual(0);
        expect(pin.y + CALLOUT_H / 2, where).toBeLessThanOrEqual(scene.art.h);
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

  it("hình giải phẫu nằm gọn trong khung cảnh cơ thể", () => {
    for (const scene of bodyScenes) {
      const topLeft = figurePoint(0, 0);
      const bottomRight = figurePoint(ANATOMY_VIEW.w, ANATOMY_VIEW.h);
      expect(topLeft.x).toBeGreaterThan(0);
      expect(topLeft.y).toBeGreaterThan(0);
      expect(bottomRight.x).toBeLessThan(scene.art.w);
      expect(bottomRight.y).toBeLessThan(scene.art.h);
    }
  });

  it("hình người không đè lên cột ô chú giải", () => {
    const scene = sceneById("organs");
    const left = figurePoint(0, 0).x;
    const right = figurePoint(ANATOMY_VIEW.w, 0).x;
    for (const pin of scene.pins) {
      const where = `${scene.id}/${pin.term}`;
      if (pin.x < scene.art.w / 2) expect(pin.x + CALLOUT_W / 2, where).toBeLessThanOrEqual(left);
      else expect(pin.x - CALLOUT_W / 2, where).toBeGreaterThanOrEqual(right);
    }
  });

  it("mọi neo đều trỏ vào trong khung", () => {
    for (const scene of bodyScenes) {
      for (const pin of scene.pins) {
        const anchor = pinAnchor(pin);
        expect(anchor, `${scene.id}/${pin.term}`).not.toBeNull();
        expect(anchor!.x).toBeGreaterThan(0);
        expect(anchor!.x).toBeLessThan(scene.art.w);
        expect(anchor!.y).toBeGreaterThan(0);
        expect(anchor!.y).toBeLessThan(scene.art.h);
      }
    }
  });

  it("ghim gắn bộ phận lấy neo từ tâm hộp bao của bộ phận đó", () => {
    const liver = sceneById("organs").pins.find((p) => p.organ === "liver")!;
    const [x, y, w, h] = ORGANS.liver.box;
    expect(pinAnchor(liver)).toEqual(figurePoint(x + w / 2, y + h / 2));
  });

  it("bộ phận co vừa trong ô chú giải của nó", () => {
    for (const pin of sceneById("organs").pins) {
      const fit = calloutFit(pin)!;
      const [x, y, w, h] = ORGANS[pin.organ!].box;
      const left = fit.x + x * fit.scale;
      const top = fit.y + y * fit.scale;
      const where = pin.term;
      expect(left, where).toBeGreaterThanOrEqual(pin.x - CALLOUT_W / 2);
      expect(left + w * fit.scale, where).toBeLessThanOrEqual(pin.x + CALLOUT_W / 2);
      expect(top, where).toBeGreaterThanOrEqual(pin.y - CALLOUT_H / 2);
      expect(top + h * fit.scale, where).toBeLessThanOrEqual(pin.y + CALLOUT_H / 2);
    }
  });

  it("đường dẫn rời ô ở mép quay về phía hình", () => {
    const scene = sceneById("organs");
    const left = scene.pins.find((p) => p.organ === "brain")!;
    const right = scene.pins.find((p) => p.organ === "heart")!;
    expect(calloutEdge(scene, left)).toEqual({ x: left.x + CALLOUT_W / 2, y: left.y });
    expect(calloutEdge(scene, right)).toEqual({ x: right.x - CALLOUT_W / 2, y: right.y });
  });

  it("pinStyle chỉ cấp kích thước cho ghim có ô chú giải", () => {
    const organs = sceneById("organs");
    const boxed = pinStyle(organs, organs.pins[0]);
    expect(boxed.width).toBe(`${(CALLOUT_W / organs.art.w) * 100}%`);
    expect(boxed.height).toBe(`${(CALLOUT_H / organs.art.h) * 100}%`);

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

  it("hình đặt đúng tỉ lệ gốc (không bóp méo)", () => {
    expect(BODY_FIGURE.scale).toBeGreaterThan(0);
    const drawn = figurePoint(ANATOMY_VIEW.w, ANATOMY_VIEW.h);
    const origin = figurePoint(0, 0);
    expect((drawn.x - origin.x) / (drawn.y - origin.y)).toBeCloseTo(ANATOMY_VIEW.w / ANATOMY_VIEW.h, 6);
  });
});
