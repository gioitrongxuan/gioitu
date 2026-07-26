// Đuôi chung của các nút "Tải ảnh PNG" (issue #161): hình học bo góc và bước
// canvas → blob → tải về mà cả lưới kanji lẫn Word Cloud cùng cần. Vẽ gì lên
// canvas vẫn là việc riêng của từng feature.

/** Path một hình chữ nhật bo góc (thay `ctx.roundRect` — chưa có ở mọi target). */
export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Xuất canvas thành PNG rồi kích hoạt tải về; resolve khi đã bàn giao xong. */
export function downloadCanvasPng(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, filename);
      resolve();
    }, "image/png");
  });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
