# Kiến trúc — gioitu

> Tài liệu này mô tả **kiến trúc tổng thể**: tầng, hướng phụ thuộc, luồng dữ
> liệu runtime, và các topology triển khai. Logic nghiệp vụ chi tiết xem
> [LOGIC.md](./LOGIC.md); lược đồ lưu trữ xem [DB_SCHEMA.md](./DB_SCHEMA.md).

## 1. Bức tranh tổng thể

`gioitu` là webapp **từ điển JA/EN→VI kết hợp Spaced Repetition System (SRS)**.
Triết lý cốt lõi: *một lần tra cứu là tín hiệu của sự quên*. Một từ phải được tra
**lại (≥ 2 lần)** mới được coi là "đáng học" và mới vào hàng đợi ôn tập — nhờ vậy
hàng đợi SRS luôn sạch và tập trung.

Hai khối dữ liệu được tách bạch (SPEC §2):

| Khối | Nguồn sự thật | Cache | Ghi chú |
|---|---|---|---|
| **Từ điển** (tra cứu) | IndexedDB (client) | Server Postgres là *nguồn chọn được* (toggle) | Có thể tạo lại bằng re-import |
| **Dữ liệu học** (SRS) | Cloud DB (server) | IndexedDB | Tách khỏi từ điển để đồng bộ đa thiết bị |

Lưu ý chiều cache **ngược nhau** giữa hai khối: với từ điển, IndexedDB là chính
và nhanh nhất; với dữ liệu học, Cloud DB là chân lý còn IndexedDB chỉ là bản sao.

## 2. Stack công nghệ

| Tầng | Công nghệ |
|---|---|
| Frontend | React 18 + TypeScript, Vite |
| Lưu offline | IndexedDB (qua thư viện `idb`) |
| Giải nén từ điển | JSZip (đọc Yomitan `.zip`) |
| Backend (tuỳ chọn) | Express 4 + PostgreSQL (`pg`) |
| Auth | `scrypt` + HS256 JWT (tự cài, không phụ thuộc ngoài) |
| Test | Vitest (môi trường `node`, `fake-indexeddb`) |

Backend là **tuỳ chọn**: app dùng được đầy đủ ở chế độ khách (guest) hoàn toàn
offline. Backend chỉ thêm tài khoản + đồng bộ cloud + từ điển dùng chung phía
server (chọn được qua toggle *Server*).

## 3. Tổ chức theo feature (vertical slices)

Mã nguồn tổ chức **theo feature** trên một *shared kernel* nhỏ. Mỗi feature tách
ba tầng theo trách nhiệm:

```
domain/   Logic thuần — KHÔNG phụ thuộc React/DOM/I-O. Pure function, dễ test.
data/     I/O — IndexedDB, mạng (fetch), đọc Yomitan zip.
ui/       Component React, bám vào domain qua data/state.
```

Quy tắc phụ thuộc (một chiều, không vòng):

```
        app/  (composition root)
          │  wires features + shared
          ▼
   ┌──────────────┐
   │  features/*  │  ui → (state/data) → domain
   │  ui          │      (mỗi feature tự đóng gói)
   │  data        │
   │  domain      │
   └──────────────┘
          │  mọi feature chỉ phụ thuộc xuống
          ▼
       shared/  (kernel: types, db, structured-content, languages…)
```

- `app/` được phép biết mọi feature; **không feature nào** import `app/`.
- Feature import lẫn nhau hoặc import `shared/` qua **alias** (`@/`, `@server`).
- Import **trong cùng feature** dùng đường dẫn tương đối.
- `domain/` không bao giờ import `data/` hay `ui/` — chiều phụ thuộc luôn hướng
  vào trong (UI biết domain, domain không biết UI).

### Import alias

| Alias | Trỏ tới |
|---|---|
| `@/*` | `src/*` |
| `@server/*` | `server/src/*` |

## 4. Bản đồ thư mục

