// Theme settings screen: a dismissible modal to customise the palette — the
// word-cloud heatmap above all, plus accent/warning/surface colours. Edits are
// applied live across the whole app (via the ThemeProvider) so the preview row
// and the real UI behind the modal both update as you drag a colour. Changes
// persist automatically; "Hoàn tác" reverts to the palette at open time and
// "Mặc định" restores the built-in theme.

import { useEffect, useState } from "react";
import { useDialog } from "@/shared/ui/useDialog";
import { CloseIcon } from "@/shared/ui/icons";
import { useTheme } from "../ThemeProvider";
import {
  Theme,
  ThemeDecor,
  THEME_PRESETS,
  isHexColor,
  heatBackground,
  heatTextColor,
  contrastOf,
} from "../domain/theme";

/** Ngưỡng AA cho chữ thường (DESIGN §3.4) — dưới ngưỡng này thì cảnh báo. */
const MIN_TEXT_CONTRAST = 4.5;

interface Props {
  onClose: () => void;
}

interface FieldDef {
  key: keyof Theme;
  label: string;
}

const HEAT_FIELDS: FieldDef[] = [
  { key: "heatFrom", label: "Ít tra (nhạt)" },
  { key: "heatTo", label: "Tra nhiều (đậm)" },
];

const PALETTE_FIELDS: FieldDef[] = [
  { key: "accent", label: "Màu nhấn" },
  { key: "warn", label: "Cảnh báo" },
  { key: "bg", label: "Nền trang" },
  { key: "surface", label: "Nền thẻ" },
  { key: "fg", label: "Chữ" },
  { key: "muted", label: "Chữ phụ" },
  { key: "line", label: "Đường kẻ" },
];

// Sample shades for the live heatmap strip (low → high look-up frequency).
const PREVIEW_SHADES = [0, 0.25, 0.5, 0.75, 1];

export function ThemeSettings({ onClose }: Props) {
  const { theme, decor, setTheme, setField, setDecor, applyPreset, reset } = useTheme();
  // Snapshot palette + decor as they were when the modal opened, for "Hoàn tác".
  const [initial] = useState<{ theme: Theme; decor: ThemeDecor }>({ theme, decor });
  const undo = () => {
    setTheme(initial.theme);
    setDecor(initial.decor);
  };

  const activePreset = THEME_PRESETS.find(
    (p) => (Object.keys(p.theme) as (keyof Theme)[]).every((k) => p.theme[k] === theme[k]),
  );

  const dialogRef = useDialog<HTMLDivElement>(onClose);

  // Cảnh báo contrast khi fg≈bg/surface (#128) — chỉ 2 preset dựng sẵn được
  // khoá AA bằng test; một palette tự chỉnh có thể rơi dưới ngưỡng bất cứ lúc
  // nào trong lúc kéo màu, nên báo ngay tại chỗ thay vì để người dùng tự nhận ra.
  const fgVsBg = contrastOf(theme.fg, theme.bg);
  const fgVsSurface = contrastOf(theme.fg, theme.surface);
  const lowContrast = Math.min(fgVsBg, fgVsSurface) < MIN_TEXT_CONTRAST;

  return (
    <div className="theme-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="theme-card" role="dialog" aria-modal="true" aria-label="Giao diện" tabIndex={-1} ref={dialogRef}>
        <header className="manager-head">
          <h2>Giao diện</h2>
          <button className="auth-close" aria-label="Đóng" onClick={onClose}><CloseIcon size={18} /></button>
        </header>

        <section className="theme-section">
          <h3>Mẫu có sẵn</h3>
          <div className="preset-row">
            {THEME_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`preset-chip${activePreset?.id === preset.id ? " active" : ""}`}
                onClick={() => applyPreset(preset)}
              >
                <span
                  className="preset-swatch"
                  style={{
                    background: `linear-gradient(135deg, ${preset.theme.heatFrom}, ${preset.theme.heatTo})`,
                  }}
                  aria-hidden
                />
                {preset.icons && <span className="preset-emblem" aria-hidden>{preset.icons.emblem}</span>}
                {preset.name}
              </button>
            ))}
          </div>
        </section>

        <section className="theme-section">
          <h3>Hiệu ứng nền</h3>
          <label className="fx-toggle">
            <input
              type="checkbox"
              checked={decor.effectsEnabled}
              onChange={(e) => setDecor({ ...decor, effectsEnabled: e.target.checked })}
            />
            <span>Hiện hoạ tiết nền của theme (Majin Buu, Cell, Rừng trúc, Akatsuki)</span>
          </label>
          <p className="fx-hint">Hoạ tiết sẽ đứng yên khi hệ điều hành bật "giảm chuyển động".</p>
        </section>

        <section className="theme-section">
          <h3>Bản đồ nhiệt (word cloud)</h3>
          <div className="heat-preview word-cloud" aria-hidden>
            {PREVIEW_SHADES.map((shade) => (
              <span
                key={shade}
                className="tag"
                style={{ background: heatBackground(shade), color: heatTextColor(shade, theme) }}
              >
                例文
              </span>
            ))}
          </div>
          <div className="color-grid">
            {HEAT_FIELDS.map((f) => (
              <ColorField key={f.key} label={f.label} value={theme[f.key]} onChange={(v) => setField(f.key, v)} />
            ))}
          </div>
        </section>

        <section className="theme-section">
          <h3>Bảng màu</h3>
          {lowContrast && (
            <p className="theme-contrast-warning" role="alert">
              Màu "Chữ" đang tương phản thấp với nền (~{Math.min(fgVsBg, fgVsSurface).toFixed(1)}:1,
              cần ≥{MIN_TEXT_CONTRAST}:1) — chữ thường sẽ khó đọc.
            </p>
          )}
          <div className="color-grid">
            {PALETTE_FIELDS.map((f) => (
              <ColorField key={f.key} label={f.label} value={theme[f.key]} onChange={(v) => setField(f.key, v)} />
            ))}
          </div>
        </section>

        {/* Màu CỐ ĐỊNH (không dùng var(--fg)/--bg/--accent) — đây chính là các
            biến người dùng đang chỉnh ở trên; nếu họ lỡ đặt fg≈bg hay
            accent≈surface, chân modal vẫn phải thấy được để bấm "Mặc định"/"Xong"
            mà thoát ra, không bị kẹt trong một theme tự làm hỏng. */}
        <footer className="theme-actions">
          <button type="button" className="link" onClick={undo}>Hoàn tác</button>
          <button type="button" className="link" onClick={reset}>Mặc định</button>
          <button type="button" className="primary" onClick={onClose}>Xong</button>
        </footer>
      </div>
    </div>
  );
}

/** A labelled colour swatch picker paired with an editable hex field. */
function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  // Keep local text so the user can type a partial hex without it being
  // rejected mid-edit; only commit upward once it is a valid #rrggbb.
  const [raw, setRaw] = useState(value);
  useEffect(() => setRaw(value), [value]);

  const commit = (next: string) => {
    setRaw(next);
    if (isHexColor(next)) onChange(next.toLowerCase());
  };

  const swatch = isHexColor(raw) ? raw : value;

  return (
    <label className="color-field">
      <span className="cf-label">{label}</span>
      <span className="cf-controls">
        <input
          type="color"
          className="cf-swatch"
          value={swatch}
          onChange={(e) => commit(e.target.value)}
          aria-label={label}
        />
        <input
          type="text"
          className="cf-hex"
          value={raw}
          spellCheck={false}
          maxLength={7}
          onChange={(e) => commit(e.target.value)}
        />
      </span>
    </label>
  );
}
