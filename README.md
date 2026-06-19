# Gioitu — Personalized Dictionary + SRS

A webapp that turns passive dictionary look-ups into an active, measured
review habit. It combines a **Word Cloud** that visualizes how often you forget
a word with a **Spaced Repetition System (SRS)** modeled on Anki/SM‑2.

> Core philosophy: *a look-up is a signal of forgetting.* A word must be looked
> up **again (≥ 2×)** before it is considered "worth learning" and enters the
> review queue. This keeps the SRS queue clean and focused.

Implements the v2 SPEC (PRD), including all nine logic constraints in §6.

## Quick start

```bash
npm install

# Frontend (Vite dev server on :5173, proxies /api -> :8787)
npm run dev

# Optional backend (accounts + fallback dictionary + cloud sync).
# Needs a PostgreSQL database — set DATABASE_URL (see .env.example).
# e.g. createdb gioitu && export DATABASE_URL=postgres://localhost:5432/gioitu
npm run server        # http://localhost:8787 (creates the schema + seeds on boot)

# Tests / typecheck / production build
npm test
npm run typecheck
npm run build
```

The backend is required for **accounts + cloud sync** (email/password → JWT).
Once signed in, the app caches everything in IndexedDB and keeps working if the
backend goes offline — sync resumes when it is reachable again. Dictionary
look-ups still fall back to IndexedDB / the server's default dictionary.

## Guest mode + Authentication (email + password)

The app is **fully usable without an account**. If you are not signed in you run
as a *guest*: look-ups, the Word Cloud, and SRS reviews all work and persist
locally in IndexedDB (keyed under the `__guest__` user id). Signing in is
**optional** and only adds cross-device cloud sync.

- **Guest** (`GUEST_USER_ID` in `src/data/auth.ts`): no auth token, so sync is a
  no-op and data never leaves the device. The header shows *Khách* with an
  *Đăng nhập* button that opens the login/register screen as a dismissible modal.
- **First sign-in migrates guest progress**: `reassignEntries()`
  (`src/data/repository.ts`) moves any `__guest__` entries onto the new account
  (last-write-wins per term) so nothing learned while trying the app is lost.

Per SPEC §2.C, learning data is tied to an account so it is consistent across
devices once you sign in:

- **Backend** (`server/src/auth.ts`, zero external deps): passwords hashed with
  `scrypt` + per-user random salt; sessions are **HS256 JWTs** signed with
  `GIOITU_JWT_SECRET`. `POST /api/auth/register`, `POST /api/auth/login`,
  `GET /api/auth/me`.
- **Sync is protected**: `/api/sync` requires `Authorization: Bearer <token>`
  and derives `user_id` from the token — a client-supplied `user_id` is ignored
  (ownership cannot be spoofed).
- **Frontend** (`src/data/auth.ts`, `src/ui/AuthScreen.tsx`): the JWT + user are
  cached in `localStorage`; the bearer token is attached to all sync calls.

> Set a strong `GIOITU_JWT_SECRET` in production (see `.env.example`).

## Architecture

Dual-source dictionary, learning data separated from dictionary data (SPEC §2).

```
src/
  domain/            ← pure, fully unit-tested business logic (no I/O)
    types.ts         ← VocabEntry data model (SPEC §5)
    constants.ts     ← SM-2 defaults, gating threshold, debounce window
    srs.ts           ← SM-2 engine: gradeCard / relapse / isDue (SPEC §4.4)
    wordcloud.ts     ← log-normalized shade, visibility, time-decay (SPEC §4.3)
    lookup.ts        ← look-up counting, gating, relapse orchestration (§4.1/4.2)
    languages.ts     ← the 4 language-pair dictionaries (ja↔vi, en↔vi)
  data/
    db.ts            ← IndexedDB schema: terms (per pair) / user_data
    yomitan.ts       ← client-side Yomitan .zip import (forward, per-pair) (§2.A)
    search.ts        ← Search Router: IndexedDB first, server fallback (§2.A)
    api.ts           ← backend client (best-effort, offline-tolerant)
    dictAdmin.ts     ← server dictionary-management client (import/list/edit)
    repository.ts    ← user-data cache + last-write-wins sync (§2.C)
  ui/                ← React components (SearchBar, WordCloud, FilterBar,
                       ReviewSession, DetailPanel, AuthScreen,
                       DictionaryManager, …)
server/              ← optional Express + PostgreSQL backend (auth + dict + sync)
  src/yomitan.ts     ← server-side Yomitan .zip parser (pure, unit-tested)
test/                ← Vitest suites covering the SPEC's logic constraints
```

### Dictionaries & Search Router (SPEC 2.A)

There are **four forward dictionaries**, one per language pair, chosen from the
search bar: **Nhật → Việt**, **Việt → Nhật**, **Anh → Việt**, **Việt → Anh**
(`src/domain/languages.ts`). Each look-up is a forward `term → meaning` query
scoped to the selected pair `(term_lang, native_lang)` — there is no separate
reverse-index mode; "Việt → Anh" is simply a `vi → en` dictionary.