```
src/
  app/                      Composition root (thin shell)
    App.tsx                 Wires auth + store + màn hình chính
    main.tsx                React entry point
    useLookup.ts            View-state của detail panel + 3 cách mở chi tiết
  shared/                   Kernel dùng chung, không phụ thuộc feature
    types.ts                VocabEntry — mô hình dữ liệu lõi (SPEC §5)
    db.ts                   Lược đồ IndexedDB: terms / dictionaries / term_meta / user_data
    structured-content.ts   Mô hình glossary Yomitan + flatten text + furigana node
    term-meta.ts            TermMetaEntry (IPA / pitch / freq)
    japanese.ts             Phân bổ furigana (ruby) theo run
    languages.ts            Các cặp ngôn ngữ (ja↔vi, en↔vi, ja↔en)
    ui/                     Toasts, format thời lượng
  features/
    auth/                   Đăng nhập tuỳ chọn (guest dùng được toàn bộ)
      data/auth.ts          Session: lưu JWT + user vào localStorage
      ui/AuthScreen.tsx     Modal đăng nhập/đăng ký
      useAuth.ts
    dictionary/             Tra từ kiểu Yomitan
      domain/deinflect.ts   Deinflection (JA đầy đủ + EN nhẹ)
      domain/tags.ts        Phân giải tag code → tên/nhóm
      data/yomitan.ts       Parse Yomitan v3 zip → IndexedDB
      data/sources.ts       Interface DictionarySource + 2 impl (IndexedDB / server)
      data/search.ts        Facade: tra theo nguồn người dùng chọn (không fallback)
      data/serverDict.ts    Client gọi từ điển server (public, best-effort)
      data/dictAdmin.ts     Client gọi quản trị từ điển server (auth)
      ui/                    SearchBar, DetailPanel, StructuredContent, DictionaryImport
      ui/DictionaryManager/  Màn hình quản lý từ điển server (tách nhỏ)
    review/                 Vòng lặp học: Word Cloud + SRS
      domain/constants.ts   Tham số SM-2 (đơn vị PHÚT)
      domain/srs.ts         Engine SM-2 (pure)
      domain/lookup.ts      Orchestration tra cứu (đếm, gating, relapse)
      domain/wordcloud.ts   Hiển thị + tô màu heatmap (pure)
      data/repository.ts    Cache IndexedDB + merge LWW + sync
      data/syncApi.ts       Client cloud-sync (best-effort)
      state/store.ts        Hook React nối domain với persistence
      ui/                    WordCloud, FilterBar, ReviewSession
    theme/                  Tuỳ chỉnh màu (heatmap + bảng màu)
      domain/theme.ts       Theme model, heatBackground/heatTextColor
      ThemeProvider.tsx
      ui/ThemeSettings.tsx
server/                     Backend Express + PostgreSQL (tuỳ chọn)
  src/index.ts              Bootstrap: init schema → seed → listen
  src/app.ts                Lắp ráp Express: middleware + router + static SPA
  src/core/                 db.ts (pool + DDL) · seed.ts · middleware.ts
  src/features/
    auth/                   authRoutes.ts + auth.ts (scrypt + JWT)
    dictionary/             dictRoutes.ts + dictStore.ts + yomitan.ts
    sync/                   syncRoutes.ts + syncStore.ts
test/                       Vitest — phủ các ràng buộc logic của SPEC
```

Backend **mirror** đúng cách chia của frontend: mỗi feature là một router +
một SQL store; `core/` đóng vai shared kernel.

## 5. Tầng frontend

```
┌─────────────────────────────────────────────────────────────┐
│ app/App.tsx — composition root                               │
│   useAuth() ─┐                                               │
│   useAppStore(userId) ─┐  (review/state)                     │
│   useLookup(store,pair)┘                                     │
└───────┬───────────────────────────────┬─────────────────────┘
        │                               │
        ▼                               ▼
  ui components                   domain (pure)
  SearchBar / DetailPanel         registerLookup, gradeCard,
  WordCloud / ReviewSession       buildCloud, deinflect…
        │                               ▲
        ▼                               │ gọi (không I/O)
   data layer  ───────────────────────┘
   repository (IndexedDB+sync), search router, yomitan
        │
        ▼
   shared/db.ts (IndexedDB)  ⇄  /api (server, best-effort)
```

`App.tsx` là **shell mỏng**: nó chỉ nối ba hook (`useAuth`, `useAppStore`,
`useLookup`) rồi truyền xuống component. Mọi quyết định nghiệp vụ nằm ở
`domain/`; mọi I/O nằm ở `data/`.

### `useAppStore(userId)` — trái tim state

`src/features/review/state/store.ts` giữ danh sách `entries` trong bộ nhớ và
đồng bộ với IndexedDB + cloud:

- **Khi mở app**: đọc cache cục bộ trước (hiển thị ngay), rồi chạy `syncUserData`
  best-effort và cập nhật lại.
- `recordLookup(input)` → gọi pure `registerLookup`, ghi cache, bắn toast theo
  sự kiện (`relapsed` / `cardCreated`).
- `gradeReview(entry, grade)` → gọi pure `gradeCard`, ghi cache, toast khi từ
  `→ LEARNED`.
