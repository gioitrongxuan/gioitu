# Tài liệu kỹ thuật — gioitu

Bộ tài liệu này mô tả thiết kế của `gioitu` — webapp từ điển JA/EN→VI kết hợp
Spaced Repetition System (SRS). Tổng quan vận hành và cách chạy: xem
[../README.md](../README.md).

| Tài liệu | Nội dung |
|---|---|
| [FEATURES.md](./FEATURES.md) | Chức năng hệ thống (góc nhìn người dùng): bố cục màn hình, tra cứu, Word Cloud, ôn tập SRS, quản lý từ điển, theme, tài khoản/đồng bộ, thông báo, offline-first. |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Kiến trúc: tầng feature (data/domain/ui), hướng phụ thuộc, luồng dữ liệu runtime (lookup / review / sync), từ điển hai nguồn, backend, topology triển khai, guest/auth, theme. |
| [LOGIC.md](./LOGIC.md) | Logic thuần: 9 ràng buộc SPEC, `VocabEntry`, gating tra cứu, engine SM-2 (gradeCard/relapse), Word Cloud, deinflection, import Yomitan, structured content, term-meta, furigana, merge LWW, heatmap. |
| [DB_SCHEMA.md](./DB_SCHEMA.md) | Lược đồ lưu trữ: 4 object store IndexedDB (khoá/index/value), 4 bảng PostgreSQL (DDL nguyên văn + quan hệ), API HTTP, giao thức đồng bộ LWW, xác thực, bootstrap/seed, biến môi trường. |

## Đọc theo nhu cầu

- **Muốn biết hệ thống làm được gì** → [FEATURES.md](./FEATURES.md).
- **Mới vào dự án** → [FEATURES.md](./FEATURES.md) → [ARCHITECTURE.md](./ARCHITECTURE.md)
  → [LOGIC.md](./LOGIC.md).
- **Sửa logic SRS / tra cứu** → [LOGIC.md](./LOGIC.md) (mọi quy tắc là pure
  function, có test ở `test/`).
- **Sửa schema / sync / backend** → [DB_SCHEMA.md](./DB_SCHEMA.md) (nhớ bump
  `DB_VERSION` khi đổi IndexedDB).

> Quy ước & lệnh build/test bắt buộc: xem [../CLAUDE.md](../CLAUDE.md). Chạy
> `npm test` và `npm run typecheck` trước khi coi một thay đổi là "xong".
</content>
