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

# Optional backend (fallback dictionary + reverse FTS + cloud sync)
npm run server        # http://localhost:8787

# Tests / typecheck / production build
npm test
npm run typecheck
npm run build
```

The backend is required for **accounts + cloud sync** (email/password → JWT).
Once signed in, the app caches everything in IndexedDB and keeps working if the
backend goes offline — sync resumes when it is reachable again. Dictionary
look-ups still fall back to IndexedDB / the server's default dictionary.

## Authentication (email + password)

Per SPEC §2.C, learning data is tied to an account so it is consistent across
devices. The app gates behind a login/register screen:

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
  data/
    db.ts            ← IndexedDB schema: terms / reverse_tokens / user_data
    yomitan.ts       ← Yomitan .zip import + forward & reverse index (§2.A/2.B)
    search.ts        ← Search Router: IndexedDB first, server fallback (§2.A)
    api.ts           ← backend client (best-effort, offline-tolerant)
    repository.ts    ← user-data cache + last-write-wins sync (§2.C)
  ui/                ← React components (SearchBar, WordCloud, FilterBar,
                       ReviewSession, DetailPanel, ReverseResults, …)
server/              ← optional Express + SQLite (FTS5) backend
test/                ← Vitest suites covering the SPEC's logic constraints
```

### Search Router (SPEC 2.A)

1. **Client-side (IndexedDB)** — fastest. Import a Yomitan `.zip`; the frontend
   unzips and stores it (forward `terms` + `reverse_tokens` stores).
2. **Server-side fallback** — if IndexedDB has no dictionary, the backend's
   default dictionary is queried over `/api`.

### Reverse index (SPEC 2.B)

Yomitan is forward-only (`term → meaning`). To support Case 2 (native → target)
we build an auxiliary index:

- **Client:** on import, the meaning text is tokenized and each native token is
  mapped to the list of target terms (`reverse_tokens` store). Reverse look-up
  intersects/ranks terms by matched tokens.
- **Server:** SQLite **FTS5** over the `meaning` column.

## How the SPEC maps to code (§6 constraints)

| # | Constraint | Where |
|---|------------|-------|
| 1 | `lookup_count` increments on confirm only (not per keystroke), with a 2s debounce | `domain/lookup.ts`, `constants.LOOKUP_DEBOUNCE_MS` |
| 2 | Word Cloud on first look-up; SRS card only at `lookup_count ≥ 2` **or** via `[+]` | `domain/lookup.ts` gating, `constants.SRS_GATING_THRESHOLD` |
| 3 | Tag colour = log-normalized `lookup_count`, independent of SRS | `domain/wordcloud.computeShade` |
| 4 | Visibility depends on `status`: `LEARNED` hidden, `LEARNING`/`RELAPSED` shown | `domain/wordcloud.isVisibleOnCloud` |
| 5 | `RELAPSED` = `LEARNING` logic + warning badge | `domain/srs.ts`, `ui/WordCloud.tsx` |
| 6 | Relapse triggers when re-touching a `LEARNED` word in **both** Case 1 & Case 2; resets like `Again` | `domain/lookup.ts` + `srs.relapse` |
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

- **Selecting a tag on the Word Cloud opens a read-only detail and does NOT
  count as a look-up.** Browsing your own map shouldn't penalize you; only
  dictionary look-ups (Enter / suggestion pick / detail of a searched term /
  `[+]`) increment `lookup_count`. This is a deliberate refinement of SPEC §4.1.
- **`is_relearning`** is an implementation field (not in the SPEC table) needed
  to choose relearning vs learning steps faithfully.
- **Time-decay** colouring (SPEC §4.3, optional) is implemented in
  `effectiveCount` but **off by default** in v1.
- Every domain rule is covered by tests in `test/` (35 tests).

## Tech

TypeScript · React 18 · Vite · Vitest · idb (IndexedDB) · JSZip ·
Express + better-sqlite3 (FTS5) for the optional backend.
