// Yomitan glossary / "structured content" model + helpers.
//
// A Yomitan term-bank glossary is an array whose items are one of:
//   • a plain string
//   • { type: "text", text }
//   • { type: "image", ... }
//   • { type: "structured-content", content } where `content` is a tree of
//     string | node[] | { tag, content?, ...attrs } nodes (an HTML-ish subset).
//
// We PRESERVE this structure on import (instead of flattening to plain text) so
// the UI can render rich definitions the way Yomitan does. `glossToText` is the
// inverse used wherever we only need a plain-text summary (suggestions, the SRS
// card back, the value stored on a VocabEntry).

/** A node inside a structured-content tree. */
export type SCNode =
  | string
  | number
  | null
  | undefined
  | SCNode[]
  | SCElement;

export interface SCElement {
  tag: string;
  content?: SCNode;
  /** Anchor target (Yomitan uses `?query=…` internal search links). */
  href?: string;
  /** Image fields (path within the archive; we render alt text only). */
  path?: string;
  alt?: string;
  title?: string;
  lang?: string;
  /** Inline style object Yomitan sometimes attaches. */
  style?: Record<string, string | number>;
  /** Tolerate any other attributes without losing type-safety elsewhere. */
  [key: string]: unknown;
}

/** A single glossary item: a plain string or a structured-content wrapper. */
export type GlossaryNode =
  | string
  | { type: "text"; text: string }
  | { type: "image"; path?: string; alt?: string; [k: string]: unknown }
  | { type: "structured-content"; content: SCNode }
  | { type: string; [k: string]: unknown };

/** A grouped sense (one Yomitan term-bank row), with its part-of-speech tags. */
export interface Sense {
  /** Resolved tag names (e.g. ["n", "vs"]). */
  tags: string[];
  /** The glossary nodes for this sense. */
  glossary: GlossaryNode[];
  /** Source dictionary title, when known. */
  dictionary?: string;
}

/** Recursively flatten any glossary node / structured content into plain text. */
export function glossToText(node: SCNode | GlossaryNode): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(glossToText).join("").trim();
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (typeof obj.text === "string") return obj.text;
    if ("content" in obj) {
      const sep = isBlockTag(obj.tag) ? "\n" : "";
      return (glossToText(obj.content as SCNode) + sep).replace(/\n{2,}/g, "\n");
    }
    if (obj.type === "image") return obj.alt ? `[${String(obj.alt)}]` : "";
  }
  return "";
}

/** Flatten a list of glossary nodes into one or more plain-text lines. */
export function glossaryToLines(glossary: GlossaryNode[] | undefined): string[] {
  if (!glossary) return [];
  return glossary
    .map((g) => glossToText(g).trim())
    .filter((s) => s.length > 0);
}

/** Flatten grouped senses into plain-text lines (for previews / SRS / sync). */
export function sensesToLines(senses: Sense[] | undefined): string[] {
  if (!senses) return [];
  const out: string[] = [];
  for (const s of senses) out.push(...glossaryToLines(s.glossary));
  return out;
}

/** One furigana segment: base text with an optional reading above it. */
export interface FuriganaSegment {
  text: string;
  reading?: string;
}

function isKana(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return (c >= 0x3040 && c <= 0x309f) || (c >= 0x30a0 && c <= 0x30ff) || c === 0x30fc;
}

/**
 * Distribute a whole-word reading across a mixed kanji/kana term so kana that
 * already appears (送り仮名) is not furigana'd — e.g. 食べる / たべる →
 * [食(た), べる]. A pragmatic prefix/suffix-trim version of Yomitan's algorithm.
 */
export function distributeFurigana(term: string, reading?: string): FuriganaSegment[] {
  if (!reading || reading === term) return [{ text: term }];

  let p = 0;
  while (p < term.length && p < reading.length && term[p] === reading[p] && isKana(term[p])) p++;
  let s = 0;
  while (
    s < term.length - p &&
    s < reading.length - p &&
    term[term.length - 1 - s] === reading[reading.length - 1 - s] &&
    isKana(term[term.length - 1 - s])
  ) {
    s++;
  }

  const prefix = term.slice(0, p);
  const core = term.slice(p, term.length - s);
  const suffix = term.slice(term.length - s);
  const coreReading = reading.slice(p, reading.length - s);

  const segs: FuriganaSegment[] = [];
  if (prefix) segs.push({ text: prefix });
  if (core) segs.push({ text: core, reading: coreReading || undefined });
  if (suffix) segs.push({ text: suffix });
  return segs.length ? segs : [{ text: term }];
}

const BLOCK_TAGS = new Set([
  "div",
  "p",
  "ol",
  "ul",
  "li",
  "tr",
  "table",
  "thead",
  "tbody",
  "br",
  "details",
]);

function isBlockTag(tag: unknown): boolean {
  return typeof tag === "string" && BLOCK_TAGS.has(tag);
}

/** True when a glossary node carries renderable structured content. */
export function isStructured(node: GlossaryNode): node is { type: "structured-content"; content: SCNode } {
  return typeof node === "object" && node !== null && (node as { type?: string }).type === "structured-content";
}
