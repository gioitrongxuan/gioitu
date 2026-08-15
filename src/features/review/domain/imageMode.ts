// Chế độ hình ảnh: trình chiếu ảnh minh hoạ của các từ đang học để ôn bằng mắt
// (#263). Thuần — chỉ dựng danh sách chiếu, nở một từ thành các bước hiện, và
// chọn ảnh khớp từ trong kết quả tra; việc gọi mạng nằm ở `../data/wordImages`.
//
// Không chấm điểm, không ghi gì — song sinh với chế độ nghe (`listen.ts`), chỉ
// khác giác quan: nghe dùng tai, chế độ này dùng mắt.

import { VocabEntry } from "@/shared/types";
import { DictEntry } from "@/shared/db";
import { DictImage } from "@/shared/dictionary";
import { CloudLang, filterByLang, isVisibleOnCloud } from "./wordcloud";
import { shuffle } from "./session";
import { ImageModeSettings } from "./imageModeSettings";

/**
 * Số ảnh giữ lại cho một thẻ. Chỉ hiện MỘT ảnh mỗi lúc — phần dư là ảnh dự
 * phòng: ảnh Mazii là hotlink tới CDN ngoài nên chết dần theo thời gian, có
 * cái thay thế thì thẻ không rơi vào ô trống chỉ vì URL đầu đã hỏng.
 */
export const MAX_IMAGES_PER_CARD = 4;

/**
 * Số từ trắng ảnh liên tiếp thì thôi không dò nữa. Mỗi từ là một lượt gọi mạng,
 * nên với kho vài trăm từ mà từ điển máy chủ chưa có ảnh, dò hết là hàng trăm
 * request để cuối cùng vẫn báo "không có gì". Dừng ở đây rồi để người dùng tự
 * quyết có tìm tiếp không.
 */
export const GIVE_UP_AFTER_MISSES = 20;

/**
 * Đã dò đủ để kết luận "danh sách này không có ảnh" chưa. Danh sách ngắn hơn
 * ngưỡng thì mốc là chính độ dài của nó — dò hết một vòng là biết chắc.
 */
export function shouldGiveUp(misses: number, playlistLength: number): boolean {
  if (playlistLength === 0) return false;
  return misses >= Math.min(playlistLength, GIVE_UP_AFTER_MISSES);
}

/** Một bước hiện của thẻ: chỉ ảnh (tự nhớ lại), rồi ảnh kèm đáp án. */
export type ImageStep = { kind: "recall" | "reveal"; ms: number };

/** Phần định danh một từ cần để tra ảnh — nhận cả VocabEntry lẫn DictEntry. */
export type ImageWord = Pick<VocabEntry, "term" | "term_lang" | "native_lang"> &
  Partial<Pick<VocabEntry, "reading">>;

/**
 * Khoá nhận diện một từ trong bộ nhớ đệm ảnh. Gồm cả cặp ngôn ngữ lẫn cách đọc
 * vì đó đúng là danh tính một từ ở app này (khoá store `terms` cũng vậy): 辛い
 * からい và 辛い つらい là hai từ khác nhau, không được dùng chung ảnh.
 */
export function wordImageKey(word: ImageWord): string {
  return [word.term_lang, word.native_lang, word.term, word.reading ?? ""].join("\0");
}

/**
 * Nở một thẻ thành chuỗi bước: ảnh trần (tự đoán từ) → hiện từ và nghĩa.
 *
 * Bước "tự nhớ lại" mới là chỗ học thật — nhìn ảnh rồi lôi từ ra khỏi trí nhớ.
 * Ai chỉ muốn xem lướt cho quen mặt thì bật "hiện nghĩa ngay", khi đó thẻ rút
 * còn đúng một bước.
 */
export function cardSteps(settings: ImageModeSettings): ImageStep[] {
  if (settings.revealAtOnce) return [{ kind: "reveal", ms: settings.holdMs }];
  return [
    { kind: "recall", ms: settings.holdMs },
    { kind: "reveal", ms: settings.holdMs },
  ];
}

/**
 * Từ chiếu được: đang học (đúng tập trên Bản đồ từ) và thuộc ngôn ngữ đang
 * chọn. KHÔNG lọc theo "có ảnh hay không" — ảnh nằm ở máy chủ, muốn biết phải
 * tra từng từ, nên nút "Hình ảnh" chỉ đếm được số từ *ứng viên*; những từ không
 * có ảnh bị bỏ qua lúc chiếu (xem `ImageSession`).
 *
 * Tách khỏi `buildImagePlaylist` để nơi chỉ cần *đếm* không phải xáo cả danh
 * sách mỗi lần render — cùng lý do như `listenableEntries`.
 */
export function imageableEntries(entries: VocabEntry[], lang: CloudLang): VocabEntry[] {
  return filterByLang(entries.filter(isVisibleOnCloud), lang);
}

/**
 * Danh sách chiếu: các từ chiếu được, xáo trộn. Gọi lại với `rng` mới để sang
 * vòng kế — thứ tự khác nhau nên không thuộc lòng theo thứ tự.
 */
export function buildImagePlaylist(
  entries: VocabEntry[],
  lang: CloudLang,
  rng: () => number = Math.random,
): VocabEntry[] {
  return shuffle(imageableEntries(entries, lang), rng);
}

/**
 * Chọn ảnh của ĐÚNG từ đang chiếu trong kết quả tra.
 *
 * `serverLookup` khớp cả mặt chữ lẫn âm đọc nên một lượt tra có thể trả về cả
 * từ đồng âm khác chữ (さくら → 桜, 櫻). Lấy bừa kết quả đầu là dán ảnh của từ
 * khác lên thẻ, nên xếp theo độ khớp giảm dần — khớp cả chữ lẫn âm, rồi khớp
 * chữ, rồi khớp âm — và lấy ứng viên khớp nhất mà thật sự có ảnh. Không khớp
 * gì thì trả rỗng, thà bỏ qua thẻ còn hơn minh hoạ sai từ.
 */
export function pickImages(hits: DictEntry[], word: ImageWord): DictImage[] {
  const reading = word.reading ?? "";
  const rank = (hit: DictEntry): number => {
    const sameTerm = hit.term === word.term;
    const sameReading = reading !== "" && (hit.reading ?? "") === reading;
    if (sameTerm && sameReading) return 0;
    if (sameTerm) return 1;
    if (sameReading) return 2;
    return 3;
  };
  const best = hits
    .map((hit) => ({ hit, score: rank(hit) }))
    .filter(({ hit, score }) => score < 3 && (hit.images?.length ?? 0) > 0)
    .sort((a, b) => a.score - b.score)[0];
  return best ? best.hit.images!.slice(0, MAX_IMAGES_PER_CARD) : [];
}
