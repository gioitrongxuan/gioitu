// Đọc một danh sách từ thô (dán từ web, tệp .txt/.csv/.tsv) thành các dòng của
// một **bộ từ**. Hàm thuần, không I/O — tầng `data/wordsets.ts` mới ghi xuống
// IndexedDB, `ui/` chỉ bày kết quả xem trước.
//
// Danh sách người ta chép về gần như không bao giờ sạch: có đánh số đầu dòng,
// có 【cách đọc】 dính vào mặt chữ, có dòng tiêu đề, có dòng trùng. Phân tích ở
// đây cố ý *khoan dung* (bỏ qua dòng hỏng, không ném lỗi) nhưng phải **đếm và
// trả về** những gì đã bỏ, để giao diện nói thật "đã bỏ N dòng" thay vì lặng lẽ
// nuốt mất một phần bộ từ.

/** Một dòng đã phân tích, chưa gắn với bộ nào. */
export interface WordsetDraft {
  term: string;
  reading?: string;
  gloss?: string;
  /** Câu ví dụ, "câu :: bản dịch" (phần dịch tuỳ chọn) — cùng quy ước với
   *  `CustomDraft.example` của Từ điển cá nhân. */
  example?: string;
}

export interface ParsedWordset {
  words: WordsetDraft[];
  /** Số dòng không dùng được (không có mặt chữ sau khi dọn). */
  skipped: number;
  /** Số dòng trùng khoá (term, reading) với một dòng trước đó — giữ dòng đầu. */
  duplicates: number;
  /** Số dòng bị cắt vì vượt `MAX_WORDSET_WORDS`. */
  truncated: number;
}

/**
 * Trần số từ cho MỘT bộ. Cao hơn mọi bộ JLPT (N1 ~3.5k từ) nhiều lần, nhưng vẫn
 * chặn được cú dán nhầm cả cuốn từ điển: 20k ô trong một lưới là đứng hình trình
 * duyệt, và bộ từ để sàng thì không ai đọc hết ngần ấy.
 */
export const MAX_WORDSET_WORDS = 20000;

/**
 * Bỏ đánh số đầu dòng ("12. ", "3) ", "12、", "- ") — dấu vết của danh sách chép
 * về. Số theo sau bởi dấu chấm thì BẮT BUỘC có khoảng trắng, nếu không "3.5インチ"
 * sẽ bị gọt thành "5インチ"; còn ")" và "、" thì không cần, vì chúng không bao giờ
 * đứng giữa một con số trong mặt chữ.
 */
const LEADING_NUMBER = /^\s*(?:\d{1,5}\s*[.)、]\s+|\d{1,5}\s*[)、]|[-–•*]\s+)/;

/**
 * Nhãn cột hay gặp ở dòng đầu một tệp xuất từ Excel/Sheets. Không có danh sách
 * này thì "mặt chữ, cách đọc, nghĩa" thành một từ vựng ma nằm chình ình ở đầu bộ.
 */
const HEADER_LABELS = new Set([
  "mặt chữ", "mat chu", "từ", "tu", "từ vựng", "word", "words", "term", "vocabulary", "kanji",
  "cách đọc", "cach doc", "đọc", "reading", "kana", "furigana", "hiragana", "phiên âm",
  "nghĩa", "nghia", "ý nghĩa", "meaning", "gloss", "definition", "translation", "dịch",
  "ví dụ", "vi du", "câu ví dụ", "example", "sentence", "sample",
  // Giữ cả nhãn của cột "bài" cũ: tệp người dùng đã xuất ra vẫn có tiêu đề ấy,
  // dòng đó vẫn phải bị nhận ra là tiêu đề chứ không thành một từ vựng ma.
  "bài", "bai", "lesson", "unit", "chương", "nhóm", "group", "chủ đề", "topic", "level",
  "stt", "no", "no.", "#", "index",
]);

/**
 * Dòng đầu có phải tiêu đề cột không. Cố ý CHẶT: phải từ 2 cột trở lên và ít nhất
 * 2 ô là nhãn cột đã biết. Danh sách một cột thì không bao giờ đụng tới — ở đó
 * "từ" hay "word" nhiều khả năng là từ vựng thật người ta muốn học.
 */
function looksLikeHeader(cols: string[]): boolean {
  if (cols.length < 2) return false;
  const hits = cols.filter((c) => HEADER_LABELS.has(c.trim().toLowerCase())).length;
  return hits >= 2;
}

