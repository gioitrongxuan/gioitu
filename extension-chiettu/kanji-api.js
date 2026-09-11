// Gọi `/api/kanji` của Gioitu và nhớ kết quả — LOGIC THUẦN (fetch tiêm vào), nên
// test được dưới vitest. Không chạm chrome.*: phần lưu xuống đĩa do background
// truyền vào qua `persist`.
//
// Vì sao gọi thẳng API chứ không nhờ app tra hộ như extension "Thêm nhanh từ":
// `/api/kanji` là route CÔNG KHAI CHỈ-ĐỌC, không cần đăng nhập và không đụng
// IndexedDB của app — nên không có lý do gì phải mở một cửa sổ app cho mỗi lượt.
// Di chuột thì càng không: một cửa sổ mỗi lần rê chuột là chuyện không tưởng.
//
// Cache là chỗ đổi lấy tốc độ: dữ liệu cấu tạo chữ TĨNH (chỉ đổi khi admin nhập
// lại KANJIDIC), nên nhớ vô thời hạn, nhớ cả "bảng không có chữ này" (null) để
// chữ trống không bị hỏi lại mỗi lần rê chuột qua.

import { buildCards, familyCharsOf, partCharsOf } from "./kanji-cards.js";

/** Trần số chữ giữ trong bộ nhớ mỗi cặp ngôn ngữ; vượt thì dọn sạch (hiếm khi tới). */
const MAX_CACHED = 3000;

async function fetchEntries(fetchFn, base, pair, chars) {
  if (chars.length === 0) return { entries: [], error: null };
  const url = `${base}/api/kanji?chars=${encodeURIComponent(chars.join(""))}&src=${pair.src}&tgt=${pair.tgt}`;
  try {
    const res = await fetchFn(url);
    // 404 ở đây không phải "không có chữ này" mà là "không có route /api/kanji"
    // (deploy tĩnh) — cùng loại với mất mạng nên cũng tính là lỗi nguồn.
    if (!res.ok) return { entries: [], error: "network" };
    return { entries: await res.json(), error: null };
  } catch {
    return { entries: [], error: "network" };
  }
}

/**
 * `persist` (tuỳ chọn): { load(): Promise<obj>, save(obj): Promise } — bản sao
 * cache xuống đĩa để service worker bị ngủ dậy vẫn trả lời tức thì.
 */
export function createKanjiApi({ fetchFn = fetch, persist = null } = {}) {
  /** pairKey → Map(literal → entry | null). `null` = bảng kanji không có chữ ấy. */
  const cache = new Map();
  let loaded = persist == null;

  const pairKey = (pair) => `${pair.src}-${pair.tgt}`;

  function bucket(pair) {
    const key = pairKey(pair);
    let map = cache.get(key);
    if (!map) cache.set(key, (map = new Map()));
    if (map.size > MAX_CACHED) map.clear();
    return map;
  }

  async function restore() {
    if (loaded) return;
    loaded = true;
    try {
      const saved = (await persist.load()) ?? {};
      for (const [key, entries] of Object.entries(saved)) {
        cache.set(key, new Map(Object.entries(entries)));
      }
    } catch {
      /* cache hỏng thì bỏ qua — chỉ mất tốc độ, không mất đúng đắn */
    }
  }

  let saveTimer = 0;
  function scheduleSave() {
    if (!persist) return;
    clearTimeout(saveTimer);
    // Gom nhiều lượt tra liền nhau thành một lần ghi: rê chuột dọc một dòng chữ
    // Hán có thể sinh cả chục lượt trong vài giây.
    saveTimer = setTimeout(() => {
      const plain = {};
      for (const [key, map] of cache) plain[key] = Object.fromEntries(map);
      persist.save(plain).catch(() => {});
    }, 2000);
  }

  /** Bảo đảm mọi chữ trong `chars` đã có trong cache (chỉ hỏi phần còn thiếu). */
  async function ensure(base, pair, chars) {
    await restore();
    const map = bucket(pair);
    const missing = chars.filter((c) => !map.has(c));
    if (missing.length === 0) return { map, error: null, fetched: 0 };
    const { entries, error } = await fetchEntries(fetchFn, base, pair, missing);
    if (error) return { map, error, fetched: 0 };
    for (const entry of entries) map.set(entry.literal, entry);
    // Chữ hỏi rồi mà không có hàng nào: nhớ luôn là "không có", kẻo mỗi lần rê
    // chuột qua lại tốn một request.
    for (const c of missing) if (!map.has(c)) map.set(c, null);
    scheduleSave();
    return { map, error: null, fetched: entries.length };
  }

  return {
    /**
     * Thẻ chiết tự cho `chars`. Ba lượt hỏi vì lượt sau chỉ biết phải hỏi gì sau
     * khi có kết quả lượt trước (chữ con → họ chữ), nhưng `onQuick` được gọi
     * NGAY sau lượt đầu: thẻ hiện ra liền, phần chú thích dày thêm sau.
     * Lượt 2–3 hỏng chỉ làm chữ con trơ mặt chữ, không làm hỏng thẻ.
     */
    async cards(base, pair, chars, onQuick) {
      if (chars.length === 0) return { cards: [], error: null };
      const first = await ensure(base, pair, chars);
      if (first.error) return { cards: [], error: first.error };
      const map = first.map;
      const main = chars.map((c) => map.get(c)).filter(Boolean);
      if (main.length === 0) return { cards: [], error: null };

      onQuick?.(buildCards(chars, map));

      await ensure(base, pair, partCharsOf(main));
      await ensure(base, pair, familyCharsOf(main, map));
      return { cards: buildCards(chars, map), error: null };
    },

    /** Đã có sẵn trong cache chưa (dùng để biết có cần hiện "đang tra…" không). */
    async cached(base, pair, chars) {
      await restore();
      const map = bucket(pair);
      return chars.every((c) => map.has(c));
    },

    /** Đổi địa chỉ Gioitu hay nhập lại dữ liệu thì cache cũ không còn đáng tin. */
    clear() {
      cache.clear();
      scheduleSave();
    },
  };
}
