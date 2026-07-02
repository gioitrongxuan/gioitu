// Danh sách nghĩa: ưu tiên senses (đã nhóm) rồi mới tới definitions phẳng.
// Hàng tag chỉ in khi bộ tag đổi so với sense trước (tagRowVisibility) —
// giống cách jisho nhóm nghĩa theo từ loại.

import { GlossaryNode, ResolvedTag, Sense, glossaryToLines } from "@/shared/structured-content";
import { tagRowVisibility } from "../domain/senses";
import { GlossaryItemView } from "./StructuredContent";
import { TagChip } from "./TagChip";

interface Props {
  onLookup?: (term: string) => void;
}

/** Optional code→ResolvedTag map (from the entry) for rich tag display. */
type TagMeta = Record<string, ResolvedTag> | undefined;

/** Render one grouped sense: its tags (when shown), then its glossary lines. */
export function SenseView({
  sense,
  tagMeta,
  onLookup,
  showTags = true,
}: { sense: Sense; tagMeta?: TagMeta; showTags?: boolean } & Props) {
  return (
    <li className="sense">
      {showTags && sense.tags.length > 0 && (
        <span className="sense-tags">
          {sense.tags.map((t) => (
            <TagChip key={t} code={t} meta={tagMeta?.[t]} />
          ))}
        </span>
      )}
      <div className="sense-body">
        {sense.glossary.map((g, i) => (
          <div className="gloss" key={i}>
            <GlossaryItemView node={g} onLookup={onLookup} />
          </div>
        ))}
      </div>
      {sense.info && sense.info.length > 0 && (
        <div className="sense-info muted">{sense.info.join(" · ")}</div>
      )}
      {sense.examples && sense.examples.length > 0 && (
        <ul className="sense-examples">
          {sense.examples.map((ex, i) => (
            <li className="example" key={i}>
              <span className="example-ja" lang="ja">{ex.ja}</span>
              <span className="example-vi">{ex.vi}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Render senses (preferred) or fall back to flat string definitions. */
export function Definitions({
  senses,
  definitions,
  tagMeta,
  onLookup,
}: { senses?: Sense[]; definitions?: GlossaryNode[]; tagMeta?: TagMeta } & Props) {
  if (senses && senses.length > 0) {
    const showTags = tagRowVisibility(senses);
    return (
      <ol className="senses">
        {senses.map((s, i) => (
          <SenseView key={i} sense={s} tagMeta={tagMeta} onLookup={onLookup} showTags={showTags[i]} />
        ))}
      </ol>
    );
  }
  const lines = glossaryToLines(definitions);
  return (
    <ol className="senses">
      {lines.map((d, i) => (
        <li className="sense" key={i}>
          <div className="sense-body">
            <div className="gloss">{d}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}
