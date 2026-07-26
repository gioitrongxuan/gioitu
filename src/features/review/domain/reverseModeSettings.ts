// Cờ bật/tắt chế độ đảo chiều nghĩa→từ (reverseMode.ts). Tuỳ chọn cá nhân
// thuần UI, không đồng bộ — persisted như readingPracticeSettings (localStorage).

const STORAGE_KEY = "gioitu.reviewReverse.v1";

export function loadReverseModeEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false; // storage unavailable (private mode) — mặc định tắt
  }
}

export function saveReverseModeEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}
