# Lược đồ dữ liệu — gioitu

> Tài liệu này mô tả **hai lược đồ lưu trữ**: IndexedDB (client) và PostgreSQL
> (server), cùng giao thức đồng bộ và quan hệ cache ↔ chân lý giữa chúng.
>
> Kiến trúc tổng thể: [ARCHITECTURE.md](./ARCHITECTURE.md). Logic nghiệp vụ:
> [LOGIC.md](./LOGIC.md).

## 1. Hai nguồn, hai chiều cache

| Khối dữ liệu | Nguồn sự thật | Bản cache | Tái tạo |
|---|---|---|---|
| **Từ điển** (tra cứu) | **IndexedDB** (`terms`, `term_meta`, `dictionaries`) | Postgres `dict` là *fallback* | Re-import Yomitan `.zip` |
| **Dữ liệu học** (SRS) | **Postgres** `user_data` (per tài khoản) | IndexedDB `user_data` | Pull lại từ cloud |

Nguyên tắc: store từ điển trong IndexedDB là **cache có chủ đích** — xoá đi
re-import lại được, nên mỗi lần đổi schema cứ tạo lại sạch. Trái lại, dữ liệu học
phải bảo toàn → IndexedDB chỉ là bản sao của Cloud DB.

## 2. IndexedDB (client) — `src/shared/db.ts`

`DB_NAME = "gioitu"`, `DB_VERSION = 6`. **Bump `DB_VERSION` khi đổi schema.**

Lịch sử version (trong `upgrade()`):

| Ver | Thay đổi |
|---|---|
| v3 | Làm giàu store `terms` (structured content, tag, rule) + thêm registry `dictionaries` |
| v4 | Thêm `tagMeta` (phân giải từ `tag_bank`) |
| v5 | Thêm `reading` vào **khoá** của `terms` → đồng âm không đè nhau |
| v6 | Thêm store `term_meta` (IPA/pitch/freq) |

> Khi nâng cấp, `terms` bị **xoá và tạo lại sạch** (cache, không phải chân lý);
> store cũ `reverse_tokens` cũng bị xoá. Người dùng re-import từ điển.

### 2.1 Bốn object store

```
terms          khoá [term_lang, native_lang, term, reading]
               index by_pair [term_lang, native_lang]
               index by_dict  dictId
               value DictEntry

dictionaries   khoá id (string)
               index by_pair [term_lang, native_lang]
               value LocalDictionary

term_meta      khoá [term_lang, native_lang, term, reading, mode, dictId]
               index by_lookup [term_lang, native_lang, term]
               index by_dict    dictId
               value TermMetaEntry

user_data      khoá [user_id, term, term_lang]
               index by_next_review next_review
               index by_status      status
               value VocabEntry
```

**Vì sao `reading` nằm trong khoá `terms`:** đồng âm khác cách đọc (辛い からい
"cay" vs つらい "khổ") được lưu **riêng** thay vì đè lên nhau. Vì sao `term_meta`
có khoá dài (`…mode, dictId`): cùng `(term, reading, mode)` cùng tồn tại qua nhiều
từ điển, và re-import một từ điển thì **ghi đè** chứ không nhân bản.

### 2.2 `DictEntry` (value của `terms`)

```ts
interface DictEntry {
  term: string;
  reading?: string;
  definitions: GlossaryNode[];   // strings hoặc structured content; plain-text giữ array string
  term_lang: string;
  native_lang: string;

  // --- Yomitan-rich, tất cả optional (vắng ở entry plain-text/legacy) ---
  senses?: Sense[];                       // glossary theo từng sense + tag POS
  rules?: string;                         // word-type rule cho deinflector ("v5k", "adj-i"…)
  termTags?: string[];                    // tag mức từ (vd ["⭐","common"])
  tagMeta?: Record<string, ResolvedTag>;  // code → {name, category, notes} (từ tag_bank)
  score?: number;                         // điểm xếp hạng Yomitan
  dictionary?: string;                    // tên từ điển nguồn (hiển thị)
  dictId?: string;                        // id từ điển nguồn (để xoá hàng loạt)
}
```

### 2.3 `LocalDictionary` (value của `dictionaries`)

```ts
interface LocalDictionary {
  id: string;
  title: string;
  term_lang: string;
  native_lang: string;
  termCount: number;
  metaCount?: number;   // số dòng term-meta đóng góp — > 0 với từ điển chỉ-meta
  importedAt: number;
  revision?: string;
}
```

### 2.4 `TermMetaEntry` (value của `term_meta`)

```ts
interface TermMetaEntry {
  term: string;
  reading: string;            // "" nếu không xác định
  mode: "ipa" | "pitch" | "freq";
  data: unknown;              // hình dạng theo mode (vd IPA: { reading, transcriptions[] })
  term_lang: string;
  native_lang: string;
  dictId?: string;
  dictionary?: string;
}
```

### 2.5 `VocabEntry` (value của `user_data`)

