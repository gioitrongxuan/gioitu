// Tuỳ chọn cá nhân của chế độ hình ảnh: mỗi ảnh đứng bao lâu + có bỏ bước tự
// nhớ lại không. Thuần UI, không đồng bộ — persisted như listenSettings
// (localStorage).
//
// Phần phân giải tách riêng (`parseImageModeSettings`) để test được ở môi
// trường node không có localStorage.

const STORAGE_KEY = "gioitu.imageMode.v1";

/** Các mức người dùng chọn được; giá trị ngoài danh sách coi như hỏng. */
export const IMAGE_HOLD_MS = [3000, 5000, 8000] as const;

const DEFAULT_HOLD_MS = 5000;
const DEFAULT_REVEAL_AT_ONCE = false;

export interface ImageModeSettings {
  /** Mỗi bước của thẻ đứng bao lâu trước khi tự chuyển. */
  holdMs: number;
  /**
   * Bỏ bước "chỉ ảnh" và hiện đáp án ngay. Mặc định tắt: nhìn ảnh rồi tự lôi từ
   * ra khỏi trí nhớ mới là lượt học thật, thấy sẵn đáp án chỉ còn là xem lướt.
   */
  revealAtOnce: boolean;
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
export function parseImageModeSettings(raw: string | null): ImageModeSettings {
  const stored = storedObject(raw);
  return {
    holdMs: oneOf(stored.holdMs, IMAGE_HOLD_MS, DEFAULT_HOLD_MS),
    revealAtOnce:
      typeof stored.revealAtOnce === "boolean" ? stored.revealAtOnce : DEFAULT_REVEAL_AT_ONCE,
  };
}

export function loadImageModeSettings(): ImageModeSettings {
  try {
    return parseImageModeSettings(localStorage.getItem(STORAGE_KEY));
  } catch {
    return parseImageModeSettings(null); // storage unavailable (private mode)
  }
}

export function saveImageModeSettings(settings: ImageModeSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}
