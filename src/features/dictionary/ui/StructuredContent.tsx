// Renderer for Yomitan glossary / structured content (an HTML-ish subset),
// plus a furigana headword. Tags are whitelisted; internal `?query=` links call
// back into the look-up; images degrade to their alt text (we don't store blobs).

import { Fragment, ReactNode } from "react";
import {
  GlossaryNode,
  SCNode,
  SCElement,
  Sense,
  distributeFurigana,
  glossaryToLines,
} from "@/shared/structured-content";

interface Props {
  onLookup?: (term: string) => void;
}

// Tags we render as themselves; everything else falls back to <span>/<div>.
const INLINE_TAGS = new Set(["span", "ruby", "rt", "rp", "b", "strong", "em", "i", "u", "sub", "sup", "code", "a"]);
const BLOCK_TAGS = new Set(["div", "p", "ol", "ul", "li", "table", "thead", "tbody", "tr", "td", "th", "details", "summary", "br"]);

function tagFor(tag: string): keyof JSX.IntrinsicElements {
  if (INLINE_TAGS.has(tag) || BLOCK_TAGS.has(tag)) return tag as keyof JSX.IntrinsicElements;
  return BLOCK_TAGS.has(tag) ? "div" : "span";
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

  // Images aren't bundled with us; show the alt text so meaning isn't lost.
  if (tag === "img") {
    const alt = typeof el.alt === "string" ? el.alt : typeof el.title === "string" ? el.title : "hình";
    return <span className="sc-img">[{alt}]</span>;
  }

  const children = <StructuredNode node={el.content} onLookup={onLookup} />;

  // Links: internal `?query=…` → look-up; absolute http(s) → new tab; else inert.
  if (tag === "a") {
    const href = typeof el.href === "string" ? el.href : "";
    const internal = href.match(/[?&]query=([^&]+)/);
    if (internal && onLookup) {
      const q = decodeURIComponent(internal[1]);
      return (
        <button type="button" className="sc-link" onClick={() => onLookup(q)}>
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

  const Tag = tagFor(tag);
  const title = typeof el.title === "string" ? el.title : undefined;
  const lang = typeof el.lang === "string" ? el.lang : undefined;
  return (
    <Tag className={`sc-${tag}`} title={title} lang={lang}>
      {children}
    </Tag>
  );
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

/** Render one grouped sense: its tags, then its glossary lines. */
export function SenseView({ sense, onLookup }: { sense: Sense } & Props) {
  return (
    <li className="sense">
      {sense.tags.length > 0 && (
        <span className="sense-tags">
          {sense.tags.map((t) => (
            <span key={t} className="pos-tag" title={t}>
              {t}
            </span>
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
    </li>
  );
}

/** Render senses (preferred) or fall back to flat string definitions. */
export function Definitions({
  senses,
  definitions,
  onLookup,
}: { senses?: Sense[]; definitions?: GlossaryNode[] } & Props) {
  if (senses && senses.length > 0) {
    return (
      <ol className="senses">
        {senses.map((s, i) => (
          <SenseView key={i} sense={s} onLookup={onLookup} />
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
