# CLAUDE.md

Hướng dẫn bắt buộc cho mọi phiên làm việc trên dự án này. Code mới phải
đọc liền mạch với code xung quanh: theo đúng kiến trúc, cách đặt tên và idiom
hiện có. Khi quy ước ở đây mâu thuẫn với thói quen mặc định, **ưu tiên quy ước
ở đây**.

## Dự án

`gioitu` — webapp từ điển JA/EN→VI kết hợp Spaced Repetition System (SRS).
Frontend React 18 + TypeScript (Vite), backend Express + Postgres, lưu offline
bằng IndexedDB. Triết lý: *một lần tra cứu là tín hiệu của sự quên* — xem README.

## Lệnh (chạy trước khi coi một việc là "xong")

```bash
npm run dev         # Vite dev server (proxy /api → http://localhost:8787)
npm test            # vitest run — toàn bộ test phải xanh
npm run typecheck   # tsc -b --noEmit
npm run build       # tsc -b && vite build
npm run server      # tsx server/src/index.ts (cần Postgres qua docker-compose)
npm run server:dev  # tsx watch server/src/index.ts
```

Trước khi báo "xong": chạy `npm test` và `npm run typecheck`. Lỗi typecheck
trong `server/` (thiếu `pg`, implicit any) là **có sẵn**, không liên quan thay
đổi frontend.

## Kiến trúc

Tổ chức theo **feature**. Mỗi feature tách `data/` (I/O, IndexedDB, mạng),
`domain/` (logic thuần, không phụ thuộc React/DOM) và `ui/` (component).

```
src/
  app/         Composition root: App.tsx, main.tsx, useLookup.ts
  features/
    auth/      Đăng nhập tuỳ chọn (guest dùng được toàn bộ); data/ ui/ useAuth.ts
    dictionary/ Tra từ kiểu Yomitan: import .zip, deinflection, structured content
    review/    Word Cloud + SRS (state/store.ts, domain/srs.ts, domain/wordcloud.ts)
    theme/     Tuỳ chỉnh màu (heatmap + bảng màu), ThemeProvider + domain/theme.ts
  shared/      db.ts (IndexedDB), types.ts, languages.ts, structured-content.ts,
               japanese.ts (furigana), ui/ (Toasts, format)
server/src/    core/ (db) + features/{dictionary,sync}
```

## Quy ước

- **Import alias**: `@/` → `src`, `@server` → `server/src`. Import xuyên feature
  hoặc tới `shared` dùng alias; import **trong cùng feature** dùng đường dẫn
  tương đối.
- **Logic thuần ở `domain/`** để test dễ; `data/` và `ui/` bọc quanh.
- **Bình luận** viết cùng mật độ và giọng với code xung quanh; giải thích "vì
  sao", không lặp lại "cái gì".
- UI và thông báo cho người dùng viết bằng **tiếng Việt**.

## Dữ liệu

- **Hai nguồn từ điển, người dùng tự chọn** trong dropdown phạm vi trên
  SearchBar (nút gộp cặp ngôn ngữ + nguồn *Trên máy* / *Server*) — **không**
  auto client-first/server-fallback nữa: nguồn nào được chọn thì tra đúng
  nguồn đó. Logic chọn nguồn tách riêng: interface
  `DictionarySource` (`dictionary/data/sources.ts`) có 2 cài đặt (IndexedDB và
  server Postgres); `search.ts` chỉ là facade mỏng. Lựa chọn lưu ở localStorage
  (`gioitu.dictSource.v1`). IndexedDB vẫn nhanh nhất / offline-first: store
  `terms` (từ điển đã import) và `dictionaries` (registry) là **cache** — tạo lại
  được bằng re-import. Khoá `terms` gồm cả `reading` để không gộp đồng âm.
- **`user_data`** (dữ liệu học/SRS) trong IndexedDB chỉ là cache; nguồn sự thật
  là Cloud DB (server). Bump `DB_VERSION` trong `src/shared/db.ts` khi đổi schema.

## Kiểm thử

- Test bằng **vitest**, môi trường `node` (không có DOM). Dùng
  `fake-indexeddb/auto` cho test IndexedDB.
- Logic mới ở `domain/` nên có test đi kèm. Giữ test cũ xanh; nếu một test mã
  hoá hành vi cũ mà ta cố ý đổi, cập nhật test một cách có chủ đích.
