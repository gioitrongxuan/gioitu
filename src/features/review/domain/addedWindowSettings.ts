// Cửa sổ "thêm gần đây" đang lọc cho Word Cloud + phiên ôn (AddedWindow). Tuỳ
// chọn cá nhân thuần UI, không đồng bộ — persisted như cloudLangSettings.

import { ADDED_WINDOW_LABEL, AddedWindow, isAddedPreset } from "./wordcloud";

const STORAGE_KEY = "gioitu.addedWindow.v1";

// Khoảng ngày tự chọn (#259) nằm chung một khoá với các cửa sổ dựng sẵn: tiền
// tố phân biệt hai dạng, hai đầu ngày ở sau (đầu rỗng = mở). Giữ dạng chuỗi
// phẳng để bản đã lưu từ trước (chỉ có preset) vẫn đọc được nguyên vẹn.
const RANGE_PREFIX = "range:";

function isPresetValue(value: string): boolean {
  return Object.prototype.hasOwnProperty.call(ADDED_WINDOW_LABEL, value);
}

export function serializeAddedWindow(added: AddedWindow): string {
  return isAddedPreset(added) ? added : `${RANGE_PREFIX}${added.from}:${added.to}`;
}

/** Đọc chuỗi đã lưu; `null` khi chuỗi thuộc phiên bản khác hoặc đã hỏng. */
export function parseAddedWindow(value: string): AddedWindow | null {
  if (isPresetValue(value)) return value as AddedWindow;
  if (!value.startsWith(RANGE_PREFIX)) return null;
  const [from, to, ...rest] = value.slice(RANGE_PREFIX.length).split(":");
  if (rest.length > 0 || from == null || to == null) return null;
  return { kind: "range", from, to };
}

export function loadAddedWindow(): AddedWindow {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value != null) return parseAddedWindow(value) ?? "all";
  } catch {
    /* storage unavailable (private mode) — dùng mặc định */
  }
  return "all";
}

export function saveAddedWindow(added: AddedWindow): void {
  try {
    localStorage.setItem(STORAGE_KEY, serializeAddedWindow(added));
  } catch {
    /* ignore */
  }
}
