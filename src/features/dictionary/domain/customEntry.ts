// Từ điển cá nhân (Issue #69) — logic thuần: một "dòng nháp" người dùng gõ/sinh
// bằng AI ↔ một `DictEntry` lưu vào IndexedDB. Ở đây KHÔNG có I/O (IndexedDB,
// mạng) — data/ui bọc quanh. Tách riêng để test dễ và tái dùng ở cả lúc nhập
// tay, lúc phân tích kết quả AI lẫn lúc lưu.

import { DictEntry } from "@/shared/db";
import { GlossaryNode, Sense } from "@/shared/structured-content";
import { LangPair } from "@/shared/languages";
import { resolveTags } from "./tags";

/**
 * Một dòng đang soạn trong lưới. Mỗi trường là văn bản một dòng để hợp với thao
 * tác bàn phím kiểu bảng tính (Tab/Enter). Chuyển sang cấu trúc lúc dựng entry:
 *   - `gloss`   : nhiều nghĩa, ngăn bởi `;` hoặc xuống dòng.
 *   - `pos`     : mã từ loại, ngăn bởi khoảng trắng hoặc dấu phẩy.
 *   - `example` : "câu nguồn :: bản dịch" (phần dịch tùy chọn).
 */
export interface CustomDraft {
  term: string;
  reading: string;
  pos: string;
  gloss: string;
  example: string;
  /** Giải thích / ghi chú cách dùng — lưu vào `sense.info`. */
  note: string;
  /** Từ liên quan / dễ nhầm, ngăn bởi ";" — lưu vào `sense.info` (có nhãn). */
  related: string;
}

export function emptyDraft(): CustomDraft {
  return { term: "", reading: "", pos: "", gloss: "", example: "", note: "", related: "" };
}

/** Khoá trùng — khớp key của store `terms` (bỏ qua cặp ngôn ngữ vì đã cùng cặp). */
export function termReadingKey(term: string, reading: string): string {
  return JSON.stringify([term.trim(), reading.trim()]);
}

/** Một dòng có "nội dung" khi có từ và ít nhất một nghĩa. */
export function isDraftFilled(d: CustomDraft): boolean {
  return d.term.trim().length > 0 && splitGloss(d.gloss).length > 0;
}

const GLOSS_SEP = /[;\n]+/;
const POS_SEP = /[\s,]+/;
const EXAMPLE_SEP = "::";

function splitGloss(raw: string): string[] {
  return raw.split(GLOSS_SEP).map((s) => s.trim()).filter(Boolean);
}

function splitPos(raw: string): string[] {
  return raw.split(POS_SEP).map((s) => s.trim()).filter(Boolean);
}

/** "câu :: dịch" → ví dụ; chỉ trả về khi có phần câu. Không có `::` ⇒ toàn bộ là câu. */
function parseExample(raw: string): { ja: string; vi: string } | undefined {
  const text = raw.trim();
  if (!text) return undefined;
  const at = text.indexOf(EXAMPLE_SEP);
  const ja = (at >= 0 ? text.slice(0, at) : text).trim();
  const vi = at >= 0 ? text.slice(at + EXAMPLE_SEP.length).trim() : "";
  return ja ? { ja, vi } : undefined;
}

/**
 * Dựng một `DictEntry` từ dòng nháp, scoped theo cặp ngôn ngữ. Cấu trúc một
 * sense thủ công: từ loại (tags) + các dòng nghĩa (glossary chuỗi thuần) + ví
 * dụ. Tag được resolve như mọi nguồn khác nên chip hiển thị nhất quán.
 */
export function buildDictEntry(draft: CustomDraft, pair: LangPair, dictTitle: string): DictEntry {
  const term = draft.term.trim();
  const reading = draft.reading.trim();
  const pos = splitPos(draft.pos);
  const glossLines = splitGloss(draft.gloss);
  const example = parseExample(draft.example);

  // Giải thích + từ liên quan/dễ nhầm cùng đi vào `info` (footnote muted khi tra).
  const note = draft.note.trim();
  const related = draft.related.trim();
  const info: string[] = [];
  if (note) info.push(note);
  if (related) info.push(`Liên quan/dễ nhầm: ${related}`);

  const glossary: GlossaryNode[] = glossLines;
  const sense: Sense = {
    tags: pos,
    glossary,
    dictionary: dictTitle,
    ...(example ? { examples: [example] } : {}),
    ...(info.length ? { info } : {}),
  };

  const tagMeta = resolveTags(new Set(pos));

  return {
    term,
    reading,
    definitions: glossary,
    senses: [sense],
    termTags: undefined,
    ...(Object.keys(tagMeta).length ? { tagMeta } : {}),
    dictionary: dictTitle,
    term_lang: pair.source,
    native_lang: pair.target,
  };
}

/**
 * Chia danh sách nháp thành `fresh` (chưa có trong IndexedDB) và `duplicates`
 * (trùng khoá `(term, reading)` với dữ liệu sẵn có). Đồng thời khử trùng NỘI BỘ:
 * hai dòng cùng khoá thì chỉ giữ dòng sau (mới nhất thắng).
 */
