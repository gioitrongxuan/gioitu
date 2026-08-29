import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SqliteFile } from "@/features/vocabstudy/domain/sqlite";
import {
  collectDrafts,
  guessMapping,
  mediaNamesOf,
  noteToDraft,
  readAnkiCollection,
  scanAnkiNotes,
  titleFromDeckName,
} from "@/features/vocabstudy/domain/ankiDeck";
import { WordsetDraft } from "@/features/vocabstudy/domain/wordset";

/**
 * Bản thu nhỏ của gói "Ankidrone Starter Pack — JLPT Tango N1": cùng khuôn bảng,
 * cùng loại thẻ, cùng những chỗ HTML méo, nhưng 4 note thay vì 2024. Giữ nguyên
 * cả câu chú thích có dấu phẩy trong `CREATE TABLE notes` — chính nó từng làm
 * lệch cột.
 */
const FIXTURE = fileURLToPath(new URL("./fixtures/anki-sample.anki2", import.meta.url));

const JAPANESE_SENTENCES = 1639851643137;
const DECK_N1 = 1670684372082;

function open(): SqliteFile {
  return new SqliteFile(new Uint8Array(readFileSync(FIXTURE)));
}

/** Dựng bộ từ đúng như màn nhập sẽ làm, để test đi qua trọn đường đi. */
function importWordset(db: SqliteFile, noteTypeId: number, deckId?: number) {
  const type = readAnkiCollection(db).noteTypes.find((t) => t.id === noteTypeId)!;
  const mapping = guessMapping(type.fields);
  const drafts: WordsetDraft[] = [];
  scanAnkiNotes(db, { noteTypeId, ...(deckId === undefined ? {} : { deckId }) }, (n) =>
    drafts.push(noteToDraft(n, mapping)),
  );
  return collectDrafts(drafts);
}

describe("đọc cấu trúc gói Anki", () => {
  it("liệt kê loại thẻ kèm số note, xếp loại nhiều note lên trước", () => {
    const { noteTypes } = readAnkiCollection(open());
    expect(noteTypes.map((t) => [t.name, t.noteCount])).toEqual([
      ["Japanese sentences", 3],
      ["Basic", 1],
    ]);
  });

  it("đọc đúng thứ tự trường của loại thẻ", () => {
    const type = readAnkiCollection(open()).noteTypes[0];
    expect(type.fields.slice(0, 3)).toEqual(["SentKanji", "SentFurigana", "SentViet"]);
    expect(type.fields[4]).toBe("VocabKanji");
  });

  it("liệt kê deck kèm số note", () => {
    const { decks } = readAnkiCollection(open());
    expect(decks.map((d) => [d.name, d.noteCount])).toEqual([
      ["Default", 1],
      ["Starter Pack::5. JLPT Tango N1", 3],
    ]);
  });

  it("lấy tên lá của deck làm tên bộ gợi ý", () => {
    expect(titleFromDeckName("Starter Pack::5. JLPT Tango N1")).toBe("5. JLPT Tango N1");
    expect(titleFromDeckName("Không có deck cha")).toBe("Không có deck cha");
  });
});

describe("đoán ghép trường", () => {
  it("ghép đúng loại thẻ nhiều trường của bộ N1", () => {
    const type = readAnkiCollection(open()).noteTypes[0];
    const mapping = guessMapping(type.fields);
    const nameOf = (i?: number) => (i === undefined ? undefined : type.fields[i]);
    expect(nameOf(mapping.term)).toBe("VocabKanji");
    expect(nameOf(mapping.reading)).toBe("VocabFurigana");
    // Chỗ dễ trượt nhất: `SentViet` cũng trông như một cột nghĩa, nhưng nghĩa
    // của TỪ nằm ở `VocabDef`, còn `SentViet` là bản dịch của CÂU.
    expect(nameOf(mapping.gloss)).toBe("VocabDef");
    expect(nameOf(mapping.example)).toBe("SentKanji");
    expect(nameOf(mapping.exampleTranslation)).toBe("SentViet");
  });

  it("ghép được loại thẻ Basic chỉ có Front/Back", () => {
    const mapping = guessMapping(["Front", "Back"]);
    expect(mapping.term).toBe(0);
    expect(mapping.gloss).toBe(1);
    expect(mapping.reading).toBeUndefined();
  });

  it("không cho hai vai trò cùng chiếm một trường", () => {
    const mapping = guessMapping(["Word", "Meaning", "Reading"]);
    expect(new Set(Object.values(mapping)).size).toBe(Object.values(mapping).length);
  });

  it("bỏ trống vai trò khi không có trường nào hợp", () => {
    expect(guessMapping(["Ảnh", "Ghi chú"]).term).toBeUndefined();
  });
});

