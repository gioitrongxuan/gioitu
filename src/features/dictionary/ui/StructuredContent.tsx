// Renderer for Yomitan glossary / structured content (an HTML-ish subset),
// plus a furigana headword and rich part-of-speech tags. Ported to follow
// Yomitan's StructuredContentGenerator more closely than before:
//   • inline `style` objects are applied (font, colour, margins, decoration…),
//   • `data` objects become `data-sc-*` attributes (theme/CSS hooks),
//   • tables get colSpan/rowSpan and a horizontal-scroll container,
//   • <details>/<summary>, list `start`/`listStyleType`, and `lang` are honoured.
// Tags are whitelisted; internal `?query=` links call back into the look-up;
// images degrade to their alt text (we don't store blobs).

import { CSSProperties, Fragment, ReactNode } from "react";
import {
  GlossaryNode,
  ResolvedTag,
  SCNode,
  SCElement,
  Sense,
  distributeFurigana,
  glossaryToLines,
} from "@/shared/structured-content";
import type { PitchAccent, DictImage, DictComment } from "@/shared/dictionary";
import { Pronunciation } from "@/shared/term-meta";
import { parsePitch } from "../domain/pitch";

interface Props {
  onLookup?: (term: string) => void;
}

/** Optional code→ResolvedTag map (from the entry) for rich tag display. */
type TagMeta = Record<string, ResolvedTag> | undefined;

// Tags we render as themselves; everything else falls back to <span>.
const INLINE_TAGS = new Set(["span", "ruby", "rt", "rp", "b", "strong", "em", "i", "u", "sub", "sup", "code", "a"]);
const BLOCK_TAGS = new Set(["div", "p", "ol", "ul", "li", "table", "thead", "tbody", "tfoot", "tr", "td", "th", "details", "summary"]);

function tagFor(tag: string): keyof JSX.IntrinsicElements {
  if (INLINE_TAGS.has(tag) || BLOCK_TAGS.has(tag)) return tag as keyof JSX.IntrinsicElements;
  return "span";
}

// --- inline style ------------------------------------------------------------
// A whitelist mirroring Yomitan's _setStructuredContentElementStyle. String
// values pass through; numeric margins become `em` (as Yomitan does).
const STYLE_STRING_PROPS = [
  "fontStyle", "fontWeight", "fontSize", "color", "background", "backgroundColor",
  "verticalAlign", "textAlign", "textEmphasis", "textShadow", "textDecorationStyle",
  "textDecorationColor", "borderColor", "borderStyle", "borderRadius", "borderWidth",
  "clipPath", "wordBreak", "whiteSpace", "cursor", "listStyleType",
  "padding", "paddingTop", "paddingLeft", "paddingRight", "paddingBottom", "margin",
] as const;
const MARGIN_EM_PROPS = ["marginTop", "marginLeft", "marginRight", "marginBottom"] as const;

function scStyle(style: Record<string, unknown> | undefined): CSSProperties | undefined {
  if (!style || typeof style !== "object") return undefined;
  const out: Record<string, string> = {};
  for (const key of STYLE_STRING_PROPS) {
    const v = style[key];
    if (typeof v === "string") out[key] = v;
  }
  for (const key of MARGIN_EM_PROPS) {
    const v = style[key];
    if (typeof v === "number") out[key] = `${v}em`;
    else if (typeof v === "string") out[key] = v;
  }
  // textDecorationLine may be a string or array of lines → CSS `text-decoration`.
  const tdl = style.textDecorationLine;
  if (typeof tdl === "string") out.textDecoration = tdl;
  else if (Array.isArray(tdl)) out.textDecoration = tdl.join(" ");
  return Object.keys(out).length ? (out as CSSProperties) : undefined;
}

function camelToKebab(s: string): string {
  return s.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
}

/** Yomitan `data` object → `data-sc-*` attributes (string values only). */
function dataAttrs(data: unknown): Record<string, string> {
  if (!data || typeof data !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (!k) continue;
    out[`data-sc-${camelToKebab(k)}`] = String(v);
  }
  return out;
}

/** Render an arbitrary structured-content node tree. */
export function StructuredNode({ node, onLookup }: { node: SCNode } & Props): ReactNode {
  if (node == null) return null;
  if (typeof node === "string" || typeof node === "number") return <>{node}</>;
  if (Array.isArray(node)) {
    return (
      <>
        {node.map((child, i) => (
          <StructuredNode key={i} node={child} onLookup={onLookup} />
        ))}
      </>
    );
  }

  const el = node as SCElement;
  const tag = typeof el.tag === "string" ? el.tag : "span";

  if (tag === "br") return <br />;

  // Images aren't bundled with us; show the alt/title text so meaning isn't lost.
  if (tag === "img") {
    const alt = typeof el.alt === "string" ? el.alt : typeof el.title === "string" ? el.title : "hình";
    return <span className="sc-img">[{alt}]</span>;
  }

  const children = <StructuredNode node={el.content} onLookup={onLookup} />;

  if (tag === "a") return renderLink(el, children, onLookup);

  // Common attributes shared by every rendered element.
  const common: Record<string, unknown> = {
    className: `sc-${tag}`,
    style: scStyle(el.style),
    title: typeof el.title === "string" ? el.title : undefined,
    lang: typeof el.lang === "string" ? el.lang : undefined,
    ...dataAttrs(el.data),
  };

  // Tables: wrap in a scroll container so wide tables never blow out the panel.
  if (tag === "table") {
    const Table = "table" as const;
    return (
      <div className="sc-table-container">
        <Table {...common}>{children}</Table>
      </div>
    );
  }

  if (tag === "td" || tag === "th") {
    const Cell = tag;
    return (
      <Cell
        {...common}
        colSpan={typeof el.colSpan === "number" ? el.colSpan : undefined}
        rowSpan={typeof el.rowSpan === "number" ? el.rowSpan : undefined}
      >
        {children}
      </Cell>
    );
  }

  if (tag === "details") {
    return (
      <details {...common} open={el.open === true}>
        {children}
      </details>
    );
  }

  if (tag === "ol") {
    return (
      <ol
        {...common}
        start={typeof el.start === "number" ? el.start : undefined}
        type={typeof el.type === "string" ? (el.type as "1" | "a" | "A" | "i" | "I") : undefined}
      >
        {children}
      </ol>
    );
  }

  const Tag = tagFor(tag);
  return (
    <Tag {...common}>{children}</Tag>
  );
}

