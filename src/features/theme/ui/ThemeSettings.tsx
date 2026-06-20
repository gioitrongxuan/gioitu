// Theme settings screen: a dismissible modal to customise the palette — the
// word-cloud heatmap above all, plus accent/warning/surface colours. Edits are
// applied live across the whole app (via the ThemeProvider) so the preview row
// and the real UI behind the modal both update as you drag a colour. Changes
// persist automatically; "Hoàn tác" reverts to the palette at open time and
// "Mặc định" restores the built-in theme.

import { useEffect, useState } from "react";
import { useTheme } from "../ThemeProvider";
import {
  Theme,
  THEME_PRESETS,
  isHexColor,
  heatBackground,
  heatTextColor,
} from "../domain/theme";

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
  { key: "fg", label: "Chữ" },
  { key: "muted", label: "Chữ phụ" },
  { key: "line", label: "Đường kẻ" },
];

// Sample shades for the live heatmap strip (low → high look-up frequency).
const PREVIEW_SHADES = [0, 0.25, 0.5, 0.75, 1];

export function ThemeSettings({ onClose }: Props) {
  const { theme, setTheme, setField, reset } = useTheme();
  // Snapshot the palette as it was when the modal opened, for "Hoàn tác".
  const [initial] = useState<Theme>(theme);

  const activePreset = THEME_PRESETS.find(
    (p) => (Object.keys(p.theme) as (keyof Theme)[]).every((k) => p.theme[k] === theme[k]),
  );

  return (
    <div className="theme-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="theme-card" role="dialog" aria-label="Giao diện">
        <header className="manager-head">
          <h2>Giao diện</h2>
          <button className="auth-close" aria-label="Đóng" onClick={onClose}>×</button>
        </header>

        <section className="theme-section">
          <h3>Mẫu có sẵn</h3>
          <div className="preset-row">
            {THEME_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`preset-chip${activePreset?.id === preset.id ? " active" : ""}`}
                onClick={() => setTheme({ ...preset.theme })}
              >
                <span
                  className="preset-swatch"
                  style={{
                    background: `linear-gradient(135deg, ${preset.theme.heatFrom}, ${preset.theme.heatTo})`,
                  }}
                  aria-hidden
                />
                {preset.name}
              </button>
            ))}
          </div>
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
          <div className="color-grid">
            {PALETTE_FIELDS.map((f) => (
              <ColorField key={f.key} label={f.label} value={theme[f.key]} onChange={(v) => setField(f.key, v)} />
            ))}
          </div>
        </section>

        <footer className="theme-actions">
          <button type="button" className="link" onClick={() => setTheme(initial)}>Hoàn tác</button>
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
