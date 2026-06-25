import { describe, it, expect } from "vitest";
import { registerLookup } from "@/features/review/domain/lookup";
import { LOOKUP_DEBOUNCE_MS, SRS_GATING_THRESHOLD } from "@/features/review/domain/constants";
import { makeEntry } from "./fixtures";

const NOW = 5_000_000;
const baseInput = {
  user_id: "u1",
  term: "test",
  term_lang: "en",
  native_lang: "vi",
  meaning: JSON.stringify(["nghĩa"]),
};

describe("first lookup", () => {
  it("creates an entry with count 1, on the cloud, but no SRS card (gating)", () => {
    const { entry, events } = registerLookup(undefined, baseInput, NOW);
    expect(events.created).toBe(true);
    expect(entry.lookup_count).toBe(1);
    expect(entry.status).toBe("LEARNING");
    expect(entry.card_state).toBeNull();
    expect(events.cardCreated).toBe(false);
  });
});

describe("debounce (SPEC 4.1)", () => {
  it("does NOT count a repeat within the debounce window", () => {
    const existing = makeEntry({ last_lookup_at: NOW - (LOOKUP_DEBOUNCE_MS - 500), lookup_count: 1 });
    const { entry, events } = registerLookup(existing, baseInput, NOW);
    expect(events.counted).toBe(false);
    expect(entry.lookup_count).toBe(1);
  });

  it("counts again after the debounce window", () => {
    const existing = makeEntry({ last_lookup_at: NOW - (LOOKUP_DEBOUNCE_MS + 1), lookup_count: 1 });
    const { entry, events } = registerLookup(existing, baseInput, NOW);
    expect(events.counted).toBe(true);
    expect(entry.lookup_count).toBe(2);
  });
});

describe("SRS gating threshold (constraint 2)", () => {
  it(`creates the card once lookup_count reaches ${SRS_GATING_THRESHOLD}`, () => {
    const existing = makeEntry({ last_lookup_at: NOW - 10_000, lookup_count: 1, card_state: null });
    const { entry, events } = registerLookup(existing, baseInput, NOW);
    expect(entry.lookup_count).toBe(2);
    expect(events.cardCreated).toBe(true);
    expect(entry.card_state).toBe("NEW");
  });
});

describe("empty meaning", () => {
  it("keeps the entry's existing definition when re-looked-up with no meaning", () => {
    const existing = makeEntry({
      lookup_count: 1,
      card_state: null,
      last_lookup_at: NOW - (LOOKUP_DEBOUNCE_MS + 1),
      meaning: JSON.stringify(["nghĩa cũ"]),
    });
    const { entry } = registerLookup(existing, { ...baseInput, meaning: "" }, NOW);
    expect(entry.meaning).toBe(JSON.stringify(["nghĩa cũ"]));
  });
});

describe("relapse trigger via lookup (SPEC 4.2)", () => {
  it("touching a LEARNED word again relapses it", () => {
    const learned = makeEntry({
      status: "LEARNED",
      card_state: "REVIEW",
      srs_interval: 60 * 24 * 60,
      lapses: 0,
      lookup_count: 8,
      last_lookup_at: NOW - 10_000,
    });
    const { entry, events } = registerLookup(learned, baseInput, NOW);
    expect(events.relapsed).toBe(true);
    expect(entry.status).toBe("RELAPSED");
    expect(entry.lapses).toBe(1);
    expect(entry.lookup_count).toBe(9);
    expect(entry.card_state).toBe("LEARNING");
  });
});

describe("resurrecting a deleted word by looking it up again", () => {
  it("treats a tombstoned entry as never-seen: fresh entry that wins LWW", () => {
    const tombstoned = makeEntry({
      deleted_at: NOW - 100_000,
      lookup_count: 9,
      card_state: "REVIEW",
      status: "LEARNED",
      updated_at: NOW - 100_000,
    });
    const { entry, events } = registerLookup(tombstoned, baseInput, NOW);
    expect(events.created).toBe(true);
    expect(entry.deleted_at).toBeNull();
    expect(entry.lookup_count).toBe(1); // fresh start, not 10
    expect(entry.card_state).toBeNull();
    expect(entry.updated_at).toBe(NOW); // past the tombstone → wins the sync
  });
});