function renderLink(el: SCElement, children: ReactNode, onLookup?: (term: string) => void): ReactNode {
  const href = typeof el.href === "string" ? el.href : "";
  // Yomitan internal search links start with `?` (e.g. ?query=猫&wildcards=off).
  const internalQuery = href.startsWith("?") ? new URLSearchParams(href.slice(1)).get("query") : null;
  if (internalQuery && onLookup) {
    return (
      <button type="button" className="sc-link" onClick={() => onLookup(internalQuery)}>
        {children}
      </button>
    );
  }
  if (/^https?:\/\//.test(href)) {
    return (
      <a className="sc-link" href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  }
  return <span className="sc-link">{children}</span>;
}

/** Render a single glossary node (string, {text}, image, or structured content). */
export function GlossaryItemView({ node, onLookup }: { node: GlossaryNode } & Props): ReactNode {
  if (typeof node === "string") return <>{node}</>;
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (obj.type === "structured-content") {
      return <StructuredNode node={obj.content as SCNode} onLookup={onLookup} />;
    }
    if (obj.type === "image") {
      const alt = typeof obj.alt === "string" ? obj.alt : "hình";
      return <span className="sc-img">[{alt}]</span>;
    }
    if (typeof obj.text === "string") return <>{obj.text}</>;
  }
  return null;
}

/** A part-of-speech / term tag chip: compact code label, full name on hover. */
export function TagChip({ code, meta, kind = "pos" }: { code: string; meta?: ResolvedTag; kind?: "pos" | "term" }) {
  const category = meta?.category ?? (kind === "term" ? "default" : "partOfSpeech");
  const title = meta?.name ?? code;
  return (
    <span className={kind === "term" ? "term-tag" : "pos-tag"} data-category={category} title={title}>
      {code}
    </span>
  );
}

/** Render one grouped sense: its tags, then its glossary lines. */
export function SenseView({ sense, tagMeta, onLookup }: { sense: Sense; tagMeta?: TagMeta } & Props) {
  return (
    <li className="sense">
      {sense.tags.length > 0 && (
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
    return (
      <ol className="senses">
        {senses.map((s, i) => (
          <SenseView key={i} sense={s} tagMeta={tagMeta} onLookup={onLookup} />
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

/** A headword rendered with furigana ruby over the kanji. */
export function Furigana({ term, reading }: { term: string; reading?: string }) {
  const segments = distributeFurigana(term, reading);
  return (
    <span className="furigana">
      {segments.map((seg, i) =>
        seg.reading ? (
          <ruby key={i}>
            {seg.text}
            <rt>{seg.reading}</rt>
          </ruby>
        ) : (
          <Fragment key={i}>{seg.text}</Fragment>
        ),
      )}
    </span>
  );
}

/** Huy hiệu cạnh headword: cấp JLPT + chữ Hán-Việt (riêng cho người Việt). */
export function HeadwordBadges({ hanViet, jlpt }: { hanViet?: string; jlpt?: number }) {
  if (!hanViet && !jlpt) return null;
  return (
    <div className="headword-badges">
      {jlpt ? <span className="jlpt-badge" title={`Trình độ JLPT N${jlpt}`}>N{jlpt}</span> : null}
      {hanViet ? <span className="hanviet" title="Âm Hán-Việt">{hanViet}</span> : null}
    </div>
  );
}

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

/** Gallery ảnh minh hoạ (read-only, hotlink). Ẩn ảnh hỏng; mở lớn ở tab mới. */
export function ImageGallery({ images }: { images?: DictImage[] }) {
  if (!images || !images.length) return null;
  return (
    <div className="word-images" aria-label="Ảnh minh hoạ">
      {images.map((im, i) => (
        <a key={i} className="word-image" href={im.url} target="_blank" rel="noopener noreferrer">
          <img
            src={im.url}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(e) => {
              const a = e.currentTarget.closest(".word-image");
              if (a instanceof HTMLElement) a.style.display = "none";
            }}
          />
        </a>
      ))}
    </div>
  );
}

/** Bình luận cộng đồng (read-only, nhập từ Mazii). */
export function CommentList({ comments }: { comments?: DictComment[] }) {
  if (!comments || !comments.length) return null;
  return (
    <div className="word-comments">
      <div className="word-comments-head">
        Bình luận cộng đồng <span className="muted">· Mazii</span>
      </div>
      <ul>
        {comments.map((c, i) => (
          <li className="comment" key={i}>
            {c.avatar && (
              <img
                className="comment-avatar"
                src={c.avatar}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.style.visibility = "hidden";
                }}
              />
            )}
            <div className="comment-body">
              <div className="comment-mean">{c.mean}</div>
              <div className="comment-meta muted">
                {c.author && <span className="comment-author">{c.author}</span>}
                {(c.likes ?? 0) > 0 && <span className="comment-likes">👍 {c.likes}</span>}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
