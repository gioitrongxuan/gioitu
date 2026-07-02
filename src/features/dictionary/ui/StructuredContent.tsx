// Renderer for Yomitan glossary / structured content (an HTML-ish subset).
// Ported to follow Yomitan's StructuredContentGenerator more closely:
//   • inline `style` objects are applied (font, colour, margins, decoration…),
//   • `data` objects become `data-sc-*` attributes (theme/CSS hooks),
//   • tables get colSpan/rowSpan and a horizontal-scroll container,
//   • <details>/<summary>, list `start`/`listStyleType`, and `lang` are honoured.
// Tags are whitelisted; internal `?query=` links call back into the look-up;
// images degrade to their alt text (we don't store blobs).
//
// Các component hiển thị mục từ (Furigana, TagChip, Definitions, PitchView,
// Media) tách ra file riêng cùng thư mục; đây chỉ còn renderer thuần.

import { CSSProperties, ReactNode } from "react";
import { GlossaryNode, SCNode, SCElement } from "@/shared/structured-content";

interface Props {
  onLookup?: (term: string) => void;
}

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
