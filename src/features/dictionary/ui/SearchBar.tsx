// Search Bar with live suggestions, scoped to a chosen language-pair dictionary
// (SPEC 3, 4.1). Forward-only: type a term in the source language → meaning.

import { useEffect, useRef, useState } from "react";
import { DictEntry } from "@/shared/db";
import { findTermsRouted, searchSuggest, TermResult } from "../data/search";
import { DictSource, SOURCE_OPTIONS } from "../domain/source";
import { glossToText } from "@/shared/structured-content";
import { LANG_PAIRS, LangPair } from "@/shared/languages";

interface Props {
  pair: LangPair;
  onPairChange: (pair: LangPair) => void;
  /** Which dictionary database look-ups run against (Trên máy / Server). */
  source: DictSource;
  onSourceChange: (source: DictSource) => void;
  /** A term's detail is shown/confirmed → counts as a lookup (SPEC 4.1). */
  onResult: (results: TermResult[], term: string, pair: LangPair) => void;
}

export function SearchBar({ pair, onPairChange, source, onSourceChange, onResult }: Props) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<DictEntry[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<number | undefined>(undefined);

  // Live suggestions — does NOT increment lookup_count.
  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      return;
    }
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      setSuggestions(await searchSuggest(query.trim(), pair, source));
      setOpen(true);
    }, 120);
    return () => window.clearTimeout(debounceRef.current);
  }, [query, pair, source]);

  async function confirm(term: string) {
    setOpen(false);
    setQuery(term);
    const results = await findTermsRouted(term, pair, source);
    onResult(results, term, pair);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q) await confirm(q);
  }

  return (
    <div className="searchbar">
      <div className="searchbar-toggles">
        <div className="pair-toggle" role="tablist" aria-label="Chọn từ điển">
          {LANG_PAIRS.map((p) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={p.id === pair.id}
              className={p.id === pair.id ? "active" : ""}
              onClick={() => onPairChange(p)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="source-toggle" role="tablist" aria-label="Nguồn từ điển">
          {SOURCE_OPTIONS.map((o) => (
            <button
              key={o.value}
              role="tab"
              aria-selected={o.value === source}
              className={o.value === source ? "active" : ""}
              onClick={() => onSourceChange(o.value)}
              title={o.value === "local" ? "Từ điển đã nhập trên máy (IndexedDB)" : "Từ điển trên máy chủ (Cloud)"}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={onSubmit} autoComplete="off">
        <input
          className="search-input"
          placeholder={`Tra từ (${pair.label})… Enter để xác nhận`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => suggestions.length && setOpen(true)}
          aria-label="Ô tìm kiếm"
        />
        {open && suggestions.length > 0 && (
          <ul className="suggestions" role="listbox">
            {suggestions.map((s) => (
              <li key={s.term} role="option" aria-selected={false}>
                <button type="button" onClick={() => confirm(s.term)}>
                  <span className="sug-term">{s.term}</span>
                  {s.reading && <span className="sug-reading">{s.reading}</span>}
                  <span className="sug-def">{glossToText(s.definitions[0])}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>
    </div>
  );
}
