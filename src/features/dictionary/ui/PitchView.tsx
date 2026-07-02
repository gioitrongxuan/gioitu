// Phát âm: sơ đồ pitch accent kiểu OJAD và IPA từ các từ điển term-meta.

import type { PitchAccent } from "@/shared/dictionary";
import { Pronunciation } from "@/shared/term-meta";
import { parsePitch } from "../domain/pitch";

/** Sơ đồ pitch accent kiểu OJAD: gạch trên ở mora cao, bước xuống ở chỗ rớt giọng. */
export function PitchView({ pitch }: { pitch?: PitchAccent[] }) {
  const usable = (pitch ?? []).filter((p) => p.accent && p.moras && p.moras.length);
  if (!usable.length) return null;
  return (
    <div className="pitches" aria-label="Giọng cao thấp">
      {usable.map((p, i) => {
        const parsed = parsePitch(p.accent, p.moras ?? []);
        if (!parsed) return null;
        return (
          <div className="pitch" key={i} lang="ja">
            {parsed.moras.map((m, j) => (
              <span key={j} className={`pitch-mora${m.high ? " high" : " low"}${m.dropsAfter ? " drop" : ""}`}>
                {m.mora}
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/**
 * IPA pronunciations from term-meta dictionaries, grouped by source dictionary.
 * Each transcription shows its accent/region tags (Hanoi / Huế / Sài Gòn…).
 */
export function Pronunciations({ pronunciations }: { pronunciations: Pronunciation[] }) {
  if (!pronunciations.length) return null;
  return (
    <div className="pronunciations" aria-label="Phát âm">
      {pronunciations.map((p, i) => (
        <div className="pron-group" key={i}>
          {p.dictionary && <span className="pron-dict">{p.dictionary}</span>}
          {p.transcriptions.map((t, j) => (
            <span className="ipa" key={j}>
              <span className="ipa-text">{t.ipa}</span>
              {t.tags?.map((tag) => (
                <span className="ipa-tag" key={tag}>{tag}</span>
              ))}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
