// Từ mấy bảng thô của `collection.anki2` dựng ra thứ màn nhập cần biết: trong
// gói có những loại thẻ nào, mỗi loại có trường gì, và trường nào nên rơi vào
// cột nào của bộ từ.
//
// Anki đổi cách lưu loại thẻ giữa chừng: bản cũ nhét cả cụm vào một chuỗi JSON
// trong bảng `col`, bản từ 2.1.28 tách ra thành bảng `notetypes` + `fields`.
// Cả hai đều gặp trong các gói tải về, nên đọc được cả hai — chỗ khác nhau gói
// gọn trong `readNoteTypes`/`readDecks`, phần còn lại không cần biết.
//
// Hàm thuần: nhận `SqliteFile` (chính nó cũng thuần) và trả về dữ liệu, không
// đụng IndexedDB hay React.

import { SqliteFile, SqlValue } from "./sqlite";
import { baseFromFurigana, extractMedia, readingFromFurigana, stripHtml } from "./ankiField";
import {
  EXAMPLE_SEP,
  MAX_WORDSET_WORDS,
  ParsedWordset,
  WordsetDraft,
  wordsetKey,
} from "./wordset";

/** Một loại thẻ cùng danh sách trường của nó, theo đúng thứ tự trường. */
export interface AnkiNoteType {
  id: number;
  name: string;
  fields: string[];
  noteCount: number;
}

export interface AnkiDeckInfo {
  id: number;
  name: string;
  noteCount: number;
}

export interface AnkiCollection {
  noteTypes: AnkiNoteType[];
  decks: AnkiDeckInfo[];
}

/** Một note đã đọc: giá trị các trường theo đúng thứ tự của loại thẻ. */
export interface AnkiNote {
  id: number;
  noteTypeId: number;
  deckId: number;
  fields: string[];
}

/**
 * Ký tự Anki dùng để ngăn các trường trong một note (Unit Separator, 0x1f).
 *
 * Viết bằng escape chứ không dán byte điều khiển thô vào mã nguồn: byte thô làm
 * git coi cả tệp là nhị phân — mất diff, mất review, mất blame. Cùng lý do với
 * ký tự phân tách trong `wordsetKey`.
 */
const FIELD_SEPARATOR = "\u001f";

/** Bản cũ ngăn deck cha/con bằng "::", bản mới dùng chính ký tự trên. */
const DECK_PATH_SEPARATOR = "::";

