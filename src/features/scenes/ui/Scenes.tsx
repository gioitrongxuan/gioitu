// "Quanh ta" (#294): học từ vựng theo khung cảnh — chọn một cảnh (cơ thể, trong
// nhà, nhà bếp, công ty), tranh nét hiện lên với các ghim đặt đúng chỗ vật đó
// nằm — cảnh cơ thể vẽ theo lối hình giải phẫu: ô chú giải ở lề có hình nhỏ của
// chính bộ phận đó. Bấm một ghim là thấy mặt chữ + cách đọc + nghĩa, nghe phát
// âm được, và mở được nghĩa từ điển.
//
// Màn này CỐ Ý không đụng gì vào dữ liệu học: dữ liệu từ vựng là hằng số trong
// `domain/scenes.ts`, còn "xem nghĩa" đi qua đường chỉ-đọc `openWord` (không
// đếm lượt tra, không tạo entry SRS). Thêm/bớt cảnh chỉ là sửa dữ liệu + tranh.

import { useEffect, useRef, useState } from "react";
import { Furigana } from "@/shared/ui/Furigana";
import { PronounceButton } from "@/features/dictionary/ui/PronounceButton";
import { hasCallout, pinSide, pinStyle, SCENES, sceneById, SceneId, ScenePin } from "../domain/scenes";
import { SceneArt, SceneThumb } from "./SceneArt";
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
  const pickerRef = useRef<HTMLDivElement>(null);

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

  /** Bước đi của phím mũi tên; 0 nghĩa là phím không phải của điều hướng. */
  function arrowStep(key: string): number {
    if (key === "ArrowRight" || key === "ArrowDown") return 1;
    if (key === "ArrowLeft" || key === "ArrowUp") return -1;
    return 0;
  }

  // Mũi tên đi giữa các ghim trên tranh (DESIGN §3.3) — thứ tự theo dữ liệu, tức
  // theo thứ tự đọc của cảnh (trên xuống dưới).
  function onPinKeyDown(event: React.KeyboardEvent) {
    const step = arrowStep(event.key);
    if (step === 0) return;
    event.preventDefault();
    const count = scene.pins.length;
    const next = active == null ? 0 : (active + step + count) % count;
    setActive(next);
    const buttons = pinsRef.current?.querySelectorAll<HTMLButtonElement>(".scene-pin");
    buttons?.[next]?.focus();
  }

  // `role="tablist"` hứa với máy đọc màn hình là mũi tên chuyển tab được — và
  // đổi tab ở đây đổi luôn cảnh, đúng lối tab tự-kích-hoạt.
  function onPickerKeyDown(event: React.KeyboardEvent) {
    const step = arrowStep(event.key);
    if (step === 0) return;
    event.preventDefault();
    const at = SCENES.findIndex((s) => s.id === sceneId);
    const next = (at + step + SCENES.length) % SCENES.length;
    chooseScene(SCENES[next].id);
    pickerRef.current?.querySelectorAll<HTMLButtonElement>(".scene-pick")[next]?.focus();
  }

  const isRevealed = (i: number) => !masked || revealed.includes(i);
  const reveal = (i: number) => setRevealed((prev) => (prev.includes(i) ? prev : [...prev, i]));

  return (
    <div className="scenes">
      {/* Chọn cảnh bằng chính bức tranh của cảnh đó: nhìn hình là biết mình sắp
          bước vào đâu, nhanh hơn đọc năm cái nhãn chữ giống hệt nhau. */}
      <div
        ref={pickerRef}
        className="scene-picker"
        role="tablist"
        aria-label="Khung cảnh"
        onKeyDown={onPickerKeyDown}
      >
        {SCENES.map((s, i) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={s.id === sceneId}
            tabIndex={s.id === sceneId ? 0 : -1}
            className={`scene-pick${s.id === sceneId ? " active" : ""}`}
            style={{ "--i": i } as React.CSSProperties}
            onClick={() => chooseScene(s.id)}
          >
            <span className="scene-pick-art">
              <SceneThumb scene={s} />
            </span>
            <span className="scene-pick-text">
              <span className="scene-pick-label">{s.label}</span>
              <span className="scene-pick-meta">
                <span lang="ja">{s.ja}</span>
                <span className="scene-pick-count">{s.pins.length} từ</span>
              </span>
            </span>
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
        {/* Tỉ lệ khung đi theo cảnh: phòng ốc nằm ngang, cơ thể dựng đứng để
            có lề cho hai cột chú giải. */}
        {/* `key`: đổi cảnh là dựng lại khung, để tranh và các ghim chạy lại
            animation vào — chuyển cảnh có nhịp, không nhảy phắt. */}
        <div key={scene.id} className="scene-frame" style={{ aspectRatio: `${scene.art.w} / ${scene.art.h}` }}>
          <SceneArt scene={scene} active={active} />
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
                className={`scene-pin side-${pinSide(scene, pin)}${hasCallout(pin) ? " boxed" : ""}${
                  i === active ? " active" : ""
                }`}
                style={{ ...pinStyle(scene, pin), "--i": i } as React.CSSProperties}
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

      <ol key={scene.id} className="scene-list">
        {scene.pins.map((pin, i) => (
          <li
            key={pin.term}
            className={`scene-row${i === active ? " active" : ""}`}
            style={{ "--i": i } as React.CSSProperties}
          >
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
        <p className="muted">Bấm vào tranh để xem từ.</p>
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
