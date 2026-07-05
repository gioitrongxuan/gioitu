// Phân tích chữ Hán của một từ (kiểu jisho): mỗi kanji một thẻ — chữ lớn, Hán-Việt,
// JLPT/cấp, số nét, nghĩa, On/Kun, bộ phận cấu tạo; mở rộng để xem từ ví dụ và
// thứ tự nét viết (đều lười tải). Dữ liệu từ /api/kanji (server-only) và KanjiVG.
// Không có kanji / offline → không hiện gì.

import { useEffect, useState } from "react";
import type { KanjiEntry, KanjiExampleWord } from "@/shared/kanji";
import { fetchKanjiBreakdown, fetchKanji } from "../data/kanjiApi";
import { KanjiStrokeDiagram } from "./KanjiStrokeDiagram";

interface BreakdownProps {
  term: string;
  src: string;
  tgt: string;
  onLookup?: (term: string) => void;
  /** Báo số kanji tra được sau khi tải, để nơi gọi quyết định bố cục. */
  onResolved?: (count: number) => void;
  /** Tự mở phần "từ ví dụ" khi từ chỉ gồm đúng một chữ Hán (tra riêng một kanji:
      những từ chứa nó chính là thứ người dùng cần thấy ngay). */
  autoExamples?: boolean;
}

export function KanjiBreakdown({ term, src, tgt, onLookup, onResolved, autoExamples }: BreakdownProps) {
  const [kanji, setKanji] = useState<KanjiEntry[]>([]);

  useEffect(() => {
    let alive = true;
    fetchKanjiBreakdown(term, src, tgt).then((k) => {
      if (!alive) return;
      setKanji(k);
      onResolved?.(k.length);
    });
    return () => {
      alive = false;
    };
  }, [term, src, tgt, onResolved]);

  if (kanji.length === 0) return null;

  return (
    <section className="kanji-breakdown">
      <h4>Chữ Hán</h4>
      {kanji.map((k) => (
        <KanjiCard
          key={k.literal}
          kanji={k}
          src={src}
          tgt={tgt}
          onLookup={onLookup}
          defaultOpenExamples={autoExamples === true && kanji.length === 1}
        />
      ))}
    </section>
  );
}

function KanjiCard({
  kanji,
  src,
  tgt,
  onLookup,
  defaultOpenExamples = false,
}: {
  kanji: KanjiEntry;
  src: string;
  tgt: string;
  onLookup?: (term: string) => void;
  defaultOpenExamples?: boolean;
}) {
  const [examples, setExamples] = useState<KanjiExampleWord[] | null>(null);
  const [open, setOpen] = useState(defaultOpenExamples);
  // Sơ đồ nét chỉ mount khi mở — KanjiStrokeDiagram tự tải (và cache) KanjiVG.
  const [showStrokes, setShowStrokes] = useState(false);

  // Mở sẵn (tra riêng một kanji): tải từ ví dụ ngay khi mount, vì `toggle` mới là
  // nơi tải lười nên trạng thái mở ban đầu sẽ không tự kéo dữ liệu về.
  useEffect(() => {
    if (defaultOpenExamples) {
      fetchKanji(kanji.literal, src, tgt).then((r) => setExamples(r?.examples ?? []));
    }
    // Chỉ chạy một lần khi mount; đổi kanji sẽ remount do key theo literal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && examples === null) {
      fetchKanji(kanji.literal, src, tgt).then((r) => setExamples(r?.examples ?? []));
    }
  };

  return (
    <div className="kanji-card">
      <div className="kanji-card-main">
        <span className="kanji-literal" lang="ja">{kanji.literal}</span>
        <div className="kanji-info">
          <div className="kanji-badges">
            {kanji.hanViet?.length ? <span className="han-viet">{kanji.hanViet.join(", ")}</span> : null}
            {kanji.jlpt ? <span className="badge jlpt">N{kanji.jlpt}</span> : null}
            {kanji.jouyou ? <span className="badge">Cấp {kanji.jouyou}</span> : null}
            {kanji.jinmeiyou ? <span className="badge">Tên người</span> : null}
            <span className="badge muted">{kanji.strokeCount} nét</span>
          </div>
          {kanji.meanings.length > 0 && <p className="kanji-meanings">{kanji.meanings.join("; ")}</p>}
          <dl className="kanji-readings">
            {kanji.onyomi.length > 0 && (
              <>
                <dt>On</dt>
                <dd lang="ja">{kanji.onyomi.map((r) => r.text).join("、")}</dd>
              </>
            )}
            {kanji.kunyomi.length > 0 && (
              <>
                <dt>Kun</dt>
                <dd lang="ja">{kanji.kunyomi.map((r) => r.text).join("、")}</dd>
              </>
            )}
          </dl>
        </div>
      </div>

      {kanji.components.length > 0 && (
        <div className="kanji-components">
          <span className="muted">Bộ phận:</span>
          {kanji.components.map((c) => (
            <span key={c} className="component" lang="ja">
              {c}
            </span>
          ))}
        </div>
      )}

      <div className="kanji-toggles">
        <button className="link" onClick={toggle}>
          {open ? "Ẩn từ ví dụ" : "Từ ví dụ"}
        </button>
        <button className="link" onClick={() => setShowStrokes((v) => !v)}>
          {showStrokes ? "Ẩn nét viết" : "Nét viết"}
        </button>
      </div>

      {showStrokes && <KanjiStrokeDiagram kanji={kanji.literal} />}

      {open &&
        examples !== null &&
        (examples.length > 0 ? (
          <ul className="kanji-examples">
            {examples.map((e, i) => (
              <li key={i}>
                <button className="link example-word" lang="ja" onClick={() => onLookup?.(e.base)}>
                  <HighlightKanji text={e.base} kanji={kanji.literal} />
                </button>
                {e.reading && <span className="reading" lang="ja">{e.reading}</span>}
                {e.hanViet && <span className="han-viet">{e.hanViet}</span>}
                {e.sense && <span className="muted">{e.sense}</span>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Không có từ ví dụ.</p>
        ))}
    </div>
  );
}

/** Tô đậm chữ Hán đang xét bên trong từ ví dụ (kiểu jisho). */
function HighlightKanji({ text, kanji }: { text: string; kanji: string }) {
  return (
    <>
      {[...text].map((ch, i) =>
        ch === kanji ? (
          <span key={i} className="kanji-hit">{ch}</span>
        ) : (
          ch
        ),
      )}
    </>
  );
}
