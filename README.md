# Gioitu — Personalized Dictionary + SRS

A webapp that turns passive dictionary look-ups into an active, measured
review habit. It combines a **Word Cloud** that visualizes how often you forget
a word with a **Spaced Repetition System (SRS)** modeled on Anki/SM‑2.

> Core philosophy: *a look-up is a signal of forgetting.*
>
> **Current behavior (07/2026):** a plain look-up is *not* recorded on its
> own — the user confirms intent with the **`＋` button**, which creates the
> entry *and* its SRS card immediately (no ≥ 2× gating; see
> `review/domain/lookup.ts`). The original SPEC gating ("looked up again
> (≥ 2×) before entering the review queue") is currently **not** what the code
> does; whether to restore passive lookup counting is an open decision — see
> `docs/BACKLOG.md`.

Implements the v2 SPEC (PRD); constraint deviations are flagged in §6 below.

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

# Optional backend (accounts + shared server dictionary + cloud sync).
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

The backend is required for **accounts + cloud sync** (Google sign-in → JWT).
Once signed in, the app caches everything in IndexedDB and keeps working if the
backend goes offline — sync resumes when it is reachable again. Dictionary
look-ups still fall back to IndexedDB / the server's default dictionary.

## Guest mode + Authentication (Google sign-in)

The app is **fully usable without an account**. If you are not signed in you run
as a *guest*: look-ups, the Word Cloud, and SRS reviews all work and persist
locally in IndexedDB (keyed under the `__guest__` user id). Signing in is
**optional** and only adds cross-device cloud sync.

- **Guest** (`GUEST_USER_ID` in `src/features/auth/data/auth.ts`): no auth token, so sync is a
  no-op and data never leaves the device. The header shows *Khách* with an
  *Đăng nhập* button that opens the Google sign-in screen as a dismissible modal.
- **First sign-in migrates guest progress**: `reassignEntries()`
  (`src/features/review/data/repository.ts`) moves any `__guest__` entries onto the new account
  (last-write-wins per term) so nothing learned while trying the app is lost.

Per SPEC §2.C, learning data is tied to an account so it is consistent across
devices once you sign in:

- **Sign-in is Google-only.** Set `GOOGLE_CLIENT_ID` on the server (an OAuth 2.0
  *Web application* client id from Google Cloud Console — not secret). The
  frontend reads it from `GET /api/auth/config`, renders Google Identity
  Services' button, and posts the resulting ID token to `POST /api/auth/google`.
- **Backend** (`server/src/features/auth/`): `google.ts` verifies the ID token
  with `google-auth-library` (signature, audience, issuer, expiry); the account
  is matched by Google subject — falling back to email so a pre-OAuth account
  keeps its data — then issued an **HS256 session JWT** (`auth.ts`) signed with
  `GIOITU_JWT_SECRET`. Also `GET /api/auth/me`.
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

There are **six forward dictionaries**, one per language pair, chosen from the
**Từ điển dropdown in the header**: **Nhật → Việt**, **Việt → Nhật**,
**Nhật → Anh**, **Anh → Nhật**, **Anh → Việt**, **Việt → Anh**
(`src/shared/languages.ts`). Each look-up is a forward `term → meaning` query
scoped to the selected pair `(term_lang, native_lang)` — there is no separate
reverse-index mode; "Việt → Anh" is simply a `vi → en` dictionary.

The user chooses which database answers via a **source toggle** in that same
header dropdown (*Trên máy* / *Server*) — there is **no** automatic
client→server fallback;
the chosen source answers outright (first-load default follows wherever data
actually is). The two sources sit behind one `DictionarySource` interface
(`dictionary/data/sources.ts`), with `search.ts` a thin facade over them:

1. **Client-side (IndexedDB)** — fastest, offline-first. Import a Yomitan `.zip`
   (tagged with the selected pair) into the `terms` store, keyed
   `[term_lang, native_lang, term]`.
2. **Server-side (Postgres)** — the backend's shared dictionary, queried over
   `/api` (`?src=&tgt=`); plain-text entries, still deinflected client-side.

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
| 1 | ⚠️ **Deviated**: only the `＋` button (and saving a custom definition) records a lookup — plain search confirms record nothing. 2s debounce still applies | `app/useLookup.ts`, `review/domain/lookup.ts`, `constants.LOOKUP_DEBOUNCE_MS` |
| 2 | ⚠️ **Deviated**: SRS card is created on the *first* `＋` (no `≥ 2` gating); `SRS_GATING_THRESHOLD` only heals legacy card-less entries | `review/domain/lookup.ts` ("no gating"), `constants.SRS_GATING_THRESHOLD` |
| 3 | Tag colour = log-normalized `lookup_count`, independent of SRS | `review/domain/wordcloud.computeShade` |
| 4 | Visibility depends on `status`: `LEARNED` hidden, `LEARNING`/`RELAPSED` shown | `review/domain/wordcloud.isVisibleOnCloud` |
| 5 | `RELAPSED` = `LEARNING` logic + warning badge | `review/domain/srs.ts`, `review/ui/WordCloud.tsx` |
| 6 | ⚠️ **Deviated**: relapse of a `LEARNED` word only triggers via an explicit `＋` re-add (plain look-ups aren't recorded); resets like `Again` | `review/domain/lookup.ts` + `srs.relapse` |
| 7 | Graduate `→ LEARNED` by threshold `srs_interval ≥ 21 days` via reviews. ⚠️ Partially deviated: three "mark as known" shortcuts (DetailPanel ✓, KanjiStats quick-mark, VocabStudy double-click) jump straight to `LEARNED` via `srs.markKnown` | `review/domain/srs.gradeCard`, `srs.markKnown` |
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
