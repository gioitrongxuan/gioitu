// Skin anime = bộ sưu tập gắn chuỗi ngày ôn (#162, DESIGN §1). Khác preset màu
// (THEME_PRESETS — thay cả bảng màu), một skin CHỈ đổi backdrop + hai đầu
// heatmap và ngồi trên bất kỳ nền sáng/tối nào người dùng
// đang dùng — token chữ/nền giữ nguyên để không phá tương phản.
//
// Mở khoá theo chuỗi ngày ôn DÀI NHẤT từng đạt; skin đã mở giữ vĩnh viễn
// (đứt chuỗi không khoá lại — bộ sưu tập là tài sản, không phải hình phạt,
// DESIGN §5). Danh sách đã mở lưu localStorage như theme/decor.

import type { PresetBackground, Theme } from "./theme";

/** Hai đầu heatmap — phần bảng màu duy nhất một skin được đổi. */
export type SkinHeat = Pick<Theme, "heatFrom" | "heatTo">;

/** Ảnh chụp chuỗi ngày ôn mà UI theme cần — feature review cấp qua App
 * (inject), theme không import ngược sang review. */
export interface StreakSnapshot {
  current: number;
  longest: number;
}

export interface ThemeSkin {
  id: string;
  name: string;
  heat: SkinHeat;
  background: PresetBackground;
  /** Chuỗi ngày ôn (dài nhất từng đạt) cần có để mở khoá. */
  requiredStreak: number;
}

/** Bộ sưu tập, xếp theo mốc mở khoá tăng dần. Màu heat là màu nhận diện của
 * skin (chip trong cài đặt chỉ có swatch màu + tên, không glyph) — giữ nguyên cặp đã có từ thời skin còn là preset màu đầy đủ. */
export const THEME_SKINS: ThemeSkin[] = [
  {
    id: "panda",
    name: "Rừng trúc",
    requiredStreak: 3,
    heat: { heatFrom: "#e4efd8", heatTo: "#1c1c1c" },
    background: { effect: "bamboo", speed: "slow", opacity: 0.3 },
  },
  {
    id: "buu",
    name: "Majin Buu",
    requiredStreak: 7,
    heat: { heatFrom: "#fbcfe8", heatTo: "#701a75" },
    background: { effect: "buu", speed: "slow", opacity: 0.35 },
  },
  {
    id: "cell",
    name: "Cell",
    requiredStreak: 14,
    heat: { heatFrom: "#1d3524", heatTo: "#a3e635" },
    background: { effect: "cell", speed: "slow", opacity: 0.3 },
  },
  {
    id: "akatsuki",
    name: "Akatsuki",
    requiredStreak: 30,
    heat: { heatFrom: "#33212a", heatTo: "#ef4444" },
    background: { effect: "akatsuki", speed: "slow", opacity: 0.35 },
  },
];

/** Skin mang id đã cho, hoặc undefined (id null / id của preset màu cũ). */
export function skinById(id: string | null): ThemeSkin | undefined {
  return id == null ? undefined : THEME_SKINS.find((s) => s.id === id);
}

/**
 * Bộ sưu tập sau khi ghi nhận chuỗi mới nhất. Thuần, không I/O:
 * - skin đã nằm trong `earned` giữ nguyên (mở rồi là vĩnh viễn);
 * - chuỗi dài nhất chạm mốc nào thì mở mốc đó;
 * - skin đang mặc (`activeSkinId`) từ trước ngày có gating được giữ luôn —
 *   không tước lại thứ người dùng đã chọn.
 * Trả về theo thứ tự THEME_SKINS; id lạ (không còn trong bộ sưu tập) bị loại.
 */
export function updateEarnedSkins(
  earned: readonly string[],
  longestStreak: number,
  activeSkinId: string | null,
): string[] {
  return THEME_SKINS.filter(
    (skin) => earned.includes(skin.id) || longestStreak >= skin.requiredStreak || skin.id === activeSkinId,
  ).map((skin) => skin.id);
}

const EARNED_KEY = "gioitu.skins.v1";

/** Đọc danh sách skin đã mở; dữ liệu hỏng/thiếu coi như chưa mở gì. */
export function loadEarnedSkins(): string[] {
  try {
    const raw = localStorage.getItem(EARNED_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((id): id is string => typeof id === "string");
    }
  } catch {
    /* malformed / unavailable storage — fall through */
  }
  return [];
}

/** Persist danh sách skin đã mở; ignores storage failures (private mode, quota, …). */
export function saveEarnedSkins(ids: readonly string[]): void {
  try {
    localStorage.setItem(EARNED_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}