export function dedupe(
  drafts: CustomDraft[],
  existing: Set<string>,
): { fresh: CustomDraft[]; duplicates: CustomDraft[] } {
  const byKey = new Map<string, CustomDraft>();
  for (const d of drafts) {
    if (!isDraftFilled(d)) continue;
    byKey.set(termReadingKey(d.term, d.reading), d);
  }
  const fresh: CustomDraft[] = [];
  const duplicates: CustomDraft[] = [];
  for (const [key, draft] of byKey) {
    (existing.has(key) ? duplicates : fresh).push(draft);
  }
  return { fresh, duplicates };
}

// ─────────────────────────────────────────────────────────────────────────
// AI: dựng prompt (một nguồn duy nhất — dùng cho cả "Lấy Prompt" lẫn "Generate")
// và phân tích kết quả model trả về.
// ─────────────────────────────────────────────────────────────────────────

export interface AiPromptOptions {
  /** Danh sách từ người dùng cung cấp (mỗi dòng một từ). Có thể rỗng. */
  words: string[];
  /** Số từ ngẫu nhiên cần AI tự nghĩ thêm (0 = không). */
  randomCount: number;
  /** Có kèm câu ví dụ không. */
  wantExamples: boolean;
  /** Có kèm giải thích cách dùng không. */
  wantExplanation?: boolean;
  /** Có kèm từ liên quan / dễ nhầm không. */
  wantRelated?: boolean;
  /** Yêu cầu thêm của người dùng (chủ đề, sắc thái…). */
  extra: string;
  pair: LangPair;
  /** Tên bộ từ vựng (tuỳ chọn) — cho AI ngữ cảnh về bộ từ đang soạn. */
  dictTitle?: string;
  /** Chủ đề / lĩnh vực (tuỳ chọn) — định hướng từ ngẫu nhiên & sắc thái. */
  topic?: string;
  /** Mô tả bộ từ (tuỳ chọn). */
  description?: string;
}

const LANG_NAMES: Record<string, string> = { ja: "tiếng Nhật", vi: "tiếng Việt", en: "tiếng Anh" };

function langName(code: string): string {
  return LANG_NAMES[code] ?? code;
}

/**
 * Prompt yêu cầu model trả về JSON đúng shape `{ "words": [...] }`. Cố ý mô tả
 * schema rõ ràng để "Lấy Prompt" (người dùng tự dán vào ChatGPT/Gemini) và
 * "Generate" (server gọi Deepseek ở chế độ JSON) cho ra cùng một cấu trúc.
 */
export function buildAiPrompt(opts: AiPromptOptions): string {
  const {
    words,
    randomCount,
    wantExamples,
    wantExplanation = false,
    wantRelated = false,
    extra,
    pair,
    dictTitle,
    topic,
    description,
  } = opts;
  const src = langName(pair.source);
  const tgt = langName(pair.target);
  const lines: string[] = [];

  lines.push(
    `Bạn là trợ lý biên soạn từ điển ${src} → ${tgt}. Hãy tạo các mục từ vựng ${src} kèm nghĩa ${tgt}.`,
  );

  // Ngữ cảnh bộ từ (tuỳ chọn) — giúp AI chọn từ phù hợp chủ đề và đúng sắc thái.
  const context: string[] = [];
  if (dictTitle?.trim()) context.push(`Tên bộ từ vựng: ${dictTitle.trim()}.`);
  if (topic?.trim()) context.push(`Chủ đề/lĩnh vực: ${topic.trim()}.`);
  if (description?.trim()) context.push(`Mô tả: ${description.trim()}.`);
  if (context.length) lines.push(context.join(" "));

  const list = words.map((w) => w.trim()).filter(Boolean);
  if (list.length) {
    lines.push(`Xử lý chính xác các từ sau (giữ nguyên, không bỏ sót):`);
    lines.push(list.map((w) => `- ${w}`).join("\n"));
  }
  if (randomCount > 0) {
    lines.push(`Ngoài ra hãy tự chọn thêm ${randomCount} từ ${src} thông dụng và thêm vào danh sách.`);
  }
  if (extra.trim()) lines.push(`Yêu cầu thêm: ${extra.trim()}`);

  // Chỉ liệt kê những trường được bật → model không sinh trường thừa. Ghép bằng
  // dấu phẩy nên không phải chỉnh dấu phẩy đuôi thủ công khi bật/tắt.
  const fields: string[] = [
    `      "term": "cách viết (${src})"`,
    `      "reading": "cách đọc kana/phiên âm (rỗng nếu không có)"`,
    `      "pos": "mã từ loại JMdict, cách nhau bởi khoảng trắng (vd: n, v5k, adj-i)"`,
    `      "meanings": ["nghĩa ${tgt} 1", "nghĩa ${tgt} 2"]`,
  ];
  if (wantExamples) {
    fields.push(`      "example": { "source": "câu ví dụ ${src}", "translation": "bản dịch ${tgt}" }`);
  }
  if (wantExplanation) fields.push(`      "note": "giải thích ngắn cách dùng, bằng ${tgt}"`);
  if (wantRelated) fields.push(`      "related": ["từ ${src} liên quan hoặc dễ nhầm"]`);

  lines.push(
    `Trả về DUY NHẤT một đối tượng JSON, không kèm giải thích, theo schema:`,
    `{`,
    `  "words": [`,
    `    {`,
    fields.join(",\n"),
    `    }`,
    `  ]`,
    `}`,
  );

  return lines.join("\n");
}