/** Toàn kana (kèm ー・ và khoảng trắng) — dấu hiệu của một cách đọc tiếng Nhật. */
const KANA_ONLY = /^[\u3040-\u309f\u30a0-\u30ff\u30fc・\s]+$/;

/**
 * Dòng CHỈ CÓ HAI cột thì ô thứ hai là cách đọc hay là nghĩa? Gõ tay thì
 * "食べる, ăn" và "食べる, たべる" đều tự nhiên như nhau, mà đoán sai kiểu cũ
 * (luôn coi là cách đọc) thì nghĩa chui vào ô cách đọc rồi hiện lên thành
 * furigana bậy. Toàn kana → cách đọc; còn lại → nghĩa.
 *
 * Chỉ áp dụng cho dòng hai cột: ba cột trở lên là người dùng đã nói rõ bố cục.
 */
function secondIsReading(text: string): boolean {
  return KANA_ONLY.test(text);
}

/**
 * Dòng bổ sung cho từ NGAY TRƯỚC, dạng "nghĩa: …" / "ví dụ: …" / "cách đọc: …".
 * Đây là dạng dễ gõ tay nhất cho từ có câu ví dụ dài: mỗi ý một dòng, không phải
 * đếm dấu phẩy. Tiền tố đủ đặc thù để không nuốt nhầm từ vựng thật.
 */
const CONTINUATION: { re: RegExp; field: "reading" | "gloss" | "example" }[] = [
  { re: /^(?:nghĩa|nghia|meaning|gloss)\s*[:：]\s*(.+)$/i, field: "gloss" },
  { re: /^(?:ví dụ|vi du|example|ex)\s*[:：]\s*(.+)$/i, field: "example" },
  { re: /^(?:cách đọc|cach doc|reading|kana)\s*[:：]\s*(.+)$/i, field: "reading" },
];

/** Mặt chữ kèm cách đọc dính liền: 食べる【たべる】 hoặc 食べる (たべる). */
const INLINE_READING = /^(.+?)\s*[【(（[]\s*([^】)）\]]+?)\s*[】)）\]]\s*$/;

/**
 * Phân tích văn bản thô thành danh sách từ. Thứ tự cột: mặt chữ, cách đọc, nghĩa,
 * ví dụ; ba cột sau đều bỏ trống được.
 *
 * Nhận nhiều lối viết để nhập tay đỡ cực (xem `splitColumns`, `secondIsReading`,
 * `CONTINUATION`):
 * ```
 * 食べる, たべる, ăn, 毎朝パンを食べる :: Sáng nào tôi cũng ăn bánh mì
 * 食べる【たべる】 = ăn
 * 犬 - con chó
 * 請求書 | せいきゅうしょ | hoá đơn
 * 締め切り
 *   nghĩa: hạn chót
 *   ví dụ: 締め切りは明日です
 * ```
 */
export function parseWordset(text: string): ParsedWordset {
  const words: WordsetDraft[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  let duplicates = 0;
  let truncated = 0;

  // Dòng tiêu đề chỉ được xét ở DÒNG DỮ LIỆU ĐẦU TIÊN: giữa bộ mà có "nghĩa,
  // cách đọc" thì đó là từ thật, không phải tiêu đề lạc chỗ.
  let first = true;
  // Từ vừa đẩy vào danh sách — đích của các dòng "nghĩa: …" đi ngay sau nó.
  let current: WordsetDraft | null = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    // Dòng rỗng và chú thích (# …) không phải lỗi của người dùng — bỏ im lặng
    // thì đúng hơn là tính vào "đã bỏ N dòng" rồi doạ họ.
    if (!line || line.startsWith("#")) continue;

    // Dòng bổ sung cho từ ngay trước. Không có từ nào đứng trước thì rơi xuống
    // dưới xử lý như một dòng thường — "nghĩa: X" đứng một mình vẫn hơn là mất hút.
    const cont = current && matchContinuation(line);
    if (cont && current) {
      current[cont.field] = cont.value;
      continue;
    }

    const cols = splitColumns(line);
    if (first) {
      first = false;
      // Bỏ im lặng như dòng chú thích: người dùng không làm gì sai, không việc gì
      // phải báo "đã bỏ 1 dòng".
      if (looksLikeHeader(cols)) continue;
    }
    let term = cols[0].replace(LEADING_NUMBER, "").trim();
    const second = cols[1]?.trim() ?? "";
    // Hai cột: ô thứ hai là cách đọc hay nghĩa, đoán theo mặt chữ (xem
    // `secondIsReading`). Từ ba cột trở lên thì bố cục đã rõ, cứ theo thứ tự.
    const secondIsGloss = cols.length === 2 && second !== "" && !secondIsReading(second);
    let reading = secondIsGloss ? "" : second;
    const gloss = secondIsGloss ? second : cols[2]?.trim() ?? "";
    const example = cols[3]?.trim() ?? "";

    // Chỉ bóc 【…】 khi cột cách đọc còn trống: danh sách có cả hai thì cột
    // riêng là ý định rõ ràng hơn phần dính trong mặt chữ.
    if (!reading) {
      const m = INLINE_READING.exec(term);
      if (m) {
        term = m[1].trim();
        reading = m[2].trim();
      }
    }

    if (!term) {
      skipped += 1;
      continue;
    }
    // Ký tự phân tách phải là thứ KHÔNG bao giờ xuất hiện trong mặt chữ hay cách
    // đọc, nếu không "ab|c" và "a|bc" thành cùng một khoá. Viết bằng escape
    // `\u0000` chứ không phải byte NUL thô: byte thô làm git coi cả file là nhị
    // phân — mất diff, mất review, mất blame.
    const key = `${term}\u0000${reading}`;
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    if (words.length >= MAX_WORDSET_WORDS) {
      truncated += 1;
      continue;
    }
    const draft: WordsetDraft = {
      term,
      ...(reading ? { reading } : {}),
      ...(gloss ? { gloss } : {}),
      ...(example ? { example } : {}),
    };
    words.push(draft);
    current = draft;
  }

  return { words, skipped, duplicates, truncated };
}

