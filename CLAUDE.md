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

## Tài liệu — đọc gì trước khi làm

- **`docs/BACKLOG.md`** — kết quả audit 07/2026 (đã kiểm chứng, có `file:dòng`)
  chia 4 giai đoạn. Nhận task cải thiện/sửa lỗi: đọc mục tương ứng ở đây
  TRƯỚC, đừng quét lại codebase. Làm xong mục nào xoá mục đó.
- **`docs/DESIGN.md`** — token, checklist bắt buộc cho mọi PR chạm UI, IA đích
  4 khu. Không thêm magic number/emoji-icon/overlay mới ngoài hệ này.
- `docs/LOGIC.md` (logic thuần, tin được), `docs/ARCHITECTURE.md`,
  `docs/DB_SCHEMA.md`. Riêng `docs/FEATURES.md` từng lạc hậu nặng — khi nghi
  ngờ, code là chân lý; PR thêm tính năng phải cập nhật FEATURES.md.
- **Quyết định mở** (chưa chốt, đừng tự quyết trong PR thường): triết lý
  gating tra-cứu-vs-"+", "tự khai đã thuộc", study list vs từ điển cá nhân —
  xem đầu BACKLOG.md.

## Kiến trúc

Tổ chức theo **feature**. Mỗi feature tách `data/` (I/O, IndexedDB, mạng),
`domain/` (logic thuần, không phụ thuộc React/DOM) và `ui/` (component).

```
src/
  app/         Composition root: App.tsx (điều hướng = useState, chưa có route),
               main.tsx, useLookup.ts
  features/
    auth/      Đăng nhập Google tuỳ chọn (guest dùng được toàn bộ); YomitanSync
    dictionary/ Tra từ kiểu Yomitan: import .zip, deinflection, structured
               content; DictionaryManager (admin server), CustomDictionary
               (từ điển cá nhân IndexedDB + AI), RadicalPicker, HandwritingPad
    review/    Word Cloud + SRS (state/store.ts, domain/srs.ts, domain/wordcloud.ts)
    vocabstudy/ Trang học từ vựng dạng lưới (nguồn: study list / custom dict)
    kanjistats/ Thống kê độ phủ kanji theo JLPT/lớp + đánh dấu nhanh
    studylist/ Danh sách từ trên server (cần đăng nhập) — đang nửa vời, xem BACKLOG
    contribute/ Đề xuất sửa nghĩa + màn duyệt (admin)
    premium/   Mã kích hoạt; mở khoá sync từ điển cá nhân
    share/     Chia sẻ từ điển qua link .zip ngắn hạn
    theme/     Tuỳ chỉnh màu (heatmap + bảng màu) + presets/ (skin anime lazy)
  shared/      db.ts (IndexedDB), types.ts, languages.ts, structured-content.ts,
               japanese.ts (furigana), ui/ (Toasts, format)
server/src/    core/ (db) + features/{auth,dictionary,sync}
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

- **Hai nguồn từ điển, người dùng tự chọn** trong dropdown phạm vi ở nút "Từ
  điển" trên header (`DictionaryImport.tsx`, gộp cặp ngôn ngữ + nguồn *Trên
  máy* / *Server*) — **không** auto client-first/server-fallback nữa: nguồn
  nào được chọn thì tra đúng nguồn đó. Logic chọn nguồn tách riêng: interface
  `DictionarySource` (`dictionary/data/sources.ts`) có 2 cài đặt (IndexedDB và
  server Postgres); `search.ts` chỉ là facade mỏng. Lựa chọn lưu ở localStorage
  (`gioitu.dictSource.v1`). IndexedDB vẫn nhanh nhất / offline-first. Khoá
  `terms` gồm cả `reading` để không gộp đồng âm.
- **CẢNH BÁO — bất biến "terms là cache" đã đổ**: từ khi có Từ điển cá nhân
  (CustomDictionary), store `terms` chứa cả từ người dùng tự soạn — KHÔNG tạo
  lại được bằng re-import. Hàm upgrade trong `src/shared/db.ts` hiện xoá store
  này mỗi lần bump version (mục critical, BACKLOG GĐ0). Trước khi bump
  `DB_VERSION`, phải bảo toàn row có `dictId` thuộc registry custom.
- **`user_data`** (dữ liệu học/SRS) trong IndexedDB: với người đăng nhập là
  cache của Cloud DB; với **guest là bản duy nhất** (chưa có backup/persistent
  storage — xem BACKLOG GĐ0). Bump `DB_VERSION` khi đổi schema.

## Kiểm thử

- Test bằng **vitest**, môi trường `node` (không có DOM). Dùng
  `fake-indexeddb/auto` cho test IndexedDB.
- Logic mới ở `domain/` nên có test đi kèm. Giữ test cũ xanh; nếu một test mã
  hoá hành vi cũ mà ta cố ý đổi, cập nhật test một cách có chủ đích.
