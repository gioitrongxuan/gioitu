# BACKLOG — kết quả audit 07/2026

> Nguồn: audit đa agent 10–11/07/2026 (8 chiều, 91 phát hiện; mọi phát hiện
> major/critical dạng khẳng định hành vi code đã được agent phản biện độc lập
> xác nhận trên code thật — 32/32 confirmed). File này là **bản đồ việc cần
> làm**: trước khi nhận một task cải thiện, đọc mục tương ứng ở đây thay vì
> quét lại codebase. Mỗi mục có găm `file:dòng` tại thời điểm audit (có thể
> trôi vài dòng sau khi sửa — dùng làm điểm nhảy, không phải chân lý).
>
> **Quy ước bảo trì**: làm xong mục nào thì xoá mục đó (git giữ lịch sử);
> mỗi PR nên khớp 1 mục hoặc 1 cụm mục cùng file. Hệ thị giác & quy tắc UI:
> [DESIGN.md](./DESIGN.md).

## Quyết định mở (cần chốt trước khi làm mục liên quan)

1. **Triết lý gating** — code hiện tại: tra cứu thường KHÔNG được ghi nhận,
   thẻ SRS tạo ngay lần bấm "+" đầu (`lookup.ts:36-59` "no gating";
   `useLookup.ts:65-68`). Docs/README vẫn mô tả "tra ≥2 lần mới vào queue".
   Phương án đề xuất: giữ "+" = tạo thẻ chủ đích, **khôi phục đếm lượt tra
   thụ động** (không tạo thẻ) để Word Cloud là bản đồ quên thật và relapse
   tự động sống lại. Chốt xong phải sửa docs đồng bộ (README §triết lý,
   LOGIC §1/§3, FEATURES).
2. **"Tự khai đã thuộc"** — 3 UI nhảy thẳng LEARNED (✓ DetailPanel,
   quick-mark KanjiStats, double-click VocabStudy) mâu thuẫn ràng buộc SPEC #7
   "tốt nghiệp bằng ngưỡng, không bằng nút". Đề xuất: nâng thành khái niệm
   chính thức (cờ nguồn riêng, đếm riêng "N từ · M kanji tự đánh dấu").
3. **Study list vs Từ điển cá nhân** — hai hệ "bộ từ tự gom" song song
   (server-only vs IndexedDB). Đề xuất: gộp về MỘT khái niệm bộ sưu tập.

## Giai đoạn 0 — Sửa nền móng (~2–4 ngày)

Vòng lặp học đúng + dữ liệu an toàn + hết báo sai cho người dùng.

- [ ] **Chốt & thực thi quyết định mở #1** (gating) + cập nhật docs.

## Giai đoạn 1 — "Thay áo" (~1–2 tuần)

Evolution UI + engine SRS chuẩn, không đổi IA. Chi tiết token: [DESIGN.md](./DESIGN.md).

### Engine SRS (`review/domain/`)
- [ ] Chia phiên thành lô ~20 thẻ ("Ôn tiếp 20 thẻ nữa?") + ưu tiên quá hạn lâu.
- [ ] Xử lý leech: ngưỡng lapses (~8) → huy hiệu + gợi ý hành động.
  `srs.ts:134-141,206-207`

### UI nền (theo DESIGN.md)
- [ ] Token layer: spacing/radius/shadow/motion/type + palette washi/sumi +
  dark yozora + inline script chống flash trắng (OS dark hiện flash vì theme
  chỉ áp bằng JS). `styles.css:2-35 · index.html:6`
- [ ] `:focus-visible` toàn cục + gỡ 5 chỗ `outline:none` không thay thế.
  `styles.css:516,820,878,896,946`
- [ ] Hook `useDialog` dùng chung (Escape đóng, focus đầu/trả focus,
  aria-modal) cho cả 5 overlay — hiện grep "Escape" = 0. `ThemeSettings.tsx:60-64`
- [ ] Combobox chuẩn cho gợi ý: ArrowUp/Down + Enter, aria-activedescendant
  (hiện listbox aria-selected cứng false). `SearchBar.tsx:146-174`
- [ ] Bộ ~15 SVG icon inline (stroke currentColor) thay emoji 🔍 ✏️ ✕ ☰ ▾ ↞ ×.
- [ ] Contrast: heatTextColor tính contrast thật với cả 2 ứng viên chữ (hiện
  flip ở luminance 0.4 → dải giữa heatmap ~2.2–3.5:1, rớt AA); chốt bằng test
  domain mọi shade ≥ 4.5. `theme.ts:357-367`
- [ ] Tag từ loại bỏ palette Bootstrap-3 hardcode chữ trắng 11px → chip nhạt
  kiểu `.srs-status` (nền color-mix 12-14% + chữ đậm). `styles.css:636-672`
- [ ] Grade buttons: nền đậm hơn đạt AA + hover/press. `styles.css:716-722`
- [ ] Việt hoá Quên/Khó/Nhớ/Dễ + phím tắt Space/1–4. `ReviewSession.tsx:26-30`
- [ ] Màn tổng kết phiên giàu: breakdown grade, từ Quên → "Ôn lại ngay", từ vừa
  tốt nghiệp, forecast ngày mai. `ReviewSession.tsx:65-75`