/** Dòng bổ sung "nghĩa: …" → trường nào, giá trị gì. `null` nếu không phải. */
function matchContinuation(line: string): { field: "reading" | "gloss" | "example"; value: string } | null {
  for (const { re, field } of CONTINUATION) {
    const m = re.exec(line);
    if (m) return { field, value: m[1].trim() };
  }
  return null;
}

/** Dấu ngăn cột gõ tay được, ngoài TAB và dấu phẩy. Cố ý chỉ nhận hai ký tự
 *  gần như không bao giờ nằm trong mặt chữ hay nghĩa. */
const MANUAL_SEPARATORS = ["|", "="];

/** Gạch ngang CÓ khoảng trắng hai bên: "犬 - con chó". Bắt buộc có khoảng trắng
 *  vì gạch nối dính liền là một phần của từ ("mother-in-law", "cha-mẹ). */
const SPACED_DASH = /\s[-–—]\s/;

/**
 * Tách một dòng thành cột. Thứ tự ưu tiên:
 *   1. TAB — rõ ràng nhất, ai dán từ bảng tính cũng ra cái này.
 *   2. Trong `|`, `=`, `,`: cái nào XUẤT HIỆN TRƯỚC trong dòng thì thắng. Nhờ
 *      vậy "食べる = ăn, uống" tách ở dấu `=` (phẩy nằm trong nghĩa), còn
 *      "food,thức ăn = đồ ăn" tách ở dấu phẩy (dấu `=` nằm trong nghĩa) — không
 *      cần người dùng biết luật nào.
 *   3. Gạch ngang có khoảng trắng, và chỉ tách LÀM ĐÔI: "犬 - con chó". Chỉ dùng
 *      khi không có dấu nào ở trên, vì gạch ngang rất hay nằm trong câu ví dụ.
 */
function splitColumns(line: string): string[] {
  if (line.includes("\t")) return line.split("\t");

  let best = -1;
  let sep = "";
  for (const s of [...MANUAL_SEPARATORS, ","]) {
    const at = line.indexOf(s);
    if (at >= 0 && (best === -1 || at < best)) {
      best = at;
      sep = s;
    }
  }
  if (sep === ",") return splitCsv(line);
  if (sep) return line.split(sep);

  const dash = SPACED_DASH.exec(line);
  if (dash) return [line.slice(0, dash.index), line.slice(dash.index + dash[0].length)];
  return [line];
}

/** CSV một dòng: `a,"b, c",d` → ["a", "b, c", "d"]. Nháy kép đôi ("") = một ". */
function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else quoted = false;
      } else cur += ch;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Một từ mẫu viết ở MỘT ngôn ngữ: mặt chữ, cách đọc (nếu ngôn ngữ đó có), và
 *  một câu ví dụ để ghép thành cột "ví dụ" cho mọi cặp. */
interface SampleWord {
  term: string;
  reading?: string;
  sentence: string;
}

