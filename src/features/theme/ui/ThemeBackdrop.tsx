// Lớp nền trang trí của preset đang chọn. Nằm sau toàn bộ nội dung (fixed,
// z-index âm, pointer-events none) và lazy-load qua presets/registry — chỉ
// theme được chọn mới tải chunk hiệu ứng của nó. Không render gì khi người
// dùng tắt hiệu ứng hoặc preset không có background.

import { Suspense } from "react";
import { useTheme } from "../ThemeProvider";
import { presetById } from "../domain/theme";
import { BACKGROUNDS } from "../presets/registry";

export function ThemeBackdrop() {
  const { decor } = useTheme();
  if (!decor.effectsEnabled) return null;

  const background = presetById(decor.presetId)?.background;
  if (!background) return null;

  const Effect = BACKGROUNDS[background.effect];
  return (
    <div className="theme-backdrop" aria-hidden>
      <Suspense fallback={null}>
        <Effect opacity={background.opacity} speed={background.speed} />
      </Suspense>
    </div>
  );
}
