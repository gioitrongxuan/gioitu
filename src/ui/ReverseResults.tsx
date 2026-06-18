// Reverse-lookup results (SPEC 4.1 Case 2): native query → target terms, each
// with a `[+]` button to add it to the Word Cloud (creates an SRS card).

import { DictEntry } from "../data/db";

interface Props {
  query: string;
  results: DictEntry[];
  onAdd: (entry: DictEntry) => void;
  onClose: () => void;
}

export function ReverseResults({ query, results, onAdd, onClose }: Props) {
  return (
    <aside className="detail-panel" aria-label="Kết quả tra ngược">
      <header>
        <h2>“{query}”</h2>
        <button className="link close" onClick={onClose}>✕</button>
      </header>
      {results.length === 0 ? (
        <p className="muted">Không có từ đích phù hợp.</p>
      ) : (
        <ul className="reverse-list">
          {results.map((r) => (
            <li key={r.term}>
              <button className="add-btn" aria-label={`Thêm ${r.term}`} onClick={() => onAdd(r)}>
                +
              </button>
              <div className="reverse-item">
                <span className="r-term">{r.term}</span>
                {r.reading && <span className="r-reading">{r.reading}</span>}
                <span className="r-def">{r.definitions[0]}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
