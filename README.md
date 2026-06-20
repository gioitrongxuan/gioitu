# Gioitu — Personalized Dictionary + SRS

A webapp that turns passive dictionary look-ups into an active, measured
review habit. It combines a **Word Cloud** that visualizes how often you forget
a word with a **Spaced Repetition System (SRS)** modeled on Anki/SM‑2.

> Core philosophy: *a look-up is a signal of forgetting.* A word must be looked
> up **again (≥ 2×)** before it is considered "worth learning" and enters the
> review queue. This keeps the SRS queue clean and focused.

Implements the v2 SPEC (PRD), including all nine logic constraints in §6.

## Quick start (Docker — everything in one command)

The simplest way to run the full stack (PostgreSQL + backend + built
frontend). No local Node or Postgres needed — just Docker:

```bash
docker compose up --build
# → open http://localhost:8787   (the app serves both the API and the UI)
```

`docker compose` starts Postgres, waits until it is healthy, then runs the
backend, which creates the schema, seeds the demo dictionary, and serves the
built frontend on the same origin (so no dev proxy is involved). Dictionary
data persists in the `pgdata` named volume. Set a real secret with
`GIOITU_JWT_SECRET=... docker compose up --build` in any deployment.

## Quick start (local dev, with hot reload)

```bash
npm install

# Frontend (Vite dev server on :5173, proxies /api -> :8787)
npm run dev

# Optional backend (accounts + fallback dictionary + cloud sync).
# Needs a PostgreSQL database — set DATABASE_URL (see .env.example).
# e.g. createdb gioitu && export DATABASE_URL=postgres://localhost:5432/gioitu
npm run server        # http://localhost:8787 (creates the schema + seeds on boot)

# …or start just Postgres in Docker and run Node locally:
#   docker compose up -d db
#   DATABASE_URL=postgres://gioitu:gioitu@localhost:5432/gioitu npm run server

# Tests / typecheck / production build
npm test
npm run typecheck
npm run build
```

In production the backend also serves the built `dist/` (single origin); in dev
you run Vite separately and it proxies `/api` to the backend.

## Quick start (Docker dev — live reload, no rebuild)

Want the Docker convenience but without rebuilding the image on every edit? Use
the dev compose, which **bind-mounts the repo** into the containers:

```bash
docker compose -f docker-compose.dev.yml up
# → open http://localhost:5173   (Vite dev server with hot reload)
```