- `runSync()` → đồng bộ hai chiều theo yêu cầu.

### `useLookup(store, pair)` — view-state của detail panel

`src/app/useLookup.ts` sở hữu ba cách mở chi tiết, **chỉ hai cách đầu tính là
lượt tra cứu**:

| Cách mở | Có đếm lookup? |
|---|---|
| `onResult` — chọn kết quả tìm kiếm (Enter / gợi ý) | ✅ |
| `lookup` — bấm vào link nội bộ trong định nghĩa | ✅ |
| `onSelectTag` — bấm một tag trên Word Cloud (xem lại) | ❌ (read-only) |

Điểm quan trọng: từ được theo dõi trong SRS là **lemma (dạng từ điển)** sau khi
deinflect, không phải dạng biến cách người dùng gõ.

## 6. Luồng dữ liệu runtime

### 6.1 Luồng tra cứu (lookup)

```
Người dùng gõ → SearchBar
   │
   ▼
findTermsRouted(text, pair, source)    (dictionary/data/search.ts)
   │  getSource(source).findTerms(...)               (dictionary/data/sources.ts)
   │  • "local":  candidates() = deinflect → findTerms() trên IndexedDB
   │              (lọc theo word-type rule, xếp hạng, entry giàu)
   │  • "server": deinflect rồi tra từng candidate qua /api/dict/lookup
   │  (không có fallback chéo: nguồn nào được chọn thì tra đúng nguồn đó)
   ▼
TermResult[]  →  useLookup.onResult()
   │  mở DetailPanel (furigana + tag + structured content)
   ▼
store.recordLookup({ term: lemma, … })   (review/state/store.ts)
   │
   ▼
registerLookup(existing, input, now)      (review/domain/lookup.ts — PURE)
   │  • lần đầu → tạo entry (lookup_count=1)
   │  • debounce 2s → không đếm lại
   │  • lookup_count ≥ 2 → tạo thẻ SRS (gating)
   │  • chạm từ LEARNED → relapse
   ▼
putEntry() → IndexedDB user_data (cache)   (review/data/repository.ts)
```

### 6.2 Luồng ôn tập (review)

```
dueEntries (next_review ≤ now)  →  ReviewSession (lật thẻ)
   │
   ▼  người dùng tự chấm: again / hard / good / easy
gradeCard(entry, grade, now)        (review/domain/srs.ts — PURE, SM-2)
   │  cập nhật ease_factor, learning_step, reps, lapses,
   │  srs_interval (phút), next_review, status
   ▼
putEntry() → IndexedDB  →  (sync lên cloud khi có mạng)
```

### 6.3 Luồng đồng bộ (sync, Last-Write-Wins)

```
syncUserData(user_id)                 (review/data/repository.ts)
   1. local  = getAllEntries()        ← IndexedDB
   2. remote = pullUserData()         ← GET /api/sync  (null nếu offline/guest)
        └─ offline → trả local, dừng (no-op)
   3. merged = mergeByUpdatedAt(local, remote)   ← LWW theo updated_at
   4. ghi merged xuống IndexedDB
   5. pushUserData(merged)            → POST /api/sync (server cũng LWW)
```

Mọi lời gọi mạng là **best-effort**: nếu backend vắng mặt hoặc user là guest,
hàm trả `null` và cache cục bộ đứng vững một mình.

## 7. Từ điển hai nguồn (Search Router)

Có **6 cặp ngôn ngữ thuận** (`src/shared/languages.ts`), người dùng chọn ở thanh
tìm kiếm: Nhật→Việt, Việt→Nhật, Nhật→Anh, Anh→Nhật, Anh→Việt, Việt→Anh. Mỗi
tra cứu là truy vấn thuận `term → meaning` trong phạm vi cặp `(term_lang,
native_lang)` — không có chế độ "đảo chiều" riêng; "Việt → Anh" đơn giản là từ
điển `vi → en`.

> Ghi chú: comment đầu file `languages.ts` và một số chỗ trong README/CLAUDE.md
> còn ghi "bốn" (4) cặp — đó là chữ cũ; mã thực tế khai báo **6** cặp trong
> `LANG_PAIRS`. `DEFAULT_PAIR` là `en-vi` (Anh → Việt).

Người dùng chọn nguồn bằng **toggle trên SearchBar** (*Trên máy* / *Server*);
`findTermsRouted` chỉ `getSource(source)` rồi uỷ thác. **Không** auto-fallback —
nguồn nào được chọn thì tra đúng nguồn đó:

