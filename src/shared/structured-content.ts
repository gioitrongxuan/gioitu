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

/**
 * A part-of-speech / term tag resolved against a Yomitan `tag_bank` (or our
 * built-in fallback): the raw code keeps working everywhere, but the UI can now
 * show a full name, a category (→ colour) and an explanatory note on hover.
 */
export interface ResolvedTag {
  /** Raw code as it appears in the term bank (e.g. "n", "v5k", "adj-i"). */
  code: string;
  /** Human-readable name (e.g. "noun", "Godan verb"). Falls back to the code. */
  name: string;
  /** Yomitan tag category (partOfSpeech, expression, popular, …) → colour. */
  category: string;
  /** Longer description shown as a tooltip, when known. */
  notes?: string;
}

/** A grouped sense (one Yomitan term-bank row), with its part-of-speech tags. */
export interface Sense {
  /** Resolved tag names (e.g. ["n", "vs"]). */
  tags: string[];
  /** The glossary nodes for this sense. */
  glossary: GlossaryNode[];
  /** Source dictionary title, when known. */
  dictionary?: string;
  /** Example sentences for this sense (ja + vi). From Mazii / rich sources. */
  examples?: { ja: string; vi: string }[];
  /** Usage notes for this sense (JMdict `info`) — shown as a muted footnote. */
  info?: string[];
}

// Wiktionary-to-Yomitan / Kaikki dictionaries (e.g. wty-ja-vi) label the parts
// of their structured content via `data.content`. The actual definitions live
// in a `glosses` list; etymology and examples sit in collapsible <details>; an
// attribution `backlink` trails every entry. Flattening the whole tree (the old
// behaviour) buried the real meaning under that scaffolding — so the plain-text
// extractors below pull out the `glosses` section and drop the rest.
const SECTION_GLOSSES = "glosses";
/**
 * Sections dropped from plain-text meaning entirely: attribution links and the
 * inline register/POS tag chips (those are surfaced separately as tag chips, so
 * in the meaning text they'd just be noise — "inf\nKẻ biến thái." → "Kẻ biến thái.").
 */
const NOISE_SECTIONS = new Set(["backlink", "attribution", "tag", "tags"]);

function dataContent(obj: Record<string, unknown>): string | undefined {
  const data = obj.data;
  if (data && typeof data === "object") {
    const c = (data as Record<string, unknown>).content;
    if (typeof c === "string") return c;
  }
  return undefined;
}

/** First descendant element carrying `data.content === label` (DFS), else null. */
function findSection(node: SCNode, label: string): SCElement | null {
  if (node == null || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const c of node) {
      const f = findSection(c, label);
      if (f) return f;
    }
    return null;
  }
  const obj = node as SCElement;
  if (dataContent(obj) === label) return obj;
  return obj.content !== undefined ? findSection(obj.content, label) : null;
}

/**
 * Recursively collect plain text. Always drops attribution/backlink sections;
 * when `skipDetails` is set, also drops collapsible <details> blocks (etymology
 * / examples) so a sense's concise meaning isn't swamped by them.
 */
function collectText(node: SCNode | GlossaryNode, skipDetails: boolean): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map((c) => collectText(c, skipDetails)).join("");
  const obj = node as Record<string, unknown>;
  if (obj.type === "image") return obj.alt ? `[${String(obj.alt)}]` : "";
  if (obj.type === "structured-content") return collectText(obj.content as SCNode, skipDetails);
  if (typeof obj.text === "string") return obj.text;
  const label = dataContent(obj);
  if (label && NOISE_SECTIONS.has(label)) return "";
  if (skipDetails && obj.tag === "details") return "";
  if ("content" in obj) {
    const sep = isBlockTag(obj.tag) ? "\n" : "";
    return collectText(obj.content as SCNode, skipDetails) + sep;
  }
  return "";
}

function normalizeText(s: string): string {
  return s.replace(/[ \t]+\n/g, "\n").replace(/\n{2,}/g, "\n").trim();
}

/**
 * Flatten a glossary node to clean plain text. For Wiktionary-style entries this
 * returns just the definitions (e.g. "Ăn."), not the etymology + attribution.
 */
export function glossToText(node: SCNode | GlossaryNode): string {
  if (node && typeof node === "object" && (node as { type?: string }).type === "structured-content") {
    const glosses = findSection((node as { content: SCNode }).content, SECTION_GLOSSES);
    if (glosses) return normalizeText(collectText(glosses, true));
    return normalizeText(collectText((node as { content: SCNode }).content, false));
  }
  return normalizeText(collectText(node, false));
}

/**
 * Flatten a list of glossary nodes into clean plain-text lines — one per sense.
 * When an entry exposes a labelled `glosses` list, each list item becomes its
 * own line (so multi-sense entries read as a proper list).
 */
export function glossaryToLines(glossary: GlossaryNode[] | undefined): string[] {
  if (!glossary) return [];
  const out: string[] = [];
  for (const g of glossary) {
    if (g && typeof g === "object" && (g as { type?: string }).type === "structured-content") {
      const glosses = findSection((g as { content: SCNode }).content, SECTION_GLOSSES);
      if (glosses && "content" in glosses) {
        const items = Array.isArray(glosses.content) ? glosses.content : [glosses.content];
        for (const li of items) {
          const line = normalizeText(collectText(li, true));
          if (line) out.push(line);
        }
        continue;
      }
    }
    const line = glossToText(g).trim();
    if (line) out.push(line);
  }
  return out;
}

/** Flatten grouped senses into plain-text lines (for previews / SRS / sync). */
export function sensesToLines(senses: Sense[] | undefined): string[] {
  if (!senses) return [];
  const out: string[] = [];
  for (const s of senses) out.push(...glossaryToLines(s.glossary));
  return out;
}

// Furigana distribution lives in ./japanese (a faithful port of Yomitan's
// per-kanji-run algorithm). Re-exported here so existing import sites keep working.
export { distributeFurigana } from "./japanese";
export type { FuriganaSegment } from "./japanese";

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
