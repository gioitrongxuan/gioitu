// Server-side dictionary client. Máy chủ có thể vắng mặt (mất mạng, deploy tĩnh,
// lỗi 5xx). TRƯỚC ĐÂY mọi lỗi bị nuốt thành null/[] nên UI không phân biệt được
// "không có từ" với "không gọi được máy chủ" → hiện nhầm "Không tìm thấy". Giờ
// getJson NÉM DictionaryNetworkError khi không lấy được dữ liệu; caller nào cần
// phân biệt (serverLookup) thì để lỗi nổi lên, caller phụ trợ (gợi ý/near-miss)
// tự nuốt vì lỗi ở đó không đáng quấy người dùng.
//
// Server giờ trả DictionaryEntry phong phú (kế thừa jisho). Ở đây ta hạ về
// DictEntry — kiểu UI hiện tại đang dùng — để không phải đổi UI ở pha này. Các
// trường jisho chưa hiển thị (pitch/Hán-Việt/ảnh/bình luận) tạm bỏ qua; sẽ render
// ở pha UI sau.

import { DictEntry } from "@/shared/db";
import { DictionaryEntry, Gloss, Heading } from "@/shared/dictionary";
import { Sense } from "@/shared/structured-content";
import { resolveTags } from "../domain/tags";

const BASE = "/api";

/** Không gọi được máy chủ từ điển (mất mạng, 5xx, phản hồi không phải JSON). */
export class DictionaryNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DictionaryNetworkError";
  }
}

// Cho phép tiêm fetch trong test (theo mẫu server/handwriting.ts). Mặc định dùng
// fetch toàn cục của trình duyệt.
async function getJson<T>(path: string, fetchFn: typeof fetch = fetch): Promise<T> {
  let res: Response;
  try {
    res = await fetchFn(`${BASE}${path}`);
  } catch (err) {
    // fetch chỉ reject khi lỗi mạng thật (mất mạng, DNS, CORS) — không phải 4xx/5xx.
    throw new DictionaryNetworkError(`Không gọi được máy chủ từ điển: ${(err as Error).message}`);
  }
  if (!res.ok) throw new DictionaryNetworkError(`Máy chủ từ điển trả ${res.status}`);
  try {
    return (await res.json()) as T;
  } catch {
    // Backend vắng mặt (deploy tĩnh) trả HTML thay JSON → coi như không kết nối được.
    throw new DictionaryNetworkError("Phản hồi máy chủ từ điển không hợp lệ");
  }
}

const glossText = (g: Gloss): string => (typeof g === "string" ? g : g.text);

/** Mazii `kind` đôi khi gộp nhiều mã ("v1, vt") — tách thành từng chip. */
const splitPos = (codes: string[]): string[] =>
  [...new Set(codes.flatMap((c) => c.split(/[,\s/]+/).map((t) => t.trim()).filter(Boolean)))];

/** Hạ DictionaryEntry (đã-ráp, jisho) về DictEntry mà UI dùng, GIỮ phần phong phú. */
function toDictEntry(e: DictionaryEntry): DictEntry {
  const head: Heading = e.headings[0] ?? { base: "" };
  const senses: Sense[] = e.senses.map((s) => ({
    // Chip từ loại gộp cả nhãn cách dùng (misc: uk/col/hon…) để dữ liệu sửa tay hiện đủ.
    tags: splitPos([...s.pos, ...(s.misc ?? [])]),
    // Giữ structured content (Yomitan) khi có để render giàu; nếu không, dùng gloss text.
    glossary: s.glossary && s.glossary.length ? s.glossary : s.gloss.map(glossText),
    dictionary: s.dictionary,
    examples: s.examples,
    info: s.info,
  }));
  const posCodes = [...new Set(senses.flatMap((s) => s.tags))];
  return {
    term: head.base,
    reading: head.reading,
    definitions: e.senses.flatMap((s) => s.gloss.map(glossText)),
    term_lang: e.term_lang,
    native_lang: e.native_lang,
    senses,
    tagMeta: resolveTags(posCodes),
    score: e.score,
    dictionary: e.senses.find((s) => s.dictionary)?.dictionary,
    // Trường phong phú kiểu jisho — UI render khi có.
    hanViet: head.hanViet,
    jlpt: head.jlpt,
    pitch: e.pitch,
    images: e.images,
    comments: e.comments,
    wordId: e.word_id,
    verified: e.verified,
  };
}

/**
 * Server-side forward lookup. Trả về MỌI từ khớp cách-viết-hoặc-âm-đọc (đồng âm:
 * gõ さくら ra cả 桜 lẫn 櫻), xếp phổ biến giảm dần — như nguồn local. Rỗng khi
 * thật sự không có từ nào; NÉM DictionaryNetworkError khi không gọi được máy chủ
 * (caller phân biệt hai trường hợp để không báo nhầm "không tìm thấy").
 */
export async function serverLookup(
  term: string,
  term_lang: string,
  native_lang: string,
  fetchFn?: typeof fetch,
): Promise<DictEntry[]> {
  const q = `term=${encodeURIComponent(term)}&src=${term_lang}&tgt=${native_lang}`;
  const entries = await getJson<DictionaryEntry[]>(`/dict/lookup?${q}`, fetchFn);
  return entries.map(toDictEntry);
}

export async function serverSuggest(
  prefix: string,
  term_lang: string,
  native_lang: string,
  fetchFn?: typeof fetch,
): Promise<DictEntry[]> {
  const q = `prefix=${encodeURIComponent(prefix)}&src=${term_lang}&tgt=${native_lang}`;
  try {
    const entries = await getJson<DictionaryEntry[]>(`/dict/suggest?${q}`, fetchFn);
    return entries.map(toDictEntry);
  } catch {
    // Gợi ý-khi-gõ là phụ trợ: lỗi mạng thì im lặng, không quấy người dùng đang gõ.
    return [];
  }
}

/** Server-side fuzzy near-misses (trigram), closest-first. */
export async function serverFuzzy(
  term: string,
  term_lang: string,
  native_lang: string,
  fetchFn?: typeof fetch,
): Promise<DictEntry[]> {
  const q = `term=${encodeURIComponent(term)}&src=${term_lang}&tgt=${native_lang}`;
  try {
    const entries = await getJson<DictionaryEntry[]>(`/dict/fuzzy?${q}`, fetchFn);
    return entries.map(toDictEntry);
  } catch {
    // Near-miss "có phải bạn muốn tìm" chỉ là bonus — lỗi mạng thì bỏ qua.
    return [];
  }
}
