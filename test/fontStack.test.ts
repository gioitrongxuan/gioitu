// Lưới an toàn cho #267 — hợp đồng nằm ở font stack, không ở JS, nên test đọc
// thẳng CSS/HTML. Chuyện gì đã xảy ra: nguồn text đã đúng NFC mà dấu tiếng Việt
// vẫn văng ra khỏi chữ ("Sắp xếp" → "Să ´ p xê ´ p"). Lý do: `system-ui` ăn theo
// locale của máy — máy locale tiếng Nhật cho ra Yu Gothic UI (Windows) hoặc
// Hiragino (macOS). Font Nhật thiếu glyph tiếng Việt dựng sẵn (U+1EA0–U+1EF9)
// nhưng vẫn có chữ nền + dấu tổ hợp rời, nên trình duyệt KHÔNG nhảy sang font
// khác: nó phân rã "ắ" thành "ă" + U+0301 rồi vẽ dấu như ký tự riêng.
// Bất biến cần giữ: trong mọi stack cho chữ tiếng Việt, một font phủ đủ tiếng
// Việt phải đứng TRƯỚC mọi font ăn-theo-locale hoặc font Nhật.

import { readFileSync } from "node:fs";

const STYLES = readFileSync(new URL("../src/styles/styles.css", import.meta.url), "utf8");
const EXT_OPTIONS = readFileSync(new URL("../extension/options.html", import.meta.url), "utf8");

/** Font hệ thống phủ đủ tiếng Việt dựng sẵn (Latin Extended Additional). */
const VI_COMPLETE = [
  "-apple-system",
  "BlinkMacSystemFont",
  "Segoe UI",
  "Roboto",
  "Noto Sans",
  "DejaVu Sans",
  "Liberation Sans",
  "Arial",
  "Helvetica",
];

/** Font ăn theo locale, hoặc font Nhật: không đảm bảo có glyph tiếng Việt. */
const VI_RISKY = [
  "system-ui",
  "Yu Gothic",
  "Yu Gothic UI",
  "Hiragino Sans",
  "Hiragino Kaku Gothic ProN",
  "Meiryo",
  "Noto Sans JP",
  "MS Gothic",
  "MS PGothic",
];

/** Tách một khai báo font-family thành danh sách family (bỏ nháy, bỏ comment). */
function families(stack: string): string[] {
  return stack
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(",")
    .map((f) => f.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

/** Vị trí family đầu tiên thuộc `names`; -1 nếu stack không có cái nào. */
function firstIndexOf(stack: string[], names: readonly string[]): number {
  return stack.findIndex((f) => names.includes(f));
}

/**
 * Bất biến #267: stack phải có ít nhất một font phủ đủ tiếng Việt, và font đó
 * đứng trước mọi font rủi ro (nếu stack có dùng font rủi ro làm lưới cuối).
 */
function expectVietnameseSafe(stack: string[]) {
  const safe = firstIndexOf(stack, VI_COMPLETE);
  expect(safe, `stack không có font nào phủ đủ tiếng Việt: ${stack.join(", ")}`).toBeGreaterThanOrEqual(0);
  const risky = firstIndexOf(stack, VI_RISKY);
  if (risky >= 0) expect(safe).toBeLessThan(risky);
}

/** Giá trị của một custom property khai trong `:root` của styles.css. */
function cssVar(name: string): string {
  const m = new RegExp(`${name}:([^;]+);`).exec(STYLES);
  if (!m) throw new Error(`không tìm thấy ${name} trong styles.css`);
  return m[1];
}

describe("font stack tiếng Việt (#267)", () => {
  it("--font-ui phủ đủ tiếng Việt trước khi rơi vào font ăn-theo-locale", () => {
    const stack = families(cssVar("--font-ui"));
    expectVietnameseSafe(stack);
    // `system-ui` được phép có mặt, nhưng chỉ ở đuôi làm lưới an toàn.
    expect(stack[0]).not.toBe("system-ui");
  });

  it(":root dùng var(--font-ui) chứ không khai font-family rời", () => {
    // Chỉ có đúng một khai báo font-family ngoài các custom property, và nó trỏ
    // vào token — thêm một stack rời ở đây là đường quay lại của lỗi.
    const declarations = STYLES.match(/^\s*font-family:[^;]+;/gm) ?? [];
    expect(declarations).toHaveLength(1);
    expect(declarations[0]).toContain("var(--font-ui)");
  });

  it("--font-ja vẫn ưu tiên font Nhật (chỉ áp qua :lang(ja))", () => {
    // Không đổi thứ tự font Nhật: chữ Nhật phải do font Nhật vẽ. An toàn cho
    // tiếng Việt đến từ chỗ khác — bọc lang="ja" chặt quanh chữ Nhật.
    expect(families(cssVar("--font-ja"))[0]).toBe("Hiragino Sans");
    expect(STYLES).toContain(":lang(ja) { font-family: var(--font-ja); }");
  });

  it("trang tuỳ chọn của extension dùng cùng bất biến", () => {
    const m = /font-family:([^;]+);/.exec(EXT_OPTIONS);
    expect(m).not.toBeNull();
    expectVietnameseSafe(families(m![1]));
  });
});
