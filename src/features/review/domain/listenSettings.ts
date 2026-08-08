// Tuỳ chọn cá nhân của chế độ nghe: tốc độ đọc + độ dài khoảng lặng. Thuần UI,
// không đồng bộ — persisted như reverseModeSettings (localStorage).
//
// Phần phân giải tách riêng (`parseListenSettings`) để test được ở môi trường
// node không có localStorage.

const STORAGE_KEY = "gioitu.listen.v1";

/** Các mức người dùng chọn được; giá trị ngoài danh sách coi như hỏng. */
export const LISTEN_RATES = [0.75, 1, 1.25] as const;
export const LISTEN_GAPS_MS = [2000, 4000, 6000] as const;

const DEFAULT_RATE = 1;
const DEFAULT_GAP_MS = 4000;

export interface ListenSettings {
  /** Truyền thẳng cho `SpeechSynthesisUtterance.rate`. */
  rate: number;
  /** Khoảng lặng giữa từ và nghĩa, đủ để tự nhớ lại. */
  gapMs: number;
}

function storedObject(raw: string | null): Record<string, unknown> {
  if (raw == null) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed != null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* payload hỏng — coi như chưa lưu gì */
  }
  return {};
}

function oneOf<T extends number>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/** Phân giải payload đã lưu; mọi giá trị lạ rơi về mặc định. */
export function parseListenSettings(raw: string | null): ListenSettings {
  const stored = storedObject(raw);
  return {
    rate: oneOf(stored.rate, LISTEN_RATES, DEFAULT_RATE),
    gapMs: oneOf(stored.gapMs, LISTEN_GAPS_MS, DEFAULT_GAP_MS),
  };
}

export function loadListenSettings(): ListenSettings {
  try {
    return parseListenSettings(localStorage.getItem(STORAGE_KEY));
  } catch {
    return parseListenSettings(null); // storage unavailable (private mode)
  }
}

export function saveListenSettings(settings: ListenSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}