Mô hình lõi, dùng chung client/server (payload sync). Xem chi tiết từng trường ở
[LOGIC.md §2](./LOGIC.md). Khoá duy nhất `(user_id, term, term_lang)`; guest dùng
`user_id = "__guest__"`. Hai index `by_next_review`, `by_status` phục vụ lọc thẻ
đến hạn và Word Cloud.

## 3. PostgreSQL (server) — `server/src/core/db.ts`

Kết nối qua `DATABASE_URL` (ưu tiên) hoặc các biến `PG*`. TLS opt-in
(`PGSSL=1` hoặc `?sslmode=require`). `initSchema()` chạy lúc bootstrap (idempotent,
`CREATE TABLE IF NOT EXISTS`).

### 3.1 DDL (nguyên văn)

```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

-- Imported dictionaries (one row per .zip imported). Terms reference this
-- via dict.dict_id so a whole dictionary can be listed or deleted.
CREATE TABLE IF NOT EXISTS dictionaries (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  term_lang TEXT NOT NULL,
  native_lang TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

-- Fallback dictionaries, scoped per language pair (forward only).
CREATE TABLE IF NOT EXISTS dict (
  term TEXT NOT NULL,
  term_lang TEXT NOT NULL,
  native_lang TEXT NOT NULL,
  reading TEXT,
  definitions TEXT NOT NULL,   -- JSON array of glosses
  -- Source dictionary; NULL for seed/manually-added entries.
  dict_id TEXT REFERENCES dictionaries(id) ON DELETE SET NULL,
  PRIMARY KEY (term_lang, native_lang, term)
);
-- Older databases predate dict_id; add it if missing.
ALTER TABLE dict ADD COLUMN IF NOT EXISTS dict_id TEXT
  REFERENCES dictionaries(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_dict_source ON dict(dict_id);

-- User learning data: source of truth (SPEC 2.C).
CREATE TABLE IF NOT EXISTS user_data (
  user_id TEXT NOT NULL,
  term TEXT NOT NULL,
  term_lang TEXT NOT NULL,
  payload TEXT NOT NULL,       -- full VocabEntry JSON
  updated_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, term, term_lang)
);
CREATE INDEX IF NOT EXISTS idx_user_updated ON user_data(user_id, updated_at);
```

### 3.2 Giải thích từng bảng

**`users`** — tài khoản. `id` là UUID (`crypto.randomUUID()`); `email` chuẩn hoá
lowercase + UNIQUE; `password_hash` định dạng `"<salt_hex>:<hash_hex>"` (scrypt,
salt 16 byte, hash 64 byte); `created_at` epoch ms.

**`dictionaries`** — registry từ điển server đã import (một dòng/zip). `id` UUID.
Term tham chiếu qua `dict.dict_id` để liệt kê/xoá cả từ điển.

**`dict`** — từ điển fallback, thuận, scope theo cặp `(term_lang, native_lang)`.
Khoá chính `(term_lang, native_lang, term)`. `definitions` là **JSON array string**
(plain-text — đường server không giữ structured content). `dict_id` FK
**`ON DELETE SET NULL`**: xoá một từ điển import thì term của nó về `dict_id =
NULL` *(lưu ý: route DELETE hiện xoá thẳng các dòng theo `dict_id` — xem §4)*;
term seed/thêm tay có `dict_id = NULL` ngay từ đầu nên sống sót khi từ điển bị
xoá.

**`user_data`** — chân lý của dữ liệu học (per tài khoản). Khoá chính `(user_id,
term, term_lang)`. `payload` là **toàn bộ `VocabEntry` JSON**; `updated_at` (epoch
ms) phục vụ last-write-wins. Index `idx_user_updated (user_id, updated_at)` tăng
tốc pull `WHERE user_id = $1 AND updated_at >= $2`.

### 3.3 Quan hệ

```
users (id) ─────────────┐  (không khai báo FK; ràng buộc ở tầng sync — user_id rút từ JWT)
                        ▼
                   user_data (user_id, term, term_lang)

dictionaries (id) ──FK──< dict (dict_id)   ON DELETE SET NULL
                          PK (term_lang, native_lang, term)
```

## 4. HTTP API

Tất cả mount dưới `/api`. CORS bật toàn cục. Body JSON, riêng import dùng raw
(`application/zip`, tới ~256 MB).

### 4.1 Auth — `/api/auth` (không cần token)

| Method · Path | Body | Trả về | Lỗi |
|---|---|---|---|
| `POST /register` | `{ email, password }` | `{ token, user_id, email }` | 400 email/mật khẩu (< 6 ký tự), 409 email đã đăng ký |
| `POST /login` | `{ email, password }` | `{ token, user_id, email }` | 401 sai email/mật khẩu |
| `GET /me` | — (Bearer) | `{ user_id, email }` | 404 không tìm thấy (token cũ) |

### 4.2 Dictionary — `/api/dict`

