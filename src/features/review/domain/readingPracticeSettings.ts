// Cờ bật/tắt chế độ "gõ cách đọc trước khi lật" (readingPractice.ts). Tuỳ chọn
// cá nhân thuần UI, không đồng bộ — persisted như dictSource (localStorage).

const STORAGE_KEY = "gioitu.reviewTypeReading.v1";

export function loadTypeReadingEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false; // storage unavailable (private mode) — mặc định tắt
  }
}

export function saveTypeReadingEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}
