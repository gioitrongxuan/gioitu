// Dọn nội dung MỘT trường của thẻ Anki thành chữ dùng được.
//
// Trường của Anki không phải chữ thuần: nó là mảnh HTML người ta gõ trong trình
// soạn thẻ, lẫn thẻ định dạng, thẻ `<img>`, và cú pháp `[sound:…]` riêng của
// Anki. Tệ hơn, cùng một deck vẫn viết mỗi note một kiểu — trong bộ JLPT Tango
// N1, note đầu ghi furigana kiểu `身内[みうち]` còn note sau lại ghi bằng
// `<ruby><rb>父</rb><rt>ちち</rt></ruby>`, và thẻ `<b>` thì thuộc tính không có
// nháy. Mọi hàm ở đây vì thế cố ý khoan dung: gặp thứ lạ thì bỏ phần lạ và giữ
// lấy chữ, chứ không ném lỗi giữa lúc nhập hai nghìn note.
//
// Hàm thuần, không đụng DOM: `domain/` không được phép, mà test lại chạy môi
// trường `node` nên cũng không có `DOMParser` để mà dùng.

import { FuriganaSegment } from "@/shared/japanese";

/** Tệp media Anki nhúng trong một trường: âm thanh và ảnh. */
export interface FieldMedia {
  sounds: string[];
  images: string[];
}

/** `[sound:N1_0001_1.mp3]` — cú pháp riêng của Anki, không phải HTML. */
const SOUND_TAG = /\[sound:([^\]]+)\]/g;

/** `<img src=…>` với src có nháy đôi, nháy đơn, hoặc không nháy — trình soạn thẻ
 *  của Anki sinh ra cả ba kiểu. */
const IMG_TAG = /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi;

/** Thực thể HTML hay gặp trong trường Anki. Không dựng bảng đầy đủ: phần còn lại
 *  đã được `&#nnn;` ở dưới lo, và trường từ vựng gần như không có gì khác. */
const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Tên tệp media mà trường này trỏ tới. */
export function extractMedia(html: string): FieldMedia {
  const sounds = [...html.matchAll(SOUND_TAG)].map((m) => m[1].trim()).filter(Boolean);
  const images = [...html.matchAll(IMG_TAG)].map((m) => (m[1] ?? m[2] ?? m[3] ?? "").trim()).filter(Boolean);
  return { sounds, images };
}

/**
 * Bóc HTML và cú pháp media, trả về chữ thuần.
 *
 * `<br>` và `</div>` thành khoảng trắng chứ không biến mất: nối hai dòng lại mà
 * không chừa khoảng trắng thì hai từ dính vào nhau thành một từ không có thật.
 */
export function stripHtml(html: string): string {
  return stripInline(html).trim();
}

/**
 * Như `stripHtml` nhưng KHÔNG cắt khoảng trắng hai đầu.
 *
 * Phân biệt này không phải bới lông tìm vết: khi dọn từng mảnh giữa hai đoạn
 * ruby, cắt hai đầu là dính hai chữ vào nhau ("the " + "cat" → "thecat"). Chỗ
 * nào cần bỏ khoảng trắng thì nơi gọi tự bỏ, có chủ đích.
 */
function stripInline(html: string): string {
  return decodeEntities(
    html
      .replace(SOUND_TAG, " ")
      .replace(/<br\s*\/?>|<\/(?:div|p|li|tr)>/gi, " ")
      .replace(/<[^>]*>/g, ""),
  ).replace(/\s+/g, " ");
}

/** Đổi thực thể HTML về ký tự. Thực thể lạ thì giữ nguyên — hiện ra "&xyz;" vẫn
 *  hơn là nuốt mất một khúc chữ. */
function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** Kiểu ngoặc vuông của Anki: `身内[みうち]`, phần trước dấu ngoặc là mặt chữ. */
const BRACKET_RUBY = /([^\s\[\]]+)\[([^\]]*)\]/g;

/** Kiểu HTML: `<ruby>漢字<rt>かんじ</rt></ruby>`, có hoặc không có `<rb>`. */
const RUBY_TAG = /<ruby\b[^>]*>([\s\S]*?)<\/ruby>/gi;
const RT_TAG = /<rt\b[^>]*>([\s\S]*?)<\/rt>/i;

