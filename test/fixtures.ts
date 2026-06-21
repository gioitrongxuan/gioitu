import { VocabEntry } from "@/shared/types";

/** Build a VocabEntry with sensible defaults, overridable per test. */
export function makeEntry(over: Partial<VocabEntry> = {}): VocabEntry {
  const now = over.created_at ?? 1_000_000;
  return {
    user_id: "u1",
    term: "test",
    term_lang: "en",
    native_lang: "vi",
    meaning: JSON.stringify(["nghĩa"]),
    is_custom: false,
    lookup_count: 1,
    last_lookup_at: now,
    status: "LEARNING",
    card_state: null,
    learning_step: 0,
    ease_factor: 2.5,
    reps: 0,
    lapses: 0,
    is_relearning: false,
    srs_interval: 0,
    next_review: null,
    deleted_at: null,
    created_at: now,
    updated_at: now,
    ...over,
  };
}