describe("dựng bộ từ từ note", () => {
  it("đổ đúng các cột chữ, ghép câu ví dụ với bản dịch", () => {
    const words = importWordset(open(), JAPANESE_SENTENCES).words;
    expect(words[0]).toEqual({
      term: "身内",
      reading: "みうち",
      gloss: "Bà con",
      example: "身内に医者がいると、何かと安心だ。 :: Trong bà con dòng họ…",
      exampleFurigana: "<b> 身内[みうち]</b>に 医者[いしゃ]がいると、",
      imageName: "a.jpg",
      audioName: "N1_0001_1.mp3",
      exampleAudioName: "N1_0001_2.mp3",
    });
  });

  it("chỉ giữ TÊN tệp media, không giữ thẻ bọc quanh", () => {
    // Dòng từ phải nhẹ để quét 20k dòng còn nhanh; blob chỉ nạp lúc mở thẻ.
    const draft = noteToDraft(
      { id: 1, noteTypeId: 1, deckId: 1, fields: ["犬", "[sound:inu.mp3]", '<img src="inu.jpg">'] },
      { term: 0, audio: 1, image: 2 },
    );
    expect(draft.audioName).toBe("inu.mp3");
    expect(draft.imageName).toBe("inu.jpg");
  });

  it("gom tên media của cả bộ, không trùng lặp", () => {
    const words = importWordset(open(), JAPANESE_SENTENCES).words;
    expect(mediaNamesOf(words).sort()).toEqual(["N1_0001_1.mp3", "N1_0001_2.mp3", "a.jpg"]);
  });

  it("không gom media của dòng đã bị lọc bỏ", () => {
    // Đây là lý do danh sách media sinh ra SAU khi ghép trường: gói kèm mấy chục
    // MB phông chữ và ảnh của thẻ, không dòng nào trỏ tới thì không bóc ra.
    expect(mediaNamesOf([{ term: "犬" }])).toEqual([]);
  });

  it("gộp từ bị deck đánh số hậu tố để dạy lại", () => {
    // Bộ N1 ghi `遺産[1]` và `遺産[2]` cho cùng một từ dạy ở hai bài. Lưới từ
    // vựng mỗi từ một ô, nên hai note ấy phải về chung một dòng — không thì
    // người học thấy hai ô 遺産 y hệt nhau nằm cạnh nhau.
    const parsed = importWordset(open(), JAPANESE_SENTENCES);
    expect(parsed.words.map((w) => w.term)).toEqual(["身内", "遺産"]);
    expect(parsed.duplicates).toBe(1);
  });

  it("chỉ lấy note của loại thẻ được chọn", () => {
    // Note "hello / xin chào" thuộc loại Basic, không được lẫn vào bộ.
    expect(importWordset(open(), JAPANESE_SENTENCES).words.every((w) => w.term !== "hello")).toBe(true);
  });

  it("lọc được theo deck", () => {
    expect(importWordset(open(), JAPANESE_SENTENCES, DECK_N1).words).toHaveLength(2);
    // Deck Default không có note nào của loại thẻ này.
    expect(importWordset(open(), JAPANESE_SENTENCES, 1).words).toHaveLength(0);
  });

  it("bỏ cách đọc khi nó trùng y hệt mặt chữ", () => {
    const draft = noteToDraft(
      { id: 1, noteTypeId: 1, deckId: 1, fields: ["たべる", "たべる"] },
      { term: 0, reading: 1 },
    );
    expect(draft).toEqual({ term: "たべる" });
  });

  it("câu ví dụ không có bản dịch thì không kèm dấu ngăn thừa", () => {
    const draft = noteToDraft({ id: 1, noteTypeId: 1, deckId: 1, fields: ["犬", "犬が走る"] }, { term: 0, example: 1 });
    expect(draft.example).toBe("犬が走る");
  });
});
