// Lookup orchestration (SPEC 4.1, 4.2, 4.4 gating).
// Ties together: lookup_count increments (with debounce), entry creation,
// SRS card gating, and the relapse trigger — all as pure functions.

import { DEFAULT_SRS_CONFIG, LOOKUP_DEBOUNCE_MS, SRS_GATING_THRESHOLD, SrsConfig } from "./constants";
import { markKnown, newCardState, relapse } from "./srs";
import { VocabEntry } from "@/shared/types";

export interface LookupInput {
  user_id: string;
  term: string;
  term_lang: string;
  native_lang: string;
  meaning: string;
  /** Kana reading (for furigana). */
  reading?: string;
  /** Part-of-speech text (for tag chips). */
  pos?: string;
  /** Câu ví dụ, "câu :: bản dịch" — quy ước dùng chung với Từ điển cá nhân và bộ
   *  từ nhập. Đường tra cứu chưa truyền trường này; đường "đưa vào học từ bộ từ"
   *  thì có, vì câu ví dụ chính là mặt trước thẻ của các bộ Tango. */
  example?: string;
  is_custom?: boolean;
}

export interface LookupResult {
  entry: VocabEntry;
  events: {
    /** A new entry was created (first time this term was seen). */
    created: boolean;
    /** lookup_count was actually incremented (i.e. not debounced). */
    counted: boolean;
    /** An SRS card was created on this lookup (gating threshold reached). */
    cardCreated: boolean;
    /** A LEARNED word was relapsed by this lookup (SPEC 4.2). */
    relapsed: boolean;
  };
}

/**
 * Build a fresh entry for a term never looked up before. Pressing "+" commits
 * the word to the review queue immediately — the first add is itself the signal
 * of forgetting, so we skip the old "prove it forgettable twice" gating and give
 * it a card (status LEARNING, card_state NEW, due now) from the start.
 */
function createEntry(input: LookupInput, now: number, cfg: SrsConfig): VocabEntry {
  return {
    user_id: input.user_id,
    term: input.term,
    term_lang: input.term_lang,
    native_lang: input.native_lang,
    meaning: input.meaning,
    reading: input.reading,
    pos: input.pos,
    ...(input.example ? { example: input.example } : {}),
    is_custom: input.is_custom ?? false,
    lookup_count: 1,
    last_lookup_at: now,
    deleted_at: null,
    created_at: now,
    updated_at: now,
    ...newCardState(now, cfg),
  };
}

/**
 * Dựng thẻ mới cho một từ người dùng chủ động đưa vào học từ một **bộ từ nhập
 * ngoài** (`wordsets`).
 *
 * Là thẻ thật như mọi thẻ khác — cùng một vốn từ, cùng đường đồng bộ — nên tiến
 * độ theo người dùng qua mọi thiết bị. Khác đúng hai chỗ:
 *
 *  - `lookup_count: 0`, cùng lẽ với `newKnownEntry`: chưa có lần tra nào xảy ra
 *    thật, đếm khống thì Word Cloud và mọi thống kê "quên" đều sai theo.
 *  - `from_wordset` đóng dấu bộ nguồn, để Bản đồ từ lọc ra (xem `types.ts`).
 *
 * Thẻ vào thẳng hàng đợi (`newCardState`: NEW, đến hạn ngay) — người dùng đã tự
 * chọn đúng mẻ này để học, không việc gì bắt họ đợi thêm một nhịp nữa.
 */
export function newWordsetEntry(
  input: LookupInput,
  setId: string,
  now: number,
  cfg: SrsConfig = DEFAULT_SRS_CONFIG,
): VocabEntry {
  return { ...createEntry(input, now, cfg), lookup_count: 0, from_wordset: setId };
}

/**
 * Build a fresh entry the user asserts they already know outright — e.g. ticking
 * a kanji "đã biết" from the stats grid without ever looking it up. It is created
 * straight in the mature/LEARNED state (no queue time), and `lookup_count` stays
 * 0 to stay honest: no lookup — the signal of forgetting — actually happened.
 */
export function newKnownEntry(input: LookupInput, now: number, cfg: SrsConfig = DEFAULT_SRS_CONFIG): VocabEntry {
  return { ...createEntry(input, now, cfg), lookup_count: 0, ...markKnown(now, cfg), learned_at: now, updated_at: now };
}

/**
 * Process a confirmed lookup (the user pressed "+" on a shown result, or
 * followed an internal link). Returns the next entry state plus a set of events
 * the UI can surface as toasts / badges. Never mutates its input.
 */
export function registerLookup(
  existing: VocabEntry | undefined,
  input: LookupInput,
  now: number,
  cfg: SrsConfig = DEFAULT_SRS_CONFIG,
): LookupResult {
  // A previously *deleted* word is treated as never-seen: looking it up again
  // resurrects it as a fresh entry. createEntry stamps updated_at = now, past the
  // tombstone, so the resurrection wins the last-write-wins sync.
  if (existing && existing.deleted_at != null) existing = undefined;

  // --- First-ever lookup of this term: created AND carded straight away, so it
  // enters the review queue on the very first "+" (no gating). ---
  if (!existing) {
    const entry = createEntry(input, now, cfg);
    return { entry, events: { created: true, counted: true, cardCreated: true, relapsed: false } };
  }

  // --- Debounce: same term re-opened within the window does not re-count ---
  const debounced = now - existing.last_lookup_at < LOOKUP_DEBOUNCE_MS;
  if (debounced) {
    return {
      entry: existing,
      events: { created: false, counted: false, cardCreated: false, relapsed: false },
    };
  }

  const entry: VocabEntry = { ...existing };
  entry.lookup_count += 1;
  entry.last_lookup_at = now;
  entry.updated_at = now;
  // Thẻ sinh ra từ một bộ từ bị Bản đồ từ lọc bỏ vì chưa có lần tra nào. Vừa có
  // rồi: gỡ cờ để nó lên bản đồ như mọi từ khác. Chỉ gỡ ở nhánh ĐƯỢC ĐẾM — lần
  // mở lại trong cửa sổ debounce không phải một tín hiệu quên mới.
  delete entry.from_wordset;
  // Refresh meaning/custom flag if a richer/custom definition came through.
  if (input.meaning) entry.meaning = input.meaning;
  if (input.reading) entry.reading = input.reading;
  if (input.pos) entry.pos = input.pos;
  if (input.is_custom != null) entry.is_custom = input.is_custom;

  let relapsed = false;
  let cardCreated = false;

  // --- Relapse: touching a LEARNED word again (SPEC 4.2, Case 1 & Case 2) ---
  if (existing.status === "LEARNED") {
    Object.assign(entry, relapse(existing, now, cfg));
    relapsed = true;
  } else if (entry.card_state == null) {
    // --- Legacy heal: entries created before cards-on-first-add still lack a
    // card. Give them one on the next lookup so they rejoin the queue. ---
    if (entry.lookup_count >= SRS_GATING_THRESHOLD) {
      Object.assign(entry, newCardState(now, cfg));
      cardCreated = true;
    }
  }

  return { entry, events: { created: false, counted: true, cardCreated, relapsed } };
}
