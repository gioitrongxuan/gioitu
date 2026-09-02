// "Quanh ta" (#294): học từ vựng theo khung cảnh — chọn một cảnh (cơ thể, trong
// nhà, nhà bếp, công ty), tranh nét hiện lên với các ghim đặt đúng chỗ vật đó
// nằm. Bấm một ghim là thấy mặt chữ + cách đọc + nghĩa, nghe phát âm được, và
// mở được nghĩa từ điển.
//
// Màn này CỐ Ý không đụng gì vào dữ liệu học: dữ liệu từ vựng là hằng số trong
// `domain/scenes.ts`, còn "xem nghĩa" đi qua đường chỉ-đọc `openWord` (không
// đếm lượt tra, không tạo entry SRS). Thêm/bớt cảnh chỉ là sửa dữ liệu + tranh.

import { useEffect, useRef, useState } from "react";
import { Furigana } from "@/shared/ui/Furigana";
import { PronounceButton } from "@/features/dictionary/ui/PronounceButton";
import { ART_H, ART_W, pinSide, pinStyle, SCENES, sceneById, SceneId, ScenePin } from "../domain/scenes";
import { SceneArt } from "./SceneArt";
import "./scenes.css";

/** Cảnh đang xem sống qua lần mở app sau — người học hay quay lại cùng một cảnh. */
const SCENE_KEY = "gioitu.scene.v1";

function loadScene(): SceneId {
  try {
    return sceneById(localStorage.getItem(SCENE_KEY) ?? "").id;
  } catch {
    return SCENES[0].id;
  }
}

interface Props {
  /** Mở nghĩa từ điển của một từ ở chế độ chỉ-đọc. */
  onSelect: (w: { term: string; term_lang: string; native_lang: string }) => void;
}