- [ ] Skeleton shimmer thay text "Đang tải…"; sửa `.toast.info` hardcode
  #334155. `styles.css:1046`
- [ ] Theme editor: cảnh báo contrast khi fg≈bg (relativeLuminance có sẵn
  trong cùng file); footer modal render màu cố định để luôn thoát được.
  `ThemeSettings.tsx:124-131`
- [ ] Body font-size/line-height cơ sở; text nội dung ≥12px; input ≥16px mobile
  (hiện .url-input 13px gây iOS auto-zoom); bỏ uppercase hán-việt 12px.
  `styles.css:39,515,575,597`

### Hiệu năng rẻ
- [ ] Memo WordCloud (`useMemo(buildCloud)` + `React.memo`) + tách Toasts ra
  subtree riêng — hiện toast tự tắt cũng re-render 1000+ button.
  `WordCloud.tsx:28-33 · App.tsx:103-175`
- [ ] Fuzzy scan: chỉ chạy khi exact rỗng + epoch cancel + batch getAll (hiện
  quét toàn store 150-200k row sau MỖI lượt tra, không cancel).
  `yomitan.ts:532-544 · useLookup.ts:54-63`
- [ ] Epoch cho confirm() (kết quả tra cũ về muộn đè kết quả mới — idiom epoch
  đã có sẵn cho suggest). `SearchBar.tsx:77-89`
- [ ] Promise.all các candidate + metaForTerm (hiện ~30+ await tuần tự cho từ
  chia mạnh). `yomitan.ts:446-478`
- [ ] Import từ điển: bỏ await từng put (chỉ await tx.done) + yield giữa bank +
  progress % (hiện treo UI hàng chục giây). `yomitan.ts:143,274-279`
- [ ] Lazy JSZip (dynamic import) + React.lazy các màn phụ (DictionaryManager,
  CustomDictionary, ThemeSettings, KanjiStats, VocabStudy) — chunk chính hiện
  433kB/160kB gzip. `App.tsx:6-41 · yomitan.ts:13`
- [ ] getAllEntries dùng IDBKeyRange theo user_id thay vì đọc cả store rồi
  filter JS. `repository.ts:10-14`
- [ ] Tick phút (hoặc visibilitychange) cho dueEntries — tab để mở thì đếm due
  đứng yên. `store.ts:144-147`

### Quick wins lặt vặt (mỗi cái <1h)
- [ ] Persist cặp ngôn ngữ như đã làm với nguồn (`gioitu.dictPair.v1`).
  `App.tsx:142`
- [ ] Key React đồng âm `${term}:${reading}` ở SearchBar:166 + InstantActions:69.
- [ ] Input tìm: `lang={pair.source}`, `enterkeyhint="search"`,
  autoCapitalize/autoCorrect off. `SearchBar.tsx:146-154`
- [ ] Đổi "+" thành nút có nhãn "＋ Học từ này"; sửa empty state WordCloud:36
  ("Hãy tra một từ" → tra + bấm ＋); sửa phản hồi "+" bị debounce nuốt nhưng
  vẫn hiện ✓ (recordLookup trả events lên UI). `DetailPanel.tsx:346-394`
- [ ] Import zip client: tin `index.json` khi có sourceLanguage/targetLanguage,
  cảnh báo khi lệch cặp đang chọn (hiện gán mù cặp UI → từ điển "biến mất").
  `DictionaryImport.tsx:73-86 · yomitan.ts:101-102`
- [ ] Loading state khi confirm tra (nguồn server tới 12 round-trip tuần tự —
  song song hoá luôn bằng Promise.all). `sources.ts:41-63`
- [ ] Đổi heading "Instant Action" → tiếng Việt. `InstantActions.tsx:61`
- [ ] Touch target pointer:coarse: .tag ≥44px, .radical-btn/.kanji-cell nới,
  .tag-delete to hơn hoặc undo-toast (xoá đang không confirm).
  `styles.css:306-323,1035-1041`
- [ ] Tooltip tag cloud: reading · nghĩa đầu · "ôn sau X" (hiện chỉ "Tra N lần").
  `WordCloud.tsx:49,70`
- [ ] xml2js chuyển xuống optionalDependencies (chỉ server dùng). `package.json:22`

## Giai đoạn 2 — "Nhịp ngày" (~2–3 tuần)

Mở app là thấy việc hôm nay. IA đích: [DESIGN.md §IA](./DESIGN.md).

- [ ] Routing History API (không cần thư viện): 4 khu + `/word/:lang/:term`
  deep-link + push history khi mở overlay (back đóng overlay thay vì thoát
  app — hiện toàn useState, F5 mất chỗ). `App.tsx:158-174`
- [ ] Bottom tab bar mobile (<760px) / sidebar desktop; bỏ dồn hết vào ☰
  (hiện 9-11 mục phẳng trộn 4 loại khái niệm). `App.tsx:231-253`