| Method · Path | Auth | Body/Query | Tác dụng |
|---|---|---|---|
| `GET /lookup` | ❌ | `?term&src&tgt` | Một entry thuận hoặc `null` |
| `GET /suggest` | ❌ | `?prefix&src&tgt` | Tối đa 10 gợi ý theo tiền tố |
| `POST /import` | ✅ | raw zip, `?src?&tgt?` | Parse Yomitan zip, bulk-insert theo chunk 1000 |
| `POST /import-url` | ✅ | `{ url, src?, tgt? }` | Tải zip từ URL (server-side) rồi import |
| `GET /dictionaries` | ✅ | — | Liệt kê từ điển + đếm term sống |
| `DELETE /dictionaries/:id` | ✅ | — | Xoá từ điển và các term thuộc nó |
| `GET /terms` | ✅ | `?src&tgt&q?&limit?&offset?` | Duyệt/tìm tiền tố (phân trang) |
| `PUT /term` | ✅ | `{ term, term_lang, native_lang, reading?, definitions[] }` | Thêm/sửa term (upsert, `dict_id = NULL`) |
| `DELETE /term` | ✅ | `{ term, term_lang, native_lang }` | Xoá một term |

Đường đọc (`/lookup`, `/suggest`) **public** → frontend tra được khi chưa đăng
nhập. `PUT /term` upsert với `dict_id = NULL` (term thêm tay sống sót khi xoá từ
điển import).

### 4.3 Sync — `/api/sync` (cần Bearer; `user_id` rút từ token)

| Method · Path | Query/Body | Trả về |
|---|---|---|
| `GET /` | `?since=<ms>` (mặc định 0) | Mảng `VocabEntry` có `updated_at >= since` |
| `POST /` | `{ entries: VocabEntry[] }` | **Toàn bộ** tập hiện tại của user (sau merge) |

## 5. Giao thức đồng bộ (Last-Write-Wins)

**Pull** `GET /api/sync?since=`:
```sql
SELECT payload FROM user_data WHERE user_id = $1 AND updated_at >= $2
```
Trả các `payload` (parse JSON). `user_id` lấy từ token, không từ client.

**Push** `POST /api/sync` — mỗi entry upsert trong một transaction, LWW:
```sql
INSERT INTO user_data (user_id, term, term_lang, payload, updated_at)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (user_id, term, term_lang) DO UPDATE SET
  payload    = EXCLUDED.payload,
  updated_at = EXCLUDED.updated_at
WHERE EXCLUDED.updated_at >= user_data.updated_at
```
Chỉ ghi đè khi `updated_at` mới `>=` bản hiện có; ngược lại bỏ qua. `user_id`
trong payload bị **ép** về user của token (chống giả mạo). Sau khi upsert xong,
trả **toàn bộ** tập của user (`SELECT payload FROM user_data WHERE user_id = $1`).

Phía client (`repository.ts`) cũng merge LWW (`mergeByUpdatedAt`) trước khi push,
nên hội tụ ở cả hai đầu. Chi tiết logic merge: [LOGIC.md §12](./LOGIC.md).

## 6. Xác thực

- **Mật khẩu**: `scrypt` + salt ngẫu nhiên 16 byte/người; lưu `"<salt_hex>:
  <hash_hex>"`; so khớp bằng `crypto.timingSafeEqual` (chống timing attack).
- **Phiên**: HS256 JWT tự cài, ký bằng `GIOITU_JWT_SECRET` (mặc định dev
  `"dev-insecure-secret-change-me"` — **đặt secret thật khi deploy**). Payload
  `{ sub: user_id, email, iat, exp }`, hạn 30 ngày.
- **Middleware `requireAuth`**: đọc header `Authorization: Bearer <token>`, verify
  chữ ký + hạn, gán `req.userId = payload.sub`; thiếu/sai → `401 { error: "Cần
  đăng nhập" }`.

## 7. Bootstrap & seed

`server/src/index.ts`: `initSchema()` → `seedIfEmpty()` → `app.listen(PORT)`
(mặc định `8787`). `seedIfEmpty()` (`core/seed.ts`) chỉ nạp khi bảng `dict` rỗng —
gồm vài từ mẫu cho các cặp (en↔vi: ephemeral/resilient/meticulous…; ja↔vi: 勉強/
猫…), `dict_id = NULL`.

Phục vụ frontend (`app.ts`): nếu có `dist/index.html` (hoặc `GIOITU_STATIC_DIR`),
serve static + fallback SPA `app.get(/^(?!\/api\/).*/, → index.html)` cho mọi GET
không phải `/api/*` → single-origin, không proxy. Không có `dist/` → chế độ chỉ
API (dùng với Vite dev riêng).

## 8. Biến môi trường

| Biến | Mặc định | Vai trò |
|---|---|---|
| `PORT` | `8787` | Cổng backend |
| `DATABASE_URL` | — | Chuỗi kết nối Postgres (ưu tiên) |
| `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE` | chuẩn `pg` | Dùng khi không có `DATABASE_URL` |
| `PGSSL` | — | `1` → bật TLS (`rejectUnauthorized:false`) |
| `GIOITU_JWT_SECRET` | `dev-insecure-secret-change-me` | Khoá ký HS256 — **đặt thật khi deploy** |
| `GIOITU_STATIC_DIR` | `./dist` | Thư mục frontend đã build |
</content>
