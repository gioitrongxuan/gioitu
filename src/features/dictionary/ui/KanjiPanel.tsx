// Phân tích chữ Hán của một từ (kiểu jisho): mỗi kanji một thẻ — chữ lớn, Hán-Việt,
// JLPT/cấp, số nét, nghĩa, On/Kun, bộ phận cấu tạo; mở rộng để xem từ ví dụ (lười tải).
// Dữ liệu từ /api/kanji (server-only). Không có kanji / offline → không hiện gì.

import { useEffect, useState } from "react";
import type { KanjiEntry, KanjiExampleWord } from "@/shared/kanji";
import { fetchKanjiBreakdown, fetchKanji } from "../data/kanjiApi";

interface BreakdownProps {
  term: string;
  src: string;
  tgt: string;
  onLookup?: (term: string) => void;
}

export function KanjiBreakdown({ term, src, tgt, onLookup }: BreakdownProps) {
  const [kanji, setKanji] = useState<KanjiEntry[]>([]);

  useEffect(() => {
    let alive = true;
    fetchKanjiBreakdown(term, src, tgt).then((k) => alive && setKanji(k));
    return () => {
      alive = false;
    };
  }, [term, src, tgt]);

  if (kanji.length === 0) return null;

  return (
    <section className="kanji-breakdown">
      <h4>Chữ Hán</h4>
      {kanji.map((k) => (
        <KanjiCard key={k.literal} kanji={k} src={src} tgt={tgt} onLookup={onLookup} />
      ))}
    </section>
  );
}

function KanjiCard({
  kanji,
  src,
  tgt,
  onLookup,
}: {
  kanji: KanjiEntry;
  src: string;
  tgt: string;
  onLookup?: (term: string) => void;
}) {
  const [examples, setExamples] = useState<KanjiExampleWord[] | null>(null);
  const [open, setOpen] = useState(false);

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
        <span className="kanji-literal">{kanji.literal}</span>
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
                <dd>{kanji.onyomi.map((r) => r.text).join("、")}</dd>
              </>
            )}
            {kanji.kunyomi.length > 0 && (
              <>
                <dt>Kun</dt>
                <dd>{kanji.kunyomi.map((r) => r.text).join("、")}</dd>
              </>
            )}
          </dl>
        </div>
      </div>

      {kanji.components.length > 0 && (
        <div className="kanji-components">
          <span className="muted">Bộ phận:</span>
          {kanji.components.map((c) => (
            <span key={c} className="component">
              {c}
            </span>
          ))}
        </div>
      )}

      <button className="link kanji-examples-toggle" onClick={toggle}>
        {open ? "Ẩn từ ví dụ" : "Từ ví dụ"}
      </button>

      {open &&
        examples !== null &&
        (examples.length > 0 ? (
          <ul className="kanji-examples">
            {examples.map((e, i) => (
              <li key={i}>
                <button className="link example-word" onClick={() => onLookup?.(e.base)}>
                  {e.base}
                </button>
                {e.reading && <span className="reading">{e.reading}</span>}
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
