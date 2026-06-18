// Search Bar with live suggestions and dual-direction lookup (SPEC 3, 4.1).

import { useEffect, useRef, useState } from "react";
import { DictEntry } from "../data/db";
import { searchForward, searchReverse, searchSuggest } from "../data/search";

export type SearchDirection = "forward" | "reverse";

interface Props {
  direction: SearchDirection;
  onDirectionChange: (d: SearchDirection) => void;
  /** Case 1: a term's detail is shown/confirmed → counts as a lookup. */
  onForwardResult: (entry: DictEntry | null, term: string) => void;
  /** Case 2: native query produced candidate target terms. */
  onReverseResults: (entries: DictEntry[], query: string) => void;
}

export function SearchBar({ direction, onDirectionChange, onForwardResult, onReverseResults }: Props) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<DictEntry[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<number | undefined>(undefined);

  // Live suggestions (forward only) — does NOT increment lookup_count.
  useEffect(() => {
    if (direction !== "forward" || !query.trim()) {
      setSuggestions([]);
      return;
    }
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      setSuggestions(await searchSuggest(query.trim()));
      setOpen(true);
    }, 120);
    return () => window.clearTimeout(debounceRef.current);
  }, [query, direction]);

  async function confirmForward(term: string) {
    setOpen(false);
    setQuery(term);
    const entry = await searchForward(term);
    onForwardResult(entry, term);
  }

  async function confirmReverse(q: string) {
    const results = await searchReverse(q);
    onReverseResults(results, q);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    if (direction === "forward") await confirmForward(q);
    else await confirmReverse(q);
  }

  return (
    <div className="searchbar">
      <div className="direction-toggle" role="tablist" aria-label="Hướng tra cứu">
        <button
          role="tab"
          aria-selected={direction === "forward"}
          className={direction === "forward" ? "active" : ""}
          onClick={() => onDirectionChange("forward")}
        >
          Đích → Mẹ đẻ
        </button>
        <button
          role="tab"
          aria-selected={direction === "reverse"}
          className={direction === "reverse" ? "active" : ""}
          onClick={() => onDirectionChange("reverse")}
        >
          Mẹ đẻ → Đích
        </button>
      </div>

      <form onSubmit={onSubmit} autoComplete="off">
        <input
          className="search-input"
          placeholder={direction === "forward" ? "Tra từ… (Enter để xác nhận)" : "Nhập nghĩa tiếng mẹ đẻ…"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => suggestions.length && setOpen(true)}
          aria-label="Ô tìm kiếm"
        />
        {open && suggestions.length > 0 && (
          <ul className="suggestions" role="listbox">
            {suggestions.map((s) => (
              <li key={s.term} role="option" aria-selected={false}>
                <button type="button" onClick={() => confirmForward(s.term)}>
                  <span className="sug-term">{s.term}</span>
                  {s.reading && <span className="sug-reading">{s.reading}</span>}
                  <span className="sug-def">{s.definitions[0]}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>
    </div>
  );
}
