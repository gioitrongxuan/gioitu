// Search Bar with live suggestions, scoped to a chosen language-pair dictionary
// (SPEC 3, 4.1). Forward-only: type a term in the source language → meaning.
// Phạm vi tra cứu (cặp ngôn ngữ + nguồn) chọn ở nút "Từ điển" trên header
// (DictionaryImport.tsx) — hàng này còn ô nhập, hai nút vuông (xóa, tìm), và khi
// tra tiếng Nhật thì thêm hai công cụ nhập kiểu jisho: viết tay và bộ thủ.

import { useEffect, useRef, useState } from "react";
import { DictEntry } from "@/shared/db";
import { findTermsRouted, searchSuggest, TermResult } from "../data/search";
import { DictSource } from "../domain/source";
import { glossToText } from "@/shared/structured-content";
import { LangPair } from "@/shared/languages";
import { HandwritingPad } from "./HandwritingPad";
import { RadicalPicker } from "./RadicalPicker";

/** Công cụ nhập đang mở dưới ô tìm; chỉ một cái mở tại một thời điểm. */
type Tool = "none" | "draw" | "radicals";

interface Props {
  pair: LangPair;
  /** Which dictionary database look-ups run against (Trên máy / Server). */
  source: DictSource;
  /** A term's detail is shown/confirmed → counts as a lookup (SPEC 4.1). */
  onResult: (results: TermResult[], term: string, pair: LangPair) => void;
}

export function SearchBar({ pair, source, onResult }: Props) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<DictEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [tool, setTool] = useState<Tool>("none");
  const debounceRef = useRef<number | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  // confirm() phải dập được gợi ý ở CẢ ba pha, kẻo dropdown mở lại đè lên kết
  // quả vừa tra: (1) effect re-run do setQuery — nuốt bằng skipSuggestRef;
  // (2) timer debounce còn treo — clearTimeout; (3) fetch đã bay đi đang chờ
  // kết quả — so epoch trước khi áp kết quả.
  const skipSuggestRef = useRef(false);
  const suggestEpochRef = useRef(0);
  // Chỉ tra tiếng Nhật mới có viết tay / bộ thủ (giống jisho — nhập kanji/kana).
  const supportsTools = pair.source === "ja";

  // Live suggestions — does NOT increment lookup_count. Khi một công cụ (viết
  // tay / bộ thủ) đang mở, panel công cụ thay cho dropdown gợi ý nên tắt gợi ý.
  useEffect(() => {
    if (tool !== "none") {
      setSuggestions([]);
      setOpen(false);
      return;
    }
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
  }, [query, pair, source, tool]);

  // Đổi cặp ngôn ngữ sang hướng không phải tiếng Nhật thì đóng công cụ đang mở.
  useEffect(() => {
    if (!supportsTools) setTool("none");
  }, [supportsTools]);

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

  function onClear() {
    suggestEpochRef.current++;
    setQuery("");
    setSuggestions([]);
    setOpen(false);
    inputRef.current?.focus();
  }

  // Công cụ viết tay / bộ thủ chèn ký tự vào ô tìm (nối thêm), rồi để người dùng
  // tự bấm tìm — giống jisho, dựng dần cụm từ. Giữ panel mở để chèn tiếp.
  function insert(char: string) {
    setQuery((q) => q + char);
    inputRef.current?.focus();
  }

  function toggleTool(next: Tool) {
    setTool((cur) => (cur === next ? "none" : next));
  }

  return (
    <div className="searchbar">
      <form onSubmit={onSubmit} autoComplete="off" className="search-row">
        <input
          ref={inputRef}
          className="search-input"
          placeholder={`Tra từ (${pair.label})…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => tool === "none" && suggestions.length && setOpen(true)}
          aria-label="Ô tìm kiếm"
        />
        {query && (
          <button type="button" className="search-icon-btn" aria-label="Xóa" onClick={onClear}>
            ✕
          </button>
        )}
        {supportsTools && (
          <>
            <button
              type="button"
              className={`search-icon-btn search-tool${tool === "draw" ? " active" : ""}`}
              aria-label="Viết tay"
              aria-pressed={tool === "draw"}
              title="Viết tay"
              onClick={() => toggleTool("draw")}
            >
              ✏️
            </button>
            <button
              type="button"
              className={`search-icon-btn search-tool${tool === "radicals" ? " active" : ""}`}
              aria-label="Bộ thủ"
              aria-pressed={tool === "radicals"}
              title="Bộ thủ"
              lang="ja"
              onClick={() => toggleTool("radicals")}
            >
              部
            </button>
          </>
        )}
        <button type="submit" className="search-icon-btn search-submit" aria-label="Tìm kiếm">
          🔍
        </button>
        {open && tool === "none" && suggestions.length > 0 && (
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

      {tool === "draw" && <HandwritingPad onInsert={insert} />}
      {tool === "radicals" && <RadicalPicker onInsert={insert} />}
    </div>
  );
}
