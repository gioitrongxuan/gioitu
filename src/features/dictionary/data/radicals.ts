// Nạp bảng bộ thủ (RADKFILE đã chuyển sang JSON). Lười tải: chỉ import khi người
// dùng mở bảng chọn bộ, để không phình bundle khởi động — Vite tách thành chunk
// riêng. Cache theo phiên vì dữ liệu tĩnh.
//
// Nguồn: RADKFILE của EDRDG (Electronic Dictionary Research & Development Group),
// giấy phép CC-BY-SA. Xem http://www.edrdg.org/edrdg/licence.html.

import type { RadicalData } from "../domain/radicals";

let cache: Promise<RadicalData> | null = null;

export function loadRadicalData(): Promise<RadicalData> {
  if (!cache) {
    cache = import("./radkfile.json").then((m) => (m.default ?? m) as unknown as RadicalData);
  }
  return cache;
}
