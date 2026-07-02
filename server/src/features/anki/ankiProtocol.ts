// The AnkiConnect protocol for the fake server (mounted at /api/yomitan-sync
// and /api/anki-sync — see ankiRoutes.ts). Clients talk to this endpoint
// exactly as if it were the AnkiConnect plugin; `handleAction` below is the
// pure dispatcher (I/O injected via AnkiDeps) and the constants are the fixed
// values a client expects during the handshake and field mapping.
//
// `AnkiReply` keeps success (`result`, the unwrapped value) and failure
// (`message`, sent as `{ error }`) explicit. It intentionally does NOT decide
// the wire format itself — ankiRoutes.ts serializes it two different ways,
// because the two real clients disagree: Yomitan's own AnkiConnect client
// reads the WHOLE response body as the result and never unwraps a `{ result }`
// envelope (verified empirically — see ankiRoutes.ts), while standards-
// compliant clients expect that envelope and additionally may reject a bare
// JSON scalar at the top level. A success reply must never carry an `error`
// key regardless of format (Yomitan reads `error: null` as a failure).

import type { NoteFields, SaveNoteOptions } from "./ankiNote.js";

export const ANKI_VERSION = 6;

// A single virtual deck + model exposed to Yomitan. The user maps Yomitan's
// fields onto FIELD_NAMES in the Anki settings; addNote then reads the note's
// fields by these exact keys.
export const DECK_NAME = "Website Database";
export const MODEL_NAME = "Website Database";
// Fields the user maps Yomitan markers onto: {expression} {reading} {glossary}
// {sentence} {part-of-speech}. addNote reads the note's fields by these keys.
export const FIELD_NAMES = ["Word", "Reading", "Glossary", "Sentence", "PartOfSpeech"] as const;

// Actions we implement, advertised via apiReflect so Yomitan only ever calls
// these (anything else is answered with an "unsupported action" error).
export const SUPPORTED_ACTIONS = [
  "addNote",
  "deckNames",
  "modelNames",
  "modelFieldNames",
  "version",
  "requestPermission",
  "canAddNotesWithErrorDetail",
  "canAddNotes",
] as const;

/**
 * The outcome of an action. `result` carries the unwrapped value to send back;
 * `error` carries a message that goes out as `{ error }`. Keeping them separate
 * (instead of just a value) is what guarantees a success reply never grows an
 * `error` key — the one thing the Yomitan client cannot tolerate.
 */
export type AnkiReply =
  | { kind: "result"; value: unknown }
  | { kind: "error"; message: string };

const ok = (value: unknown): AnkiReply => ({ kind: "result", value });
const fail = (message: string): AnkiReply => ({ kind: "error", message });

/** Side effects the dispatcher needs, injected so it stays pure and testable. */
export interface AnkiDeps {
  /** Resolve a gioitu user id from Yomitan's configured API key, or null. */
  resolveUser(key: unknown): Promise<string | null>;
  /** Persist one note and return its numeric note id. */
  saveNote(userId: string, fields: NoteFields, opts: SaveNoteOptions): Promise<number>;
}

/**
 * Dispatch one AnkiConnect request to its reply. Metadata actions are public;
 * only `addNote` needs a valid key (so the settings UI can populate before the
 * user pastes their token). Unknown actions get the standard "unsupported
 * action" error.
 */
export async function handleAction(
  action: string,
  params: Record<string, unknown>,
  key: unknown,
  opts: SaveNoteOptions,
  deps: AnkiDeps,
): Promise<AnkiReply> {
  const notes = Array.isArray(params.notes) ? params.notes : [];

  switch (action) {
    // --- Handshake ---
    case "version":
      return ok(ANKI_VERSION);
    case "requestPermission":
      return ok({ permission: "granted" });
    case "apiReflect":
      return ok({ scopes: ["actions"], actions: [...SUPPORTED_ACTIONS] });

    // --- Deck / model / field metadata for the settings UI ---
    case "deckNames":
      return ok([DECK_NAME]);
    case "modelNames":
      return ok([MODEL_NAME]);
    case "modelFieldNames":
      return ok([...FIELD_NAMES]);

    // --- "Can I add these?" — always yes (no duplicate check) ---
    case "canAddNotes":
      return ok(notes.map(() => true));
    case "canAddNotesWithErrorDetail":
      return ok(notes.map(() => ({ canAdd: true, error: null })));

    // --- The "+" was pressed: save the word ---
    case "addNote": {
      const userId = await deps.resolveUser(key);
      if (!userId) {
        return fail("Cần API key hợp lệ (lấy trong mục \"Kết nối Yomitan\" trên gioitu) ở cấu hình Yomitan");
      }
      const note = (params.note ?? {}) as { fields?: NoteFields };
      try {
        return ok(await deps.saveNote(userId, note.fields ?? {}, opts));
      } catch (err) {
        return fail((err as Error).message || "Lưu thất bại");
      }
    }

    default:
      return fail("unsupported action");
  }
}
