// The one place that renders a *saved* word, shared by the detail panel and the
// review card so a word looks identical wherever it appears and regardless of
// where it came from (gioitu dictionary or Yomitan). It mirrors the live
// structured-content layout: a furigana headword, part-of-speech chips, then
// the gloss lines — reusing the `.senses/.sense/.gloss` and `.pos-tag` styles
// so there is a single style to tweak.
//
// Stored meanings are plain gloss lines (a JSON string[] — see
// review/domain/lookup and the Yomitan sync), so the glossary is text-only;
// live dictionary search keeps its richer renderer in StructuredContent.

import { Furigana } from "./Furigana";

interface Props {
  /** Headword; rendered with furigana when `reading` is given. Omit to hide it
   *  (e.g. the detail panel already shows the word in its title). */
  term?: string;
  reading?: string;
  /** Part-of-speech text, e.g. "noun, suru verb". */
  pos?: string;
  /** Stored meaning (JSON string[] or plain text). */
  meaning: string;
  /** Example sentence, shown apart from the numbered glosses. */
  example?: string;
}

/** Parse a stored `meaning` (JSON string[] or plain text) into gloss lines. */
export function meaningToLines(meaning: string): string[] {
  try {
    const parsed = JSON.parse(meaning);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {
    /* plain text, not JSON */
  }
  return meaning ? [meaning] : [];
}

export function MeaningView({ term, reading, pos, meaning, example }: Props) {
  const lines = meaningToLines(meaning);
  const posTags = pos ? pos.split(/[,、;；]/).map((t) => t.trim()).filter(Boolean) : [];

  return (
    <div className="meaning-view">
      {term && (
        <div className="meaning-headword">
          <Furigana term={term} reading={reading} />
        </div>
      )}

      {posTags.length > 0 && (
        <div className="meaning-pos">
          {posTags.map((p, i) => (
            <span className="pos-tag" key={i}>{p}</span>
          ))}
        </div>
      )}

      {lines.length > 0 && (
        <ol className="senses">
          {lines.map((line, i) => (
            <li className="sense" key={i}>
              <div className="sense-body">
                <div className="gloss">{line}</div>
              </div>
            </li>
          ))}
        </ol>
      )}

      {example && <p className="meaning-example">{example}</p>}
    </div>
  );
}
