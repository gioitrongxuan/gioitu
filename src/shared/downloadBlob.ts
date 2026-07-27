// Tải một Blob về máy người dùng. Trình duyệt không có API "lưu file" trực
// tiếp nên phải đi vòng: object URL + thẻ <a download> rồi click hộ. Gom về một
// chỗ để mọi nút "Tải…" (backup JSON, CSV lịch sử, .zip Yomitan, ảnh PNG) cùng
// một hành vi và không ai quên revokeObjectURL.

import { isoDate } from "./date";

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  // Gắn vào DOM trước khi click: thẻ mồ côi bị một số trình duyệt bỏ qua.
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Tên file gắn ngày xuất (`prefix-YYYY-MM-DD.ext`) để nhiều bản xuất không đè
 * nhau. `now` do caller truyền vào — giữ hàm thuần, test được tất định.
 */
export function datedFilename(prefix: string, ext: string, now: Date): string {
  return `${prefix}-${isoDate(now)}.${ext}`;
}