/**
 * Phân tích một trường furigana thành các đoạn ruby, nhận cả hai lối viết mà
 * cùng một deck có thể trộn lẫn.
 *
 * Ở kiểu ngoặc vuông, Anki chèn một khoảng trắng ngay trước mặt chữ để biết ruby
 * bắt đầu từ đâu (` 身内[みうち]`). Khoảng trắng ấy là dấu phân cách, không phải
 * nội dung, nên phải nuốt đi — để lại thì câu tiếng Nhật hiện ra rời rạc.
 */
export function parseAnkiFurigana(field: string): FuriganaSegment[] {
  const segments: FuriganaSegment[] = [];
  const push = (text: string, reading?: string) => {
    if (!text) return;
    const last = segments[segments.length - 1];
    // Gộp hai đoạn trần liền nhau để đầu ra gọn và dễ so trong test.
    if (last && last.reading === undefined && reading === undefined) last.text += text;
    else segments.push(reading ? { text, reading } : { text });
  };

  // Gỡ ruby dạng HTML trước, vì bên trong nó vẫn có thể lẫn ngoặc vuông.
  let at = 0;
  for (const match of field.matchAll(RUBY_TAG)) {
    pushBracketed(field.slice(at, match.index), push);
    // `<rp>` chỉ chứa ngoặc dự phòng cho trình duyệt không dựng được ruby —
    // không phải mặt chữ, cũng không phải cách đọc.
    const inner = match[1].replace(/<rp\b[^>]*>[\s\S]*?<\/rp>/gi, "");
    const reading = firstReading(RT_TAG.exec(inner)?.[1] ?? "");
    push(stripHtml(inner.replace(RT_TAG, "")), reading || undefined);
    at = match.index + match[0].length;
  }
  pushBracketed(field.slice(at), push);

  // Khoảng trắng thừa ở hai đầu cả trường thì cắt — chỉ ở hai đầu, vì bên trong
  // nó có thể đang ngăn hai từ.
  if (segments.length > 0) {
    const first = segments[0];
    const last = segments[segments.length - 1];
    if (first.reading === undefined) first.text = first.text.replace(/^\s+/, "");
    if (last.reading === undefined) last.text = last.text.replace(/\s+$/, "");
  }
  return segments.filter((s) => s.text !== "");
}

/** Phần văn bản chưa có ruby HTML: quét tiếp kiểu ngoặc vuông trong đó. */
function pushBracketed(chunk: string, push: (text: string, reading?: string) => void): void {
  if (!chunk) return;
  let at = 0;
  for (const match of chunk.matchAll(BRACKET_RUBY)) {
    // Anki chèn một khoảng trắng ngay trước mặt chữ để đánh dấu ruby bắt đầu từ
    // đâu. Nó là dấu phân cách chứ không phải nội dung — giữ lại thì câu tiếng
    // Nhật hiện ra rời rạc từng cụm.
    push(stripInline(chunk.slice(at, match.index)).replace(/ $/, ""));
    push(stripInline(match[1]), firstReading(match[2]) || undefined);
    at = match.index + match[0].length;
  }
  push(stripInline(chunk.slice(at)));
}

/**
 * Cách đọc của một đoạn ruby, lấy phương án ĐẦU khi thẻ ghi nhiều cách đọc thay
 * thế ngăn bằng xuống dòng.
 *
 * Bộ JLPT Tango N1 ghi `行[い<br>ゆ]き` cho từ đọc được cả いきちがい lẫn
 * ゆきちがい. Gộp cả hai lại thành một chuỗi là ra cách đọc "い ゆきちがい" —
 * không phải cách đọc nào có thật, mà lại lọt thẳng vào ô cách đọc của bộ từ rồi
 * hiện lên thành furigana bịa. Bộ từ chỉ có một ô, nên lấy phương án đầu.
 */
function firstReading(raw: string): string {
  return stripHtml(raw.split(/<br\s*\/?>/i)[0]);
}

/** Chỉ lấy phần cách đọc của một trường furigana: `身内[みうち]` → `みうち`.
 *  Trường không có ruby nào (đã là kana sẵn) thì trả về chính chữ đó. */
export function readingFromFurigana(field: string): string {
  const segments = parseAnkiFurigana(field);
  return segments.map((s) => s.reading ?? s.text).join("");
}

/** Bỏ phần ruby, giữ mặt chữ: `身内[みうち]` → `身内`. */
export function baseFromFurigana(field: string): string {
  return parseAnkiFurigana(field)
    .map((s) => s.text)
    .join("");
}
