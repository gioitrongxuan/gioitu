import { describe, it, expect } from "vitest";
import {
  baseFromFurigana,
  extractMedia,
  parseAnkiFurigana,
  readingFromFurigana,
  stripHtml,
} from "@/features/vocabstudy/domain/ankiField";

// Mọi chuỗi dưới đây chép nguyên văn từ bộ "Ankidrone Starter Pack — JLPT Tango
// N1", kể cả những chỗ HTML méo. Bịa ra chuỗi sạch rồi test thì chỉ chứng minh
// được là hàm chạy trên dữ liệu không tồn tại.
const SENT_KANJI = "<b>身内</b>に医者がいると、何かと安心だ。";
const SENT_FURIGANA = "<b> 身内[みうち]</b>に 医者[いしゃ]がいると、 何[なに]かと 安心[あんしん]だ。";
const RUBY_FURIGANA =
  "<ruby><rb>父</rb><rt>ちち</rt></ruby>が<ruby><rb>他界</rb><rt>たかい</rt></ruby>し、" +
  "<b style=color: rgb(51, 102, 204);><ruby><rb>肉親</rb><rt>にくしん</rt></ruby></b>は";

describe("bóc HTML khỏi trường Anki", () => {
  it("bỏ thẻ định dạng, giữ nguyên câu", () => {
    expect(stripHtml(SENT_KANJI)).toBe("身内に医者がいると、何かと安心だ。");
  });

  it("chịu được thẻ có thuộc tính không nháy và lẫn dấu chấm phẩy", () => {
    // `<b style=color: rgb(51, 102, 204);>` là HTML sai chuẩn nhưng có thật —
    // trình soạn thẻ của Anki sinh ra thế.
    expect(stripHtml("<b style=color: rgb(51, 102, 204);>肉親</b>")).toBe("肉親");
  });

  it("bỏ cú pháp âm thanh của Anki", () => {
    expect(stripHtml("[sound:N1_0001_2.mp3]食べる")).toBe("食べる");
  });

  it("đổi ngắt dòng thành khoảng trắng để hai dòng không dính vào nhau", () => {
    expect(stripHtml("một<br>hai")).toBe("một hai");
    expect(stripHtml("<div>một</div><div>hai</div>")).toBe("một hai");
  });

  it("đổi thực thể HTML về ký tự, giữ nguyên thực thể lạ", () => {
    expect(stripHtml("a &amp; b &lt;c&gt; &#x3042; &khongcothat;")).toBe("a & b <c> あ &khongcothat;");
  });
});

describe("tìm tệp media trong trường", () => {
  it("lấy được tên tệp âm thanh", () => {
    expect(extractMedia("[sound:N1_0001_1.mp3][sound:N1_0001_2.mp3]").sounds).toEqual([
      "N1_0001_1.mp3",
      "N1_0001_2.mp3",
    ]);
  });

  it("lấy được src của ảnh dù có nháy hay không", () => {
    expect(extractMedia('<img src="1670892071719.jpg" data-editor-shrink="true">').images).toEqual([
      "1670892071719.jpg",
    ]);
    expect(extractMedia("<img src=1670806652477.png data-editor-shrink=true>").images).toEqual([
      "1670806652477.png",
    ]);
  });

  it("không nhặt gì khi trường không có media", () => {
    expect(extractMedia("身内")).toEqual({ sounds: [], images: [] });
  });
});

describe("phân tích furigana", () => {
  it("đọc kiểu ngoặc vuông và nuốt khoảng trắng phân cách", () => {
    // Khoảng trắng trước mỗi mặt chữ là dấu hiệu của Anki, không phải nội dung:
    // giữ lại thì câu hiện ra "身内 に 医者 が…" rời rạc.
    expect(parseAnkiFurigana(SENT_FURIGANA)).toEqual([
      { text: "身内", reading: "みうち" },
      { text: "に" },
      { text: "医者", reading: "いしゃ" },
      { text: "がいると、" },
      { text: "何", reading: "なに" },
      { text: "かと" },
      { text: "安心", reading: "あんしん" },
      { text: "だ。" },
    ]);
  });

  it("đọc kiểu thẻ ruby của HTML", () => {
    expect(parseAnkiFurigana(RUBY_FURIGANA)).toEqual([
      { text: "父", reading: "ちち" },
      { text: "が" },
      { text: "他界", reading: "たかい" },
      { text: "し、" },
      { text: "肉親", reading: "にくしん" },
      { text: "は" },
    ]);
  });

  it("đọc được cả hai kiểu lẫn trong một trường", () => {
    // Cùng một deck vẫn trộn hai lối viết, nên đây không phải ca giả định.
    expect(parseAnkiFurigana("<ruby><rb>父</rb><rt>ちち</rt></ruby>と 母[はは]")).toEqual([
      { text: "父", reading: "ちち" },
      { text: "と" },
      { text: "母", reading: "はは" },
    ]);
  });

  it("bỏ ngoặc dự phòng rp, không coi là mặt chữ", () => {
    expect(parseAnkiFurigana("<ruby>父<rp>（</rp><rt>ちち</rt><rp>）</rp></ruby>")).toEqual([
      { text: "父", reading: "ちち" },
    ]);
  });

  it("không cắt khoảng trắng ngăn hai từ ở giữa câu", () => {
    // Ngoài tiếng Nhật ra, khoảng trắng giữa hai đoạn là ranh giới từ thật.
    expect(parseAnkiFurigana("the 猫[ねこ] sat")).toEqual([
      { text: "the" },
      { text: "猫", reading: "ねこ" },
      { text: " sat" },
    ]);
  });

  it("lấy cách đọc đầu khi thẻ ghi nhiều phương án", () => {
    // Có thật trong bộ N1: 行き違い đọc được cả いきちがい lẫn ゆきちがい, deck
    // nhét cả hai vào một ruby. Gộp lại thì ô cách đọc thành "い ゆきちがい" —
    // một cách đọc không tồn tại, rồi hiện lên thành furigana bịa.
    expect(readingFromFurigana("行[い<br>ゆ]き 違[ちが]い")).toBe("いきちがい");
  });

  it("trường chỉ có chữ thường thì thành một đoạn trần", () => {
    expect(parseAnkiFurigana("たべる")).toEqual([{ text: "たべる" }]);
  });

  it("tách được riêng cách đọc và riêng mặt chữ", () => {
    expect(readingFromFurigana("身内[みうち]")).toBe("みうち");
    expect(baseFromFurigana("身内[みうち]")).toBe("身内");
    // Trường đã là kana sẵn thì cách đọc chính là nó.
    expect(readingFromFurigana("たべる")).toBe("たべる");
  });

  it("dựng lại nguyên câu từ các đoạn", () => {
    expect(baseFromFurigana(SENT_FURIGANA)).toBe(stripHtml(SENT_KANJI));
  });
});
