// Lấy ảnh minh hoạ của một từ đang học, cho chế độ hình ảnh (#263).
//
// Vì sao phải gọi mạng: ảnh là dữ liệu CẤP TỪ chỉ tồn tại ở máy chủ (bảng
// `word_image`, do trình nhập Mazii nạp) và được trả kèm ngay trong phản hồi
// `/api/dict/lookup`. Không có đường nào khác — trình nhập Yomitan .zip và từ
// điển cá nhân đều không sinh ảnh, nên IndexedDB luôn trắng ảnh. Ta cố ý gọi
// thẳng nguồn máy chủ, KHÔNG theo lựa chọn nguồn tra của người dùng: cái đó nói
// "tra nghĩa ở đâu", còn ảnh thì chỉ có một chỗ để mà lấy.
//
// Chưa có endpoint lấy ảnh theo lô, nên mỗi từ là một lượt gọi. Đệm ở đây để
// một vòng chiếu lặp lại không gọi lại, và để trình chiếu nạp trước thẻ kế mà
// không sợ gọi trùng.

import { DictImage } from "@/shared/dictionary";
import { serverLookup } from "@/features/dictionary/data/serverDict";
import { ImageWord, pickImages, wordImageKey } from "../domain/imageMode";

/** Kết quả đã lấy được (kể cả kết quả rỗng — "từ này không có ảnh" cũng đáng nhớ). */
const cache = new Map<string, DictImage[]>();

/** Lượt gọi đang bay, để hai nơi cùng hỏi một từ chỉ tốn một request. */
const inflight = new Map<string, Promise<DictImage[]>>();

/**
 * Ảnh minh hoạ của một từ, rỗng khi từ điển máy chủ không có ảnh cho từ đó.
 * NÉM `DictionaryNetworkError` khi không gọi được máy chủ — trình chiếu phân
 * biệt "không có ảnh" với "mất mạng" để báo hai câu khác nhau (DESIGN §3.9).
 * Chỉ đệm kết quả thành công: lỗi mạng phải thử lại được ở vòng sau.
 */
export function fetchWordImages(word: ImageWord): Promise<DictImage[]> {
  const key = wordImageKey(word);
  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached);

  const pending = inflight.get(key);
  if (pending) return pending;

  const request = serverLookup(word.term, word.term_lang, word.native_lang)
    .then((hits) => {
      const images = pickImages(hits, word);
      cache.set(key, images);
      return images;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, request);
  return request;
}

/** Dọn đệm — chỉ dùng trong test. */
export function _resetWordImageCache(): void {
  cache.clear();
  inflight.clear();
}
