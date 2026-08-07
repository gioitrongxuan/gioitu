// Ngôn ngữ đang lọc cho Word Cloud + phiên ôn (CloudLang). Tuỳ chọn cá nhân
// thuần UI, không đồng bộ — persisted như reverseModeSettings (localStorage).

import { CloudLang } from "./wordcloud";

const STORAGE_KEY = "gioitu.cloudLang.v1";

function isCloudLang(value: string): value is CloudLang {
  return value === "all" || value === "ja" || value === "en";
}

export function loadCloudLang(): CloudLang {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value != null && isCloudLang(value)) return value;
  } catch {
    /* storage unavailable (private mode) — dùng mặc định */
  }
  return "all";
}

export function saveCloudLang(lang: CloudLang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
}