- [ ] Màn "Hôm nay": hero "N từ đến hạn · ~X phút" → vào phiên; streak (store
  activity_log nhẹ, sync best-effort); dải hoạt động 7 ngày; 3 từ hay quên.
- [ ] Due badge: `document.title` + `navigator.setAppBadge` (PWA sẵn).
- [ ] Onboarding first-run 3 bước + nút "Tải từ điển đề xuất" một chạm
  (importYomitanUrl có sẵn; host zip trên chính server để khỏi vướng CORS).
- [ ] Đếm "Đã thuộc (N)" thường trực (menu hiện chỉ xuất hiện khi N>0);
  trường `learned_at` để trang Đã thuộc nhóm đúng theo thời điểm thuộc (hiện
  nhóm theo last_lookup_at — kể sai câu chuyện). `App.tsx:238-240 ·
  LearnedCloud.tsx:66`
- [ ] Merge theo field: lookup_count = max, lapses = max, LWW phần thẻ SM-2
  (hiện LWW nguyên entry → 2 thiết bị cùng học 1 từ là mất lượt của bên thua).
  `repository.ts:62-72 · syncStore.ts:31-36`
- [ ] Hỏi trước khi adopt guest data (máy dùng chung trộn dữ liệu người khác).
  `App.tsx:53-67`
- [ ] Trang "Từ điển của tôi" hợp nhất (Đã cài · Tự soạn · Chia sẻ) — hiện
  "thêm 1 từ" có 5 cửa, "quản lý từ điển" 3 màn, ShareDialog gần như không
  thể khám phá. Thực thi quyết định mở #3 (study list).
- [ ] Nhất quán tường đăng nhập cho guest: nhãn 🔒 tại menu thay vì nửa
  mời-rồi-chặn nửa giấu hẳn. `AddToListButton.tsx:16 · YomitanSync.tsx:55-62`
- [ ] SW: precache chunk lazy theo manifest build (hoặc vite-plugin-pwa);
  catch cho loadRadicalData (hiện offline bấm Bộ thủ treo "Đang tải…" vĩnh
  viễn); dọn ASSET_CACHE cũ sau activate. `sw.js:9-12,28-36,76-92 ·
  RadicalPicker.tsx:19-25`
- [ ] VocabStudy: bỏ double-click (không ổn định trên touch, click đơn trễ
  250ms, không undo) → pattern "Đánh dấu nhanh" như KanjiStats + toast undo.
  `VocabStudy.tsx:366-417`

## Giai đoạn 3 — "Khu vườn & phần thưởng" (~3 tuần)

- [ ] Khu vườn ký ức: grouping "srs" 3 tầng (Sắp quên/Đang bén rễ/Sắp trưởng
  thành) + nút "Ôn N từ này" theo tầng + popover mini + long-press quick
  actions thay deleteMode toàn cục. `domain/wordcloud.ts`
- [ ] Swipe 4 hướng + haptic cho phiên ôn (route full-screen thay modal);
  hiệu ứng tốt nghiệp (dấu son 合格).
- [ ] Chia sẻ Word Cloud/kanji grid ra PNG client-side (canvas) — hiện không
  có gì để khoe, share duy nhất là link zip sống 5 phút.
- [ ] Skin anime = bộ sưu tập gắn streak (chỉ đổi backdrop+heatmap, không đụng
  token chữ/nền; glyph relapse giữ họ cảnh báo — hiện 🐾/💢 làm nhoè tín hiệu).
  `theme.ts:154,187 · WordCloud.tsx:31`
- [ ] Thống kê từ review_log: retention chart, forecast 7 ngày, số từ thuộc
  theo thời gian. Nền cho FSRS (đổi scheduler khi đủ log).
- [ ] Chế độ luyện chủ động tuỳ chọn: gõ cách đọc kana trước khi lật / đảo
  chiều nghĩa→từ (self-grade hiện dễ "ảo giác đã biết").
- [ ] Premium chuyển sang giá trị retention (stats nâng cao, backup lịch sử,
  AI ví dụ — hạ tầng Deepseek có sẵn); viết lại modal thành trang giá trị.
- [ ] LWW: server đóng dấu received_at làm tie-breaker chống lệch đồng hồ;
  custom dict merge term-level thay vì nguyên blob.
  `syncStore.ts:36 · customDictSync.ts:48-82`

## Nợ tài liệu & dọn dẹp

- [ ] FEATURES.md: bổ sung ~8 tính năng vắng mặt chi tiết hơn (đã có inventory
  tóm tắt ở §10) — coi "thêm mục FEATURES.md" là cổng review mỗi PR tính năng.
- [ ] Tách styles.css (1089 dòng) theo feature như preset đã làm; quét selector
  chết (.source-toggle). `styles.css:1036`
- [ ] Sửa comment sai: App.tsx:229-230 (mô tả hàng nút desktop không tồn tại),
  languages.ts:27 ("// Anh → Việt" cho DEFAULT_PAIR ja-vi).