/**
 * Ba từ mẫu, mỗi từ là MỘT khái niệm viết bằng cả ba ngôn ngữ, nên tệp mẫu dựng
 * được cho cả sáu cặp mà nghĩa vẫn khớp với mặt chữ (chứ không phải "食べる" đi
 * kèm nghĩa "invoice"). Cột nghĩa của khái niệm thứ ba cố ý CÓ DẤU PHẨY để tệp
 * mẫu tự nó minh hoạ luôn cách bọc nháy kép.
 */
const SAMPLE_CONCEPTS: { ja: SampleWord; en: SampleWord; vi: SampleWord }[] = [
  {
    ja: { term: "食べる", reading: "たべる", sentence: "毎朝パンを食べる" },
    en: { term: "eat", sentence: "I eat bread every morning" },
    vi: { term: "ăn", sentence: "Sáng nào tôi cũng ăn bánh mì" },
  },
  {
    ja: { term: "請求書", reading: "せいきゅうしょ", sentence: "請求書を送ってください" },
    en: { term: "invoice", sentence: "Please send the invoice" },
    vi: { term: "hoá đơn", sentence: "Vui lòng gửi hoá đơn" },
  },
  {
    ja: { term: "締め切り", reading: "しめきり", sentence: "締め切りは明日です" },
    en: { term: "deadline, due date", sentence: "The deadline is tomorrow" },
    vi: { term: "hạn chót, kỳ hạn", sentence: "Hạn chót là ngày mai" },
  },
];

/** Ngăn giữa câu ví dụ và bản dịch — cùng ký hiệu với Từ điển cá nhân
 *  (`customEntry.ts`), để câu chép từ bộ từ sang thẻ không phải sửa gì. */
const EXAMPLE_SEP = "::";

/**
 * Nội dung tệp CSV mẫu cho một cặp ngôn ngữ. Có tệp mở ra xem được thì không ai
 * phải đoán thứ tự cột từ một dòng gợi ý; và vì nó đi qua đúng `parseWordset`
 * (test round-trip trong `test/wordset.test.ts` giữ), mẫu không thể lạc hậu so
 * với trình phân tích.
 *
 * Mấy dòng `#` đầu là chú thích — trình phân tích bỏ qua, người đọc thì hiểu
 * ngay phải điền gì vào đâu.
 */
export function sampleWordsetCsv(source: string, target: string): string {
  const lines = [
    "# Tệp mẫu bộ từ cho Gioitu — mỗi dòng một từ, cột ngăn bằng dấu phẩy.",
    "# Thứ tự cột: mặt chữ, cách đọc, nghĩa, ví dụ. Ba cột sau đều có thể bỏ trống.",
    "# Cột ví dụ nhận thêm bản dịch sau dấu :: — giống Từ điển cá nhân.",
    "# Nghĩa có dấu phẩy thì bọc trong nháy kép. Dòng bắt đầu bằng # bị bỏ qua.",
    csvRow(["mặt chữ", "cách đọc", "nghĩa", "ví dụ"]),
  ];
  for (const concept of SAMPLE_CONCEPTS) {
    const term = pickSample(concept, source);
    const gloss = pickSample(concept, target);
    // Câu ví dụ ở ngôn ngữ NGUỒN (nó minh hoạ mặt chữ), bản dịch ở ngôn ngữ đích.
    const example = `${term.sentence} ${EXAMPLE_SEP} ${gloss.sentence}`;
    lines.push(csvRow([term.term, term.reading ?? "", gloss.term, example]));
  }
  return lines.join("\n") + "\n";
}

/** Mặt chữ mẫu theo ngôn ngữ; ngôn ngữ lạ thì lấy tiếng Anh làm chỗ dựa. */
function pickSample(concept: { ja: SampleWord; en: SampleWord; vi: SampleWord }, lang: string): SampleWord {
  if (lang === "ja") return concept.ja;
  if (lang === "vi") return concept.vi;
  return concept.en;
}

/** Một dòng CSV: ô có dấu phẩy / nháy kép / xuống dòng thì bọc nháy kép. */
function csvRow(cells: string[]): string {
  return cells.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",");
}

/**
 * Tên bộ gợi ý từ tên tệp: bỏ đuôi mở rộng và các dấu ngăn cách thành khoảng
 * trắng, để "jlpt_n1_vocab.csv" ra "jlpt n1 vocab" thay vì bắt gõ lại tay.
 */
export function titleFromFilename(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[_\-.]+/g, " ")
    .trim();
}