/** Lấy chuỗi đầu tiên khác rỗng trong số các khoá ứng viên của một object. */
function pickString(obj: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/** POS có thể là mảng hoặc chuỗi — chuẩn hoá về chuỗi ngăn bởi khoảng trắng. */
function normalizePos(value: unknown): string {
  if (Array.isArray(value)) return value.filter((x) => typeof x === "string").join(" ");
  return typeof value === "string" ? value : "";
}

/** meanings/gloss có thể là mảng hoặc chuỗi — gộp về chuỗi ngăn bởi ";". */
function normalizeGloss(obj: Record<string, unknown>): string {
  for (const k of ["meanings", "meaning", "gloss", "glosses", "definitions", "definition"]) {
    const v = obj[k];
    if (Array.isArray(v)) return v.filter((x) => typeof x === "string").join("; ");
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/** Danh sách (từ liên quan…) dạng mảng hoặc chuỗi → chuỗi ngăn bởi ";". */
function normalizeList(value: unknown): string {
  if (Array.isArray(value)) return value.filter((x) => typeof x === "string").join("; ");
  return typeof value === "string" ? value.trim() : "";
}

/** example dạng object {source/translation} hoặc chuỗi → "câu :: dịch". */
function normalizeExample(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") {
    const ex = value as Record<string, unknown>;
    const source = pickString(ex, ["source", "ja", "sentence", "text", "example"]);
    const translation = pickString(ex, ["translation", "vi", "meaning", "trans"]);
    if (!source) return "";
    return translation ? `${source} ${EXAMPLE_SEP} ${translation}` : source;
  }
  return "";
}

/** Chuẩn hoá một object bất kỳ về CustomDraft; trả null nếu thiếu `term`. */
function toDraft(raw: unknown): CustomDraft | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const term = pickString(obj, ["term", "word", "headword", "kanji", "expression"]);
  if (!term) return null;
  return {
    term,
    reading: pickString(obj, ["reading", "kana", "furigana", "pronunciation", "romaji"]),
    pos: normalizePos(obj.pos ?? obj.partOfSpeech ?? obj.type),
    gloss: normalizeGloss(obj),
    example: normalizeExample(obj.example ?? obj.sentence ?? obj.examples),
    note: pickString(obj, ["note", "explanation", "usage", "notes", "info", "explain"]),
    related: normalizeList(obj.related ?? obj.confused ?? obj.similar ?? obj.see_also ?? obj.synonyms),
  };
}

/** Gỡ hàng rào ```json … ``` (hoặc ``` … ```) nếu model bọc kết quả trong đó. */
function stripCodeFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

/** Tìm mảng bản ghi trong một object trả về (nhiều tên khoá khả dĩ). */
function findRowsArray(obj: Record<string, unknown>): unknown[] | null {
  for (const k of ["words", "entries", "items", "data", "list", "vocab", "result", "results"]) {
    if (Array.isArray(obj[k])) return obj[k] as unknown[];
  }
  // Không có khoá quen thuộc: lấy mảng-object đầu tiên gặp được.
  for (const v of Object.values(obj)) {
    if (Array.isArray(v) && v.some((x) => x && typeof x === "object")) return v;
  }
  return null;
}

/**
 * Phân tích kết quả AI (JSON) thành các dòng nháp. Khoan dung: chấp nhận mảng
 * trần, object bọc `{ words: [...] }`, hay object đơn; gỡ hàng rào code; gom lỗi
 * thay vì ném để UI báo nhẹ nhàng.
 */
export function parseAiResponse(text: string): { rows: CustomDraft[]; errors: string[] } {
  const errors: string[] = [];
  const cleaned = stripCodeFence(text ?? "");
  if (!cleaned) return { rows: [], errors: ["Nội dung rỗng."] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return { rows: [], errors: ["Không đọc được JSON. Hãy dán đúng kết quả JSON từ AI."] };
  }

  let rawRows: unknown[];
  if (Array.isArray(parsed)) {
    rawRows = parsed;
  } else if (parsed && typeof parsed === "object") {
    rawRows = findRowsArray(parsed as Record<string, unknown>) ?? [parsed];
  } else {
    return { rows: [], errors: ["JSON không chứa danh sách từ."] };
  }

  const rows: CustomDraft[] = [];
  rawRows.forEach((raw, i) => {
    const draft = toDraft(raw);
    if (draft) rows.push(draft);
    else errors.push(`Bỏ qua mục ${i + 1}: thiếu trường "term".`);
  });

  if (rows.length === 0 && errors.length === 0) errors.push("Không tìm thấy từ nào trong kết quả.");
  return { rows, errors };
}