export function Scenes({ onSelect }: Props) {
  const [sceneId, setSceneId] = useState<SceneId>(loadScene);
  // Ghim đang chọn theo chỉ số trong cảnh; null = chưa chọn gì.
  const [active, setActive] = useState<number | null>(null);
  const [showLabels, setShowLabels] = useState(false);
  // Chế độ tự kiểm tra: che nghĩa tiếng Việt, mở lần lượt từng từ khi bấm.
  const [masked, setMasked] = useState(false);
  const [revealed, setRevealed] = useState<number[]>([]);
  const pinsRef = useRef<HTMLDivElement>(null);

  const scene = sceneById(sceneId);

  useEffect(() => {
    try {
      localStorage.setItem(SCENE_KEY, sceneId);
    } catch {
      // Trình duyệt chặn localStorage (chế độ riêng tư): chỉ mất việc nhớ cảnh.
    }
  }, [sceneId]);

  function chooseScene(id: SceneId) {
    setSceneId(id);
    setActive(null);
    setRevealed([]);
  }

  // Mũi tên đi giữa các ghim trên tranh (DESIGN §3.3) — thứ tự theo dữ liệu, tức
  // theo thứ tự đọc của cảnh (trên xuống dưới).
  function onPinKeyDown(event: React.KeyboardEvent) {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const count = scene.pins.length;
    const next = active == null ? 0 : (active + step + count) % count;
    setActive(next);
    const buttons = pinsRef.current?.querySelectorAll<HTMLButtonElement>(".scene-pin");
    buttons?.[next]?.focus();
  }

  const isRevealed = (i: number) => !masked || revealed.includes(i);
  const reveal = (i: number) => setRevealed((prev) => (prev.includes(i) ? prev : [...prev, i]));

  return (
    <div className="scenes">
      <div className="scene-picker" role="tablist" aria-label="Khung cảnh">
        {SCENES.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={s.id === sceneId}
            className={`scene-pick${s.id === sceneId ? " active" : ""}`}
            onClick={() => chooseScene(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="scene-head">
        <h2>
          {scene.label}{" "}
          <span className="scene-head-ja" lang="ja">
            <Furigana term={scene.ja} reading={scene.jaReading} />
          </span>
        </h2>
        <p className="muted scene-note">{scene.note}</p>
        <div className="scene-toggles">
          <label className="scene-check">
            <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
            Hiện chữ Nhật trên tranh
          </label>
          <label className="scene-check">
            <input
              type="checkbox"
              checked={masked}
              onChange={(e) => {
                setMasked(e.target.checked);
                setRevealed([]);
              }}
            />
            Che nghĩa để tự kiểm tra
          </label>
        </div>
      </div>

      <div className="scene-stage">
        <div className="scene-frame">
          <SceneArt scene={scene.id} />
          {/* Đường dẫn từ chấm số ở lề vào đúng chỗ trên thân (chỉ những ghim
              có neo) — vẽ trong SVG riêng để dùng chung hệ toạ độ với tranh. */}
          <svg className="scene-leaders" viewBox={`0 0 ${ART_W} ${ART_H}`} aria-hidden focusable="false">
            {scene.pins.map((pin, i) =>
              pin.ax == null || pin.ay == null ? null : (
                <g key={pin.term} className={i === active ? "active" : undefined}>
                  <line x1={pin.x} y1={pin.y} x2={pin.ax} y2={pin.ay} />
                  <circle cx={pin.ax} cy={pin.ay} r="1.4" />
                </g>
              ),
            )}
          </svg>
          <div
            ref={pinsRef}
            className={`scene-pins${showLabels ? " labelled" : ""}`}
            role="group"
            aria-label={`Từ vựng trong cảnh ${scene.label}`}
            onKeyDown={onPinKeyDown}
          >
            {scene.pins.map((pin, i) => (
              <button
                key={pin.term}
                type="button"
                className={`scene-pin side-${pinSide(pin)}${i === active ? " active" : ""}`}
                style={pinStyle(pin)}
                aria-pressed={i === active}
                onClick={() => {
                  setActive(i);
                  reveal(i);
                }}
              >
                <span className="scene-pin-dot">{i + 1}</span>
                <span className="scene-pin-label" lang="ja">
                  {pin.term}
                </span>
              </button>
            ))}
          </div>
        </div>

        <PinCard
          pin={active == null ? null : scene.pins[active]}
          index={active}
          revealed={active != null && isRevealed(active)}
          onReveal={() => active != null && reveal(active)}
          onOpen={(term) => onSelect({ term, term_lang: "ja", native_lang: "vi" })}
        />
      </div>

      <ol className="scene-list">
        {scene.pins.map((pin, i) => (
          <li key={pin.term} className={`scene-row${i === active ? " active" : ""}`}>
            <button
              type="button"
              className="scene-row-main"
              onClick={() => {
                setActive(i);
                reveal(i);
              }}
            >
              <span className="scene-row-no">{i + 1}</span>
              <span className="scene-row-term" lang="ja">
                <Furigana term={pin.term} reading={pin.reading} />
              </span>
              <span className="scene-row-meaning">
                {isRevealed(i) ? pin.meaning : <span className="scene-masked">Bấm để xem nghĩa</span>}
              </span>
            </button>
            <PronounceButton term={pin.term} reading={pin.reading} lang="ja" />
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Thẻ chi tiết của ghim đang chọn — chỗ neo mắt sau khi bấm lên tranh. */
function PinCard({
  pin,
  index,
  revealed,
  onReveal,
  onOpen,
}: {
  pin: ScenePin | null;
  index: number | null;
  revealed: boolean;
  onReveal: () => void;
  onOpen: (term: string) => void;
}) {
  if (!pin || index == null)
    return (
      <div className="scene-card empty">
        <p className="muted">Bấm một số trên tranh để xem từ.</p>
      </div>
    );

  return (
    <div className="scene-card">
      <div className="scene-card-head">
        <span className="scene-card-no">{index + 1}</span>
        <span className="scene-card-term" lang="ja">
          <Furigana term={pin.term} reading={pin.reading} />
        </span>
        <PronounceButton term={pin.term} reading={pin.reading} lang="ja" />
      </div>
      {revealed ? (
        <p className="scene-card-meaning">{pin.meaning}</p>
      ) : (
        <button type="button" className="link" onClick={onReveal}>
          Hiện nghĩa
        </button>
      )}
      <button type="button" className="link" onClick={() => onOpen(pin.term)}>
        Xem trong từ điển
      </button>
    </div>
  );
}