1. **IndexedDB (client) — nhanh nhất, offline-first.** Import Yomitan `.zip` (gắn
   cặp đã chọn) vào store `terms`, key `[term_lang, native_lang, term, reading]`.
   Trả về entry giàu (structured content, tag, rule).
2. **Server (Postgres).** Gọi `/api/dict/lookup?src=&tgt=`. Đường server là
   plain-text; client vẫn deinflect trước rồi tra từng candidate (giới hạn
   `MAX_SERVER_CANDIDATES = 12`).

> Lựa chọn nguồn lưu ở localStorage (`gioitu.dictSource.v1`); lần đầu (chưa
> chọn) mặc định theo nơi có dữ liệu — có từ điển cục bộ → *Trên máy*, không thì
> *Server* — để không ai gặp màn hình trống.

> Phân tầng có chủ đích: hai nguồn nằm sau cùng một interface `DictionarySource`
> (`data/sources.ts`); `search.ts` chỉ là facade. Đường **client/IndexedDB** nhận
> đủ "treatment" Yomitan; đường **server** giữ plain-text nhưng vẫn được deinflect.

## 8. Backend (tuỳ chọn)

```
index.ts          initSchema() → seedIfEmpty() → app.listen(PORT)
   │
   ▼
app.ts            cors() + express.json + raw(zip) → mount router → static SPA
   ├── /api/auth   authRoutes  (register / login / me)         — auth.ts: scrypt + JWT
   ├── /api/dict   dictRoutes  (lookup/suggest public; import/manage cần auth)
   ├── /api/sync   syncRoutes  (pull/push, cần auth)            — LWW server-side
   └── (fallback)  phục vụ dist/ — SPA cho mọi path không phải /api/*
core/
   db.ts          Pool pg + initSchema() (DDL 4 bảng)
   seed.ts        seedIfEmpty() — nạp từ mẫu khi dict rỗng
   middleware.ts  asyncHandler, requireAuth (rút user_id từ Bearer token)
```

Chi tiết route, auth, sync protocol và DDL: xem [DB_SCHEMA.md](./DB_SCHEMA.md).

## 9. Topology triển khai

| Chế độ | Lệnh | Cổng | Đặc điểm |
|---|---|---|---|
| **Production (Docker)** | `docker compose up --build` | `:8787` | Single-origin: backend phục vụ luôn `dist/` + `/api`; không proxy |
| **Dev cục bộ** | `npm run dev` (+ tuỳ chọn `npm run server`) | `:5173` (proxy `/api`→`:8787`) | Vite HMR; backend chạy riêng |
| **Dev Docker (live reload)** | `docker compose -f docker-compose.dev.yml up` | `:5173` | Bind-mount repo; `tsx watch` + Vite HMR, không cần `--build` |

Ở production, frontend và API **cùng origin** (Express bắt mọi GET không khớp
`/^(?!\/api\/).*/` và trả `index.html` cho client-side routing). Ở dev, Vite chạy
riêng và proxy `/api` sang backend.

## 10. Guest mode & xác thực

App **dùng được đầy đủ không cần tài khoản**. Khi chưa đăng nhập, người dùng chạy
ở chế độ *guest* (`GUEST_USER_ID = "__guest__"`): tra cứu, Word Cloud, ôn tập SRS
đều hoạt động và lưu cục bộ trong IndexedDB. Đăng nhập là **tuỳ chọn** và chỉ
thêm đồng bộ cloud.

- **Lần đăng nhập đầu di trú tiến trình guest**: `reassignEntries()`
  (`review/data/repository.ts`) chuyển mọi entry `__guest__` sang tài khoản mới
  (last-write-wins theo từng term) để không mất gì đã học khi dùng thử.
- **Sync được bảo vệ**: `/api/sync` cần `Authorization: Bearer <token>` và rút
  `user_id` từ token — `user_id` do client gửi bị **bỏ qua** (không giả mạo được
  quyền sở hữu).
- JWT + user được cache trong `localStorage`; token gắn vào mọi lời gọi sync.

## 11. Theme (heatmap)

Feature `theme/` cho người dùng chỉnh một bộ nhỏ CSS custom properties (lưu
`localStorage`, áp lên `:root`). Tính năng chủ đạo là **heatmap của Word Cloud**:
nền mỗi tag nội suy giữa `--heat-from` (ít tra) và `--heat-to` (tra nhiều) bằng
`color-mix`, nên sửa một endpoint là tô lại cả đám mây. Màu chữ chọn sáng/tối
theo luminance để giữ tương phản trên mọi bảng màu. Có sẵn các preset
(Mặc định, Nhiệt, Đại dương, Rừng, Nho).
</content>
</invoke>