1. **Client-side (IndexedDB)** — fastest. Import a Yomitan `.zip` (tagged with
   the selected pair) into the `terms` store, keyed `[term_lang, native_lang, term]`.
2. **Server-side fallback** — if IndexedDB has no dictionary for that pair, the
   backend's default dictionary is queried over `/api` (`?src=&tgt=`).

### Server-side dictionary management (auth)

Signed-in users can manage the **shared server dictionary** from the *Quản lý
từ điển* screen (`src/ui/DictionaryManager.tsx`). It talks to auth-protected
endpoints (`src/data/dictAdmin.ts` → `server/src/index.ts`):

| Method & path | Purpose |
|---|---|
| `POST /api/dict/import` | Upload one Yomitan `.zip` (raw body, `Content-Type: application/zip`); parsed by `server/src/yomitan.ts`, bulk-inserted in chunks. Language pair is read from `index.json` or overridden via `?src=&tgt=`. |
| `GET /api/dict/dictionaries` | List imported dictionaries with live term counts. |
| `DELETE /api/dict/dictionaries/:id` | Remove a dictionary and all of its terms. |
| `GET /api/dict/terms` | Browse / prefix-search terms in a pair (paginated). |
| `PUT /api/dict/term` | Add a new term or edit an existing term's meanings. |
| `DELETE /api/dict/term` | Delete a single term. |

Imported terms are tagged with a `dict_id` (FK to `dictionaries`, `ON DELETE
SET NULL`); seed and manually-added terms have `dict_id = NULL` so they survive
when an imported dictionary is deleted. The screen lets you import several zips
at once, see/delete dictionaries, and add or edit meanings. Read endpoints
(`/api/dict/lookup`, `/api/dict/suggest`) stay public.

## How the SPEC maps to code (§6 constraints)

| # | Constraint | Where |
|---|------------|-------|
| 1 | `lookup_count` increments on confirm only (not per keystroke), with a 2s debounce | `domain/lookup.ts`, `constants.LOOKUP_DEBOUNCE_MS` |
| 2 | Word Cloud on first look-up; SRS card only at `lookup_count ≥ 2` (the `manualAdd` bypass remains in the domain layer) | `domain/lookup.ts` gating, `constants.SRS_GATING_THRESHOLD` |
| 3 | Tag colour = log-normalized `lookup_count`, independent of SRS | `domain/wordcloud.computeShade` |
| 4 | Visibility depends on `status`: `LEARNED` hidden, `LEARNING`/`RELAPSED` shown | `domain/wordcloud.isVisibleOnCloud` |
| 5 | `RELAPSED` = `LEARNING` logic + warning badge | `domain/srs.ts`, `ui/WordCloud.tsx` |
| 6 | Relapse triggers when re-looking-up a `LEARNED` word; resets like `Again` | `domain/lookup.ts` + `srs.relapse` |
| 7 | Graduate `→ LEARNED` by threshold `srs_interval ≥ 21 days`, not by a button | `domain/srs.gradeCard` |
| 8 | `ease_factor` clamped `≥ 1.3` | `domain/srs.clampEase` |
| 9 | Cloud DB is source of truth (per authenticated account); IndexedDB caches; last-write-wins by `updated_at` | `data/repository.ts`, `server/src/index.ts` |

### SM-2 grading (SPEC 4.4)

`gradeCard(entry, grade, now)` is pure and implements the full grading table
(Again/Hard/Good/Easy across learning, relearning and review phases), EF
adjustments with the 1.3 floor, learning-step progression, graduation to REVIEW,
and threshold-based promotion to `LEARNED`. Intervals are stored in **minutes**
(SPEC §5) so learning steps (1, 10) and review intervals (days × 1440) share a
unit; the UI converts to friendly units.

## Design decisions / notes

- **Four explicit dictionaries instead of a generic forward/reverse toggle.**
  The SPEC's "Case 2 (native → target)" reverse-index machinery was dropped in
  favour of four concrete forward dictionaries (ja↔vi, en↔vi). Each direction is
  just its own dictionary, which is simpler to reason about and to populate.
- **Selecting a tag on the Word Cloud opens a read-only detail and does NOT
  count as a look-up.** Browsing your own map shouldn't penalize you; only
  dictionary look-ups (Enter / suggestion pick / detail of a searched term)
  increment `lookup_count`. This is a deliberate refinement of SPEC §4.1.
- **`is_relearning`** is an implementation field (not in the SPEC table) needed
  to choose relearning vs learning steps faithfully.
- **Time-decay** colouring (SPEC §4.3, optional) is implemented in
  `effectiveCount` but **off by default** in v1.
- Every domain rule is covered by tests in `test/` (42 tests).

## Tech

TypeScript · React 18 · Vite · Vitest · idb (IndexedDB) · JSZip ·
Express + PostgreSQL (node-postgres / `pg`) for the optional backend (auth + dict + sync).
