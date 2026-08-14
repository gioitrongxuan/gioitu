// Cửa sổ "thêm gần đây" đang lọc cho Word Cloud + phiên ôn (AddedWindow). Tuỳ
// chọn cá nhân thuần UI, không đồng bộ — persisted như cloudLangSettings.

import { ADDED_WINDOW_LABEL, AddedWindow } from "./wordcloud";

const STORAGE_KEY = "gioitu.addedWindow.v1";

function isAddedWindow(value: string): value is AddedWindow {
  return Object.prototype.hasOwnProperty.call(ADDED_WINDOW_LABEL, value);
}

export function loadAddedWindow(): AddedWindow {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value != null && isAddedWindow(value)) return value;
  } catch {
    /* storage unavailable (private mode) — dùng mặc định */
  }
  return "all";
}

export function saveAddedWindow(added: AddedWindow): void {
  try {
    localStorage.setItem(STORAGE_KEY, added);
  } catch {
    /* ignore */
  }
}
