// Search Bar with live suggestions, scoped to a chosen language-pair dictionary
// (SPEC 3, 4.1). Forward-only: type a term in the source language → meaning.
// Kiểu jisho: mọi lựa chọn gắn vào một hàng tìm kiếm — cặp ngôn ngữ là dropdown
// bên trái, nguồn (Trên máy / Server) là segmented control bên phải — thay cho
// hai hàng pill chiếm đất phía trên ô tìm.

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
  const inputRef = useRef<HTMLInputElement>(null);
  // confirm() phải dập được gợi ý ở CẢ ba pha, kẻo dropdown mở lại đè lên kết
  // quả vừa tra: (1) effect re-run do setQuery — nuốt bằng skipSuggestRef;
  // (2) timer debounce còn treo — clearTimeout; (3) fetch đã bay đi đang chờ
  // kết quả — so epoch trước khi áp kết quả.
  const skipSuggestRef = useRef(false);
  const suggestEpochRef = useRef(0);

  // Live suggestions — does NOT increment lookup_count.
  useEffect(() => {
    if (skipSuggestRef.current) {
      skipSuggestRef.current = false;
      setSuggestions([]);
      return;
    }
    if (!query.trim()) {
      setSuggestions([]);
      return;
    }
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      const epoch = suggestEpochRef.current;
      const items = await searchSuggest(query.trim(), pair, source);
      if (epoch !== suggestEpochRef.current) return; // đã confirm trong lúc chờ
      setSuggestions(items);
      setOpen(true);
    }, 120);
    return () => window.clearTimeout(debounceRef.current);
  }, [query, pair, source]);

  async function confirm(term: string) {
    suggestEpochRef.current++;
    window.clearTimeout(debounceRef.current);
    setOpen(false);
    // Chỉ khi term khác query hiện tại thì setQuery mới re-run effect gợi ý.
    if (term !== query) skipSuggestRef.current = true;
    setSuggestions([]);
    setQuery(term);
    // Trên màn cảm ứng, thu bàn phím lại để kết quả (bottom sheet) không bị che.
    if (window.matchMedia?.("(pointer: coarse)").matches) inputRef.current?.blur();
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
      <form onSubmit={onSubmit} autoComplete="off" className="search-row">
        <PairMenu pair={pair} onChange={onPairChange} />
        <input
          ref={inputRef}
          className="search-input"
          placeholder={`Tra từ (${pair.label})…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => suggestions.length && setOpen(true)}
          aria-label="Ô tìm kiếm"
        />
        <div className="source-toggle" role="tablist" aria-label="Nguồn từ điển">
          {SOURCE_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
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
        {open && suggestions.length > 0 && (
          <ul className="suggestions" role="listbox">
            {suggestions.map((s) => (
              <li key={s.term} role="option" aria-selected={false}>
                <button type="button" onClick={() => confirm(s.term)}>
                  <span className="sug-term" lang={pair.source}>{s.term}</span>
                  {s.reading && <span className="sug-reading" lang={pair.source}>{s.reading}</span>}
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

/** Dropdown chọn cặp ngôn ngữ, gắn liền hàng tìm kiếm. */
function PairMenu({ pair, onChange }: { pair: LangPair; onChange: (pair: LangPair) => void }) {
  const [open, setOpen] = useState(false);

  const pick = (p: LangPair) => {
    setOpen(false);
    onChange(p);
  };

  return (
    <div className="pair-menu">
      <button
        type="button"
        className="pair-menu-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {pair.label}
        <span className="caret" aria-hidden>▾</span>
      </button>
      {open && (
        <>
          <div className="menu-backdrop" onClick={() => setOpen(false)} />
          <ul className="pair-menu-panel" role="listbox" aria-label="Chọn từ điển">
            {LANG_PAIRS.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={p.id === pair.id}
                  className={p.id === pair.id ? "active" : ""}
                  onClick={() => pick(p)}
                >
                  {p.label}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
