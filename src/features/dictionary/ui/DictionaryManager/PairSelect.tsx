// Language-pair selector used across the dictionary-manager tabs.

import { LANG_PAIRS, LangPair } from "@/shared/languages";

export function PairSelect({ pair, onChange }: { pair: LangPair; onChange: (p: LangPair) => void }) {
  return (
    <div className="pair-toggle manager-pair">
      {LANG_PAIRS.map((p) => (
        <button
          key={p.id}
          className={p.id === pair.id ? "active" : ""}
          onClick={() => onChange(p)}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