/** Đọc toàn bộ cấu trúc gói: có loại thẻ nào, deck nào, mỗi thứ bao nhiêu note. */
export function readAnkiCollection(db: SqliteFile): AnkiCollection {
  const noteTypes = readNoteTypes(db);
  const decks = readDecks(db);
  const deckOfNote = readDeckOfNote(db);

  const byNoteType = new Map<number, number>();
  const byDeck = new Map<number, number>();
  const mid = columnIndex(db, "notes", "mid");
  db.scanTable("notes", (row) => {
    const noteTypeId = asNumber(row.values[mid]);
    if (noteTypeId !== null) byNoteType.set(noteTypeId, (byNoteType.get(noteTypeId) ?? 0) + 1);
    const deckId = deckOfNote.get(row.rowid);
    if (deckId !== undefined) byDeck.set(deckId, (byDeck.get(deckId) ?? 0) + 1);
  });

  return {
    // Loại thẻ không có note nào chỉ làm rối dropdown — gói nào cũng kèm vài
    // loại mặc định chưa dùng tới ("Basic", "Cloze").
    noteTypes: noteTypes
      .map((t) => ({ ...t, noteCount: byNoteType.get(t.id) ?? 0 }))
      .filter((t) => t.noteCount > 0)
      .sort((a, b) => b.noteCount - a.noteCount),
    decks: decks
      .map((d) => ({ ...d, noteCount: byDeck.get(d.id) ?? 0 }))
      .filter((d) => d.noteCount > 0)
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/**
 * Duyệt các note thuộc một loại thẻ (và một deck, nếu có lọc), gọi `visit` cho
 * từng note. Kiểu callback vì cùng lý do với `SqliteFile.scanTable`: deck lớn
 * có hàng trăm nghìn note, dựng hết thành mảng là ôm bộ nhớ vô ích.
 */
export function scanAnkiNotes(
  db: SqliteFile,
  filter: { noteTypeId: number; deckId?: number },
  visit: (note: AnkiNote) => void,
): void {
  const deckOfNote = readDeckOfNote(db);
  const mid = columnIndex(db, "notes", "mid");
  const flds = columnIndex(db, "notes", "flds");
  db.scanTable("notes", (row) => {
    if (asNumber(row.values[mid]) !== filter.noteTypeId) return;
    const deckId = deckOfNote.get(row.rowid) ?? 0;
    if (filter.deckId !== undefined && deckId !== filter.deckId) return;
    const raw = row.values[flds];
    if (typeof raw !== "string") return;
    visit({ id: row.rowid, noteTypeId: filter.noteTypeId, deckId, fields: raw.split(FIELD_SEPARATOR) });
  });
}

/** Loại thẻ, đọc được ở cả hai cách lưu. */
function readNoteTypes(db: SqliteFile): Omit<AnkiNoteType, "noteCount">[] {
  if (db.tableNames().includes("notetypes")) {
    const names = new Map<number, string>();
    const idAt = columnIndex(db, "notetypes", "id");
    const nameAt = columnIndex(db, "notetypes", "name");
    db.scanTable("notetypes", (row) => {
      names.set(asNumber(row.values[idAt]) ?? row.rowid, String(row.values[nameAt] ?? ""));
    });

    // Trường nằm ở bảng riêng, `ord` mới là thứ tự thật — thứ tự hàng không phải.
    const fields = new Map<number, { ord: number; name: string }[]>();
    const ntid = columnIndex(db, "fields", "ntid");
    const ord = columnIndex(db, "fields", "ord");
    const fname = columnIndex(db, "fields", "name");
    db.scanTable("fields", (row) => {
      const owner = asNumber(row.values[ntid]);
      if (owner === null) return;
      const list = fields.get(owner) ?? [];
      list.push({ ord: asNumber(row.values[ord]) ?? list.length, name: String(row.values[fname] ?? "") });
      fields.set(owner, list);
    });

    return [...names].map(([id, name]) => ({
      id,
      name,
      fields: (fields.get(id) ?? []).sort((a, b) => a.ord - b.ord).map((f) => f.name),
    }));
  }

  return Object.values(readColJson(db, "models")).map((model) => {
    const m = model as { id?: number; name?: string; flds?: { name?: string; ord?: number }[] };
    return {
      id: Number(m.id ?? 0),
      name: String(m.name ?? ""),
      fields: [...(m.flds ?? [])]
        .sort((a, b) => (a.ord ?? 0) - (b.ord ?? 0))
        .map((f) => String(f.name ?? "")),
    };
  });
}

function readDecks(db: SqliteFile): Omit<AnkiDeckInfo, "noteCount">[] {
  if (db.tableNames().includes("decks")) {
    const decks: Omit<AnkiDeckInfo, "noteCount">[] = [];
    const idAt = columnIndex(db, "decks", "id");
    const nameAt = columnIndex(db, "decks", "name");
    db.scanTable("decks", (row) => {
      decks.push({
        id: asNumber(row.values[idAt]) ?? row.rowid,
        // Bản mới ngăn deck cha/con bằng ký tự phân cách chứ không phải "::";
        // đổi lại cho tên hiện ra giống hệt trong Anki.
        name: String(row.values[nameAt] ?? "").split(FIELD_SEPARATOR).join(DECK_PATH_SEPARATOR),
      });
    });
    return decks;
  }

  return Object.values(readColJson(db, "decks")).map((deck) => {
    const d = deck as { id?: number; name?: string };
    return { id: Number(d.id ?? 0), name: String(d.name ?? "") };
  });
}

/**
 * Note nằm ở deck nào. Anki gắn deck cho *thẻ* chứ không cho note, mà một note
 * đẻ ra nhiều thẻ có thể nằm khác deck. Ta lấy deck của thẻ đầu tiên: bộ từ chỉ
 * cần biết "note này thuộc bài nào", còn chuyện một note rải ra nhiều deck là
 * chuyện của lịch ôn bên Anki, không phải của cột nào trong bộ từ.
 */
function readDeckOfNote(db: SqliteFile): Map<number, number> {
  const map = new Map<number, number>();
  if (!db.tableNames().includes("cards")) return map;
  const nid = columnIndex(db, "cards", "nid");
  const did = columnIndex(db, "cards", "did");
  db.scanTable("cards", (row) => {
    const noteId = asNumber(row.values[nid]);
    const deckId = asNumber(row.values[did]);
    if (noteId === null || deckId === null || map.has(noteId)) return;
    map.set(noteId, deckId);
  });
  return map;
}

/** Một ô JSON của bảng `col` (cách lưu cũ). Hỏng thì coi như rỗng — gói vẫn nhập
 *  được bằng cách lưu kia, không việc gì phải chết cả tiến trình. */
function readColJson(db: SqliteFile, column: string): Record<string, unknown> {
  const col = db.readTable("col");
  const at = col.columns.indexOf(column);
  const raw = at >= 0 ? col.rows[0]?.values[at] : null;
  if (typeof raw !== "string" || raw === "") return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function columnIndex(db: SqliteFile, table: string, column: string): number {
  const at = db.columnsOf(table).indexOf(column);
  if (at < 0) throw new Error(`Bảng “${table}” của gói Anki thiếu cột “${column}”`);
  return at;
}

function asNumber(value: SqlValue): number | null {
  return typeof value === "number" ? value : null;
}

/**
 * Trường của thẻ được dùng vào việc gì trong bộ từ.
 *
 * Bốn vai trò cuối lấy MEDIA chứ không lấy chữ: giá trị đọc ra từ chúng là tên
 * tệp nhúng trong trường (`[sound:…]`, `<img src=…>`), trừ `exampleFurigana` là
 * chính đoạn ruby thô.
 */
export type FieldRole =
  | "term"
  | "reading"
  | "gloss"
  | "example"
  | "exampleTranslation"
  | "exampleFurigana"
  | "image"
  | "audio"
  | "exampleAudio";

/** Vai trò → chỉ số trường trong loại thẻ. Vai trò vắng mặt nghĩa là bỏ trống cột. */
export type FieldMapping = Partial<Record<FieldRole, number>>;

/**
 * Tên trường gợi ý vai trò, xếp từ đặc thù tới chung chung.
 *
 * Vòng ngoài là *độ chắc chắn*: cả bảng được quét theo từng vòng, nên một cái
 * tên khớp chính xác ("VocabDef") luôn giành được vai trò trước khi một cái tên
 * mơ hồ ("Back") kịp lên tiếng. Không có thứ tự ấy thì trong bộ N1 này, trường
 * `SentViet` sẽ cướp mất cột nghĩa của `VocabDef`.
 *
 * Danh sách viết theo lối của `HEADER_LABELS` trong `wordset.ts` — cùng vấn đề
 * (đoán ý người ta đặt tên cột), nên cùng cách giải.
 */
const ROLE_HINTS: Record<FieldRole, RegExp[]> = {
  term: [/^vocab(kanji|word|expression)?$/, /^(word|expression|term|kanji|単語|表現)$/, /^front$/, /vocab|word|expression|term/],
  reading: [/^vocab(furigana|reading|kana)$/, /^(reading|furigana|kana|yomi|pronunciation)$/, /reading|furigana|kana/],
  gloss: [
    /^vocab(def|definition|meaning)$/,
    /^(meaning|definition|nghia|nghĩa|gloss)$/,
    /^(back|english|vietnamese|translation)$/,
    /def|meaning|nghia|gloss/,
  ],
  example: [/^sent(kanji|ence)?$/, /^(sentence|example|expression)$/, /sentence|example|sent/],
  exampleTranslation: [
    /^sent(viet|vietnamese|english|eng|translation|meaning)$/,
    /^(sentencetranslation|exampletranslation)$/,
    /^(sent|sentence|example).*(viet|eng|translation|meaning)/,
  ],
  exampleFurigana: [/^sent(furigana|reading|kana)$/, /^(sentence|example)(furigana|reading)$/, /sentfurigana/],
  image: [/^(image|picture|photo|img)$/, /^vocab(image|picture)$/, /image|picture|photo/],
  audio: [/^vocab(audio|sound|pronunciation)$/, /^(audio|sound|pronunciation|wordaudio)$/, /^(?!sent).*audio/],
  exampleAudio: [/^sent(audio|encesound)$/, /^(sentenceaudio|exampleaudio)$/, /^(sent|sentence|example).*(audio|sound)/],
};

/** Thứ tự giành trường khi hai vai trò cùng khớp ở một vòng. Mặt chữ quan trọng
 *  nhất — thiếu nó là cả dòng bị bỏ. */
const ROLE_PRIORITY: FieldRole[] = [
  "term",
  "reading",
  "gloss",
  "example",
  "exampleTranslation",
  "exampleFurigana",
  "audio",
  "exampleAudio",
  "image",
];

/** Số vòng quét, bằng danh sách gợi ý dài nhất. */
const HINT_ROUNDS = Math.max(...Object.values(ROLE_HINTS).map((h) => h.length));

/**
 * Đoán trường nào vào cột nào. Mỗi trường chỉ nhận một vai trò và ngược lại, nên
 * đoán xong là bảng ghép đã dùng được ngay — người dùng chỉ sửa chỗ nào thấy sai.
 */
export function guessMapping(fields: string[]): FieldMapping {
  const mapping: FieldMapping = {};
  const taken = new Set<number>();
  const normalised = fields.map((f) => f.toLowerCase().replace(/[\s_-]/g, ""));

  for (let round = 0; round < HINT_ROUNDS; round += 1) {
    for (const role of ROLE_PRIORITY) {
      if (mapping[role] !== undefined) continue;
      const hint = ROLE_HINTS[role][round];
      if (!hint) continue;
      const at = normalised.findIndex((name, i) => !taken.has(i) && hint.test(name));
      if (at >= 0) {
        mapping[role] = at;
        taken.add(at);
      }
    }
  }
  return mapping;
}

/** Ghép câu ví dụ với bản dịch theo đúng quy ước "câu :: bản dịch" của bộ từ. */
function joinExample(sentence: string, translation: string): string {
  if (!sentence) return translation;
  return translation ? `${sentence} ${EXAMPLE_SEP} ${translation}` : sentence;
}

/**
 * Đổi một note thành một dòng bộ từ theo bảng ghép.
 *
 * Mặt chữ và cách đọc đi qua bộ phân tích furigana chứ không chỉ bóc HTML: nếu
 * người dùng trỏ cột mặt chữ vào một trường furigana (`身内[みうち]`), ta vẫn ra
 * `身内` thay vì nguyên cả cụm ngoặc.
 *
 * Hệ quả đáng kể mà nhìn qua tưởng tình cờ: bộ JLPT Tango N1 đánh số hậu tố cho
 * từ dạy lại ở bài sau — `遺産[1]`, `遺産[2]` — và cùng phép gọt ấy đưa cả hai về
 * `遺産`. Lưới từ vựng vốn mỗi từ một ô, nên gộp lại mới đúng: 172 dòng của bộ
 * này rơi vào diện đó và được khử trùng ở `collectDrafts`.
 */
export function noteToDraft(note: AnkiNote, mapping: FieldMapping): WordsetDraft {
  const at = (role: FieldRole): string => {
    const index = mapping[role];
    return index === undefined ? "" : note.fields[index] ?? "";
  };

  const term = baseFromFurigana(at("term"));
  const reading = readingFromFurigana(at("reading"));
  const gloss = stripHtml(at("gloss"));
  const example = joinExample(stripHtml(at("example")), stripHtml(at("exampleTranslation")));

  // Trường media của Anki chứa cả thẻ lẫn tên tệp (`[sound:a.mp3]`,
  // `<img src=b.jpg>`); ta chỉ giữ tên. Trường nào có nhiều tệp thì lấy tệp đầu:
  // thẻ chỉ có một ô ảnh và một nút phát âm cho mỗi loại.
  const imageName = extractMedia(at("image")).images[0];
  const audioName = extractMedia(at("audio")).sounds[0];
  const exampleAudioName = extractMedia(at("exampleAudio")).sounds[0];
  const exampleFurigana = at("exampleFurigana").trim();

  return {
    term,
    // Cách đọc trùng y hệt mặt chữ là dư thừa — từ viết toàn kana thì trường
    // furigana của Anki chính là mặt chữ, hiện lại lần nữa chỉ tổ rối.
    ...(reading && reading !== term ? { reading } : {}),
    ...(gloss ? { gloss } : {}),
    ...(example ? { example } : {}),
    ...(exampleFurigana ? { exampleFurigana } : {}),
    ...(imageName ? { imageName } : {}),
    ...(audioName ? { audioName } : {}),
    ...(exampleAudioName ? { exampleAudioName } : {}),
  };
}

/**
 * Tên mọi tệp media mà một bộ từ đã dựng trỏ tới, không trùng lặp.
 *
 * Danh sách này sinh ra SAU khi ghép trường, từ chính các dòng giữ lại — nên
 * ảnh của thẻ bị lọc bỏ, và cả mấy chục MB phông chữ mà gói nào cũng kèm, đều
 * không bị bóc ra. Không cần luật riêng "bỏ tệp .ttf": đơn giản là không từ nào
 * trỏ tới chúng.
 */
export function mediaNamesOf(words: WordsetDraft[]): string[] {
  const names = new Set<string>();
  for (const w of words) {
    for (const name of [w.imageName, w.audioName, w.exampleAudioName]) {
      if (name) names.add(name);
    }
  }
  return [...names];
}

/**
 * Gom các note đã ghép trường thành một bộ từ, khử trùng và cắt theo trần —
 * cùng luật với đường nhập bằng văn bản, và trả về đúng kiểu `ParsedWordset` để
 * màn nhập dùng lại nguyên phần tóm tắt "đọc được N từ · bỏ M dòng trùng".
 */
export function collectDrafts(drafts: Iterable<WordsetDraft>): ParsedWordset {
  const words: WordsetDraft[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  let duplicates = 0;
  let truncated = 0;

  for (const draft of drafts) {
    if (!draft.term) {
      skipped += 1;
      continue;
    }
    const key = wordsetKey(draft.term, draft.reading ?? "");
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    if (words.length >= MAX_WORDSET_WORDS) {
      truncated += 1;
      continue;
    }
    words.push(draft);
  }

  return { words, skipped, duplicates, truncated };
}

/** Người dùng đang chọn nhập cái gì từ gói: loại thẻ nào, deck nào, cột nào vào đâu. */
export interface ApkgSelection {
  noteTypeId: number;
  /** `null` = mọi deck. */
  deckId: number | null;
  mapping: FieldMapping;
}

/** Lựa chọn mặc định khi vừa mở gói: loại thẻ nhiều thẻ nhất, mọi deck, ghép tự đoán. */
export function defaultSelection(collection: AnkiCollection): ApkgSelection {
  const noteType = collection.noteTypes[0];
  return {
    noteTypeId: noteType?.id ?? 0,
    deckId: null,
    mapping: guessMapping(noteType?.fields ?? []),
  };
}

/**
 * Dựng trọn bộ từ theo một lựa chọn. Là cả đường đi từ gói tới bộ từ gói trong
 * một hàm, nên màn nhập chỉ việc gọi lại mỗi khi người dùng đổi dropdown.
 */
export function buildWordset(db: SqliteFile, selection: ApkgSelection): ParsedWordset {
  const drafts: WordsetDraft[] = [];
  scanAnkiNotes(
    db,
    { noteTypeId: selection.noteTypeId, ...(selection.deckId === null ? {} : { deckId: selection.deckId }) },
    (note) => drafts.push(noteToDraft(note, selection.mapping)),
  );
  return collectDrafts(drafts);
}

/** Tên bộ gợi ý từ deck: bỏ đường dẫn deck cha, giữ lại tên lá cho gọn. */
export function titleFromDeckName(name: string): string {
  const leaf = name.split(DECK_PATH_SEPARATOR).pop() ?? name;
  return leaf.trim() || name.trim();
}
