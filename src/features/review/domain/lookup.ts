// Lookup orchestration (SPEC 4.1, 4.2, 4.4 gating).
// Ties together: lookup_count increments (with debounce), entry creation,
// SRS card gating, and the relapse trigger — all as pure functions.

import { DEFAULT_SRS_CONFIG, LOOKUP_DEBOUNCE_MS, SRS_GATING_THRESHOLD, SrsConfig } from "./constants";
import { newCardState, relapse } from "./srs";
import { VocabEntry } from "@/shared/types";

export interface LookupInput {
  user_id: string;
  term: string;
  term_lang: string;
  native_lang: string;
  meaning: string;
  is_custom?: boolean;
  /**
   * True when the lookup originates from the user pressing `[+]` (Case 2).
   * A manual add asserts intent to learn → an SRS card is created immediately,
   * bypassing the lookup_count ≥ 2 gate (SPEC 4.4).
   */
  manualAdd?: boolean;
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

/** Build a fresh entry for a term never looked up before. */
function createEntry(input: LookupInput, now: number): VocabEntry {
  return {
    user_id: input.user_id,
    term: input.term,
    term_lang: input.term_lang,
    native_lang: input.native_lang,
    meaning: input.meaning,
    is_custom: input.is_custom ?? false,
    lookup_count: 1,
    last_lookup_at: now,
    status: "LEARNING",
    card_state: null,
    learning_step: 0,
    ease_factor: DEFAULT_SRS_CONFIG.initialEaseFactor,
    reps: 0,
    lapses: 0,
    is_relearning: false,
    srs_interval: 0,
    next_review: null,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Process a confirmed lookup (Enter / suggestion pick / detail shown / `[+]`).
 * Returns the next entry state plus a set of events the UI can surface as
 * toasts / badges. Never mutates its input.
 */
export function registerLookup(
  existing: VocabEntry | undefined,
  input: LookupInput,
  now: number,
  cfg: SrsConfig = DEFAULT_SRS_CONFIG,
): LookupResult {
  // --- First-ever lookup of this term ---
  if (!existing) {
    const entry = createEntry(input, now);
    let cardCreated = false;
    // Manual [+] asserts intent → create the card right away (SPEC 4.4 gating).
    if (input.manualAdd) {
      Object.assign(entry, newCardState(now, cfg));
      cardCreated = true;
    }
    return { entry, events: { created: true, counted: true, cardCreated, relapsed: false } };
  }

  // --- Debounce: same term re-opened within the window does not re-count ---
  const debounced = now - existing.last_lookup_at < LOOKUP_DEBOUNCE_MS;
  if (debounced && !input.manualAdd) {
    return {
      entry: existing,
      events: { created: false, counted: false, cardCreated: false, relapsed: false },
    };
  }

  const entry: VocabEntry = { ...existing };
  entry.lookup_count += 1;
  entry.last_lookup_at = now;
  entry.updated_at = now;
  // Refresh meaning/custom flag if a richer/custom definition came through.
  if (input.meaning) entry.meaning = input.meaning;
  if (input.is_custom != null) entry.is_custom = input.is_custom;

  let relapsed = false;
  let cardCreated = false;

  // --- Relapse: touching a LEARNED word again (SPEC 4.2, Case 1 & Case 2) ---
  if (existing.status === "LEARNED") {
    Object.assign(entry, relapse(existing, now, cfg));
    relapsed = true;
  } else if (entry.card_state == null) {
    // --- Gating: create the SRS card once it has proven "forgettable" ---
    if (entry.lookup_count >= SRS_GATING_THRESHOLD || input.manualAdd) {
      Object.assign(entry, newCardState(now, cfg));
      cardCreated = true;
    }
  }

  return { entry, events: { created: false, counted: true, cardCreated, relapsed } };
}