It starts three services: Postgres, the backend (`tsx watch` — restarts on
`server/` changes), and the Vite dev server (HMR for `src/` changes). Editing
code updates the app live — **no `--build` needed**. `node_modules` lives in a
per-service named volume (so the host never clobbers the container's install);
deps install on first start and are reused — run
`docker compose -f docker-compose.dev.yml down -v` to force a reinstall after
changing dependencies. Vite proxies `/api` to the `api` service via
`VITE_PROXY_TARGET` and watches files with polling (`CHOKIDAR_USEPOLLING`) so
changes are seen across the bind mount.

> Use **either** `docker-compose.yml` (production: build `dist/`, single origin
> on `:8787`) **or** `docker-compose.dev.yml` (live reload on `:5173`), not both
> at once — they share Postgres and ports.

The backend is required for **accounts + cloud sync** (email/password → JWT).
Once signed in, the app caches everything in IndexedDB and keeps working if the
backend goes offline — sync resumes when it is reachable again. Dictionary
look-ups still fall back to IndexedDB / the server's default dictionary.

## Guest mode + Authentication (email + password)

The app is **fully usable without an account**. If you are not signed in you run
as a *guest*: look-ups, the Word Cloud, and SRS reviews all work and persist
locally in IndexedDB (keyed under the `__guest__` user id). Signing in is
**optional** and only adds cross-device cloud sync.

- **Guest** (`GUEST_USER_ID` in `src/features/auth/data/auth.ts`): no auth token, so sync is a
  no-op and data never leaves the device. The header shows *Khách* with an
  *Đăng nhập* button that opens the login/register screen as a dismissible modal.
- **First sign-in migrates guest progress**: `reassignEntries()`
  (`src/features/review/data/repository.ts`) moves any `__guest__` entries onto the new account
  (last-write-wins per term) so nothing learned while trying the app is lost.

Per SPEC §2.C, learning data is tied to an account so it is consistent across
devices once you sign in:

- **Backend** (`server/src/features/auth/auth.ts`, zero external deps): passwords hashed with
  `scrypt` + per-user random salt; sessions are **HS256 JWTs** signed with
  `GIOITU_JWT_SECRET`. `POST /api/auth/register`, `POST /api/auth/login`,
  `GET /api/auth/me`.
- **Sync is protected**: `/api/sync` requires `Authorization: Bearer <token>`
  and derives `user_id` from the token — a client-supplied `user_id` is ignored
  (ownership cannot be spoofed).
- **Frontend** (`src/features/auth/data/auth.ts`, `src/features/auth/ui/AuthScreen.tsx`): the JWT + user are
  cached in `localStorage`; the bearer token is attached to all sync calls.

> Set a strong `GIOITU_JWT_SECRET` in production (see `.env.example`).

## Architecture

Dual-source dictionary, learning data separated from dictionary data (SPEC §2).

The frontend is organized **by feature** (vertical slices) over a small shared
kernel; the backend mirrors the same split. Imports use path aliases — `@/*` →
`src`, `@server/*` → `server/src` — for cross-feature/shared references, while
imports within a feature stay relative.

```
src/
  app/                 ← composition root (depends on features + shared)
    App.tsx            ← wires auth + store + main screen (thin shell)
    main.tsx           ← React entry
    useLookup.ts       ← detail-panel view state + look-up handlers (§4.1)
  shared/              ← cross-cutting kernel, no feature deps
    types.ts           ← VocabEntry core data model (SPEC §5)
    db.ts              ← IndexedDB schema: terms / dictionaries / user_data
    structured-content.ts ← Yomitan glossary model + text flattener + furigana
    languages.ts       ← the 4 language-pair dictionaries (ja↔vi, en↔vi)
    ui/                ← shared UI primitives (Toasts, duration format)
  features/
    dictionary/        ← look-up, deinflection, import, management
      domain/deinflect.ts            ← Yomitan-style deinflection (JA + light EN)
      data/                          ← yomitan, search router, serverDict, dictAdmin
      ui/                            ← SearchBar, DetailPanel, StructuredContent,
                                       DictionaryImport, DictionaryManager/ (split)
    review/            ← the SRS / Word-Cloud learning loop (pure, well-tested)
      domain/          ← constants, srs, lookup, wordcloud (operate on VocabEntry)
      data/            ← repository (cache + LWW sync), syncApi (cloud client)
      state/store.ts   ← React hook tying domain logic to persistence
      ui/              ← WordCloud, FilterBar, ReviewSession
    auth/              ← data/auth (session) · ui/AuthScreen · useAuth
server/                ← optional Express + PostgreSQL backend (auth + dict + sync)
  src/index.ts         ← bootstrap: init schema, seed, listen
  src/app.ts           ← express assembly (middleware + feature routers + static)
  src/core/            ← db, seed, middleware (asyncHandler, requireAuth)
  src/features/        ← auth/ · dictionary/ · sync/ — each a router + SQL store
test/                  ← Vitest suites covering the SPEC's logic constraints
```

### Dictionaries & Search Router (SPEC 2.A)

There are **four forward dictionaries**, one per language pair, chosen from the
search bar: **Nhật → Việt**, **Việt → Nhật**, **Anh → Việt**, **Việt → Anh**
(`src/shared/languages.ts`). Each look-up is a forward `term → meaning` query
scoped to the selected pair `(term_lang, native_lang)` — there is no separate
reverse-index mode; "Việt → Anh" is simply a `vi → en` dictionary.

1. **Client-side (IndexedDB)** — fastest. Import a Yomitan `.zip` (tagged with
   the selected pair) into the `terms` store, keyed `[term_lang, native_lang, term]`.
2. **Server-side fallback** — if IndexedDB has no dictionary for that pair, the
   backend's default dictionary is queried over `/api` (`?src=&tgt=`).

### Yomitan-style import, look-up & display

The client path mirrors how **Yomitan** works:

- **Import from a `.zip` *or* a URL.** `src/features/dictionary/data/yomitan.ts` parses the Yomitan
  v3 archive (`index.json`, `term_bank_*.json`) and **preserves structured
  content** (rich glossaries) instead of flattening it, keeps part-of-speech
  **tags** and word-type **rules**, and **merges multiple senses** of a term.
  `importYomitanUrl(url)` downloads the archive first (CORS permitting). Each
  import is recorded in a local **dictionary registry** (`dictionaries` store)
  so installed dictionaries can be listed and removed — open the *Từ điển*
  menu in the header. The optional backend can also import a URL server-side
  (`POST /api/dict/import-url`).
- **Deinflection on look-up.** `src/features/dictionary/domain/deinflect.ts` walks an inflected
  query back to its dictionary form, recording the chain of reasons
  (`食べさせられました → 食べる`: polite → causative). It ports the classic
  Yomichan deinflection algorithm with a curated, unit-tested Japanese rule set
  (て / た / ます / negative / potential / passive / causative / volitional / ば /
  たい / progressive / …) gated by word-type flags, plus a light English
  deinflector (plurals, `-ed`, `-ing`, comparatives). `findTerms` returns the
  ranked, grammatically-valid matches; the tracked SRS term is the **lemma**,
  not the inflected surface.
- **Rich definition view.** `DetailPanel` + `StructuredContent.tsx` render the
  headword with **furigana** ruby, the **inflection-reason** chips, the term /
  part-of-speech **tags**, and the **structured-content** glossary (lists,
  emphasis, tables, internal `?query=` links that re-trigger a look-up). Images
  in dictionaries degrade gracefully to their alt text.

> Architectural split: the **client/IndexedDB** path (primary, offline-first)
> gets the full Yomitan treatment above. The optional **server** dictionary
> stays plain-text (its management screen edits glosses as text); client-side
> deinflection is still applied when falling back to it.

### Server-side dictionary management (auth)

Signed-in users can manage the **shared server dictionary** from the *Quản lý
từ điển* screen (`src/features/dictionary/ui/DictionaryManager/`). It talks to auth-protected
endpoints (`src/features/dictionary/data/dictAdmin.ts` → `server/src/features/dictionary/dictRoutes.ts`):

| Method & path | Purpose |
|---|---|
| `POST /api/dict/import` | Upload one Yomitan `.zip` (raw body, `Content-Type: application/zip`); parsed by `server/src/features/dictionary/yomitan.ts`, bulk-inserted in chunks. Language pair is read from `index.json` or overridden via `?src=&tgt=`. |
| `POST /api/dict/import-url` | Download a Yomitan `.zip` from a URL server-side and import it. Body: `{ url, src?, tgt? }`. |
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
| 1 | `lookup_count` increments on confirm only (not per keystroke), with a 2s debounce | `review/domain/lookup.ts`, `constants.LOOKUP_DEBOUNCE_MS` |
| 2 | Word Cloud on first look-up; SRS card only at `lookup_count ≥ 2` (the `manualAdd` bypass remains in the domain layer) | `review/domain/lookup.ts` gating, `constants.SRS_GATING_THRESHOLD` |
| 3 | Tag colour = log-normalized `lookup_count`, independent of SRS | `review/domain/wordcloud.computeShade` |
| 4 | Visibility depends on `status`: `LEARNED` hidden, `LEARNING`/`RELAPSED` shown | `review/domain/wordcloud.isVisibleOnCloud` |
| 5 | `RELAPSED` = `LEARNING` logic + warning badge | `review/domain/srs.ts`, `review/ui/WordCloud.tsx` |
| 6 | Relapse triggers when re-looking-up a `LEARNED` word; resets like `Again` | `review/domain/lookup.ts` + `srs.relapse` |
| 7 | Graduate `→ LEARNED` by threshold `srs_interval ≥ 21 days`, not by a button | `review/domain/srs.gradeCard` |
| 8 | `ease_factor` clamped `≥ 1.3` | `review/domain/srs.clampEase` |
| 9 | Cloud DB is source of truth (per authenticated account); IndexedDB caches; last-write-wins by `updated_at` | `review/data/repository.ts`, `server/src/features/sync/syncStore.ts` |

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
- Every domain rule is covered by tests in `test/` (83 tests), including the
  deinflection rule set, furigana distribution, structured-content flattening,
  and rich import (zip + mocked URL) + deinflecting look-up.

## Tech

TypeScript · React 18 · Vite · Vitest · idb (IndexedDB) · JSZip ·
Express + PostgreSQL (node-postgres / `pg`) for the optional backend (auth + dict + sync).
