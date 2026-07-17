# Logic nghiệp vụ — gioitu

> Tài liệu này mô tả **logic thuần** của hệ thống: SRS (SM-2), gating tra cứu,
> Word Cloud, deinflection, import Yomitan, structured content, furigana và merge
> đồng bộ. Toàn bộ logic dưới đây là **pure function** (không I/O, `now` do
> caller truyền vào) nên kiểm thử được độc lập — xem `test/`.
>
> Kiến trúc tổng thể: [ARCHITECTURE.md](./ARCHITECTURE.md). Lược đồ lưu trữ:
> [DB_SCHEMA.md](./DB_SCHEMA.md).

## 1. Triết lý & 9 ràng buộc SPEC

Triết lý gốc: *một lần tra cứu là tín hiệu của sự quên* — một từ chỉ "đáng
học" sau khi bị tra **lại** (≥ 2 lần).

> **⚠️ Hành vi hiện tại (07/2026) đã rời SPEC ở điểm này**: tra cứu thường
> (Enter / chọn gợi ý / link nội bộ `?query=`) **không được ghi nhận**; chỉ nút
> **`＋`** (và lưu định nghĩa tự tạo) mới gọi `registerLookup`, và lượt `＋`
> đầu tiên tạo entry **kèm thẻ SRS ngay** — không còn cổng ≥ 2.
> `SRS_GATING_THRESHOLD` chỉ còn "heal" entry cũ chưa có thẻ. Việc có khôi
> phục đếm lượt tra thụ động hay không là **quyết định mở** — xem
> [BACKLOG.md](./BACKLOG.md). Bảng dưới đánh dấu ⚠️ những hàng đã lệch.

| # | Ràng buộc | Nơi cài đặt |
|---|---|---|
| 1 | ⚠️ `lookup_count` chỉ tăng qua `＋`/lưu tự định nghĩa (tra thường không đếm), debounce 2s | `app/useLookup.ts`, `review/domain/lookup.ts`, `LOOKUP_DEBOUNCE_MS` |
| 2 | ⚠️ Thẻ SRS tạo ngay lượt `＋` đầu ("no gating"); `SRS_GATING_THRESHOLD` chỉ heal entry legacy | `lookup.ts` |
| 3 | Màu tag = log-normalized `lookup_count`, độc lập SRS | `wordcloud.computeShade` |
| 4 | Hiển thị theo `status`: `LEARNED` ẩn, `LEARNING`/`RELAPSED` hiện | `wordcloud.isVisibleOnCloud` |
| 5 | `RELAPSED` = logic `LEARNING` + huy hiệu cảnh báo | `srs.ts`, `WordCloud.tsx` |
| 6 | ⚠️ Relapse chỉ khi `＋` lại một từ `LEARNED` (tra thường không kích hoạt); reset như "Again" | `lookup.ts` + `srs.relapse` |
| 7 | Tốt nghiệp `→ LEARNED` theo ngưỡng `srs_interval ≥ 21 ngày`, không bằng nút bấm | `srs.gradeCard` |
| 8 | `ease_factor` kẹp `≥ 1.3` | `srs.clampEase` |
| 9 | Cloud DB là chân lý; IndexedDB cache; last-write-wins theo `updated_at` | `repository.ts`, `syncStore.ts` |

## 2. Mô hình dữ liệu lõi — `VocabEntry`

`src/shared/types.ts`. Khoá duy nhất: `(user_id, term, term_lang)`.

```ts
type WordStatus = "LEARNING" | "LEARNED" | "RELAPSED";   // vòng đời (SPEC 4.2)
type CardState  = "NEW" | "LEARNING" | "REVIEW";          // trạng thái thẻ SM-2
type ReviewGrade = "again" | "hard" | "good" | "easy";    // nút tự chấm

interface VocabEntry {
  user_id: string;
  term: string;
  term_lang: string;        // ISO 639-1: "ja" | "en" | "vi"
  native_lang: string;
  meaning: string;          // JSON/text từ Yomitan hoặc người dùng nhập
  is_custom: boolean;

  lookup_count: number;
  last_lookup_at: number;   // epoch ms — phục vụ debounce & time-decay tuỳ chọn

  status: WordStatus;

  // --- trường thẻ SM-2 ---
  card_state: CardState | null;  // null cho tới khi thẻ được tạo (gating)
  learning_step: number;         // chỉ số trong learning/relearning steps
  ease_factor: number;           // mặc định 2.5, sàn 1.3
  reps: number;                  // số lần ôn đúng liên tiếp
  lapses: number;                // số lần "Again"/relapse
  is_relearning: boolean;        // đang trong relearning steps? (chọn steps đúng)
  srs_interval: number;          // khoảng hiện tại, đơn vị PHÚT
  next_review: number | null;    // epoch ms lần ôn kế (null tới khi có thẻ)
  lapsed_from_interval?: number; // interval trước lapse gần nhất (khôi phục sau relearning)

  // --- override vòng đời (vuông góc với thẻ SM-2 ở trên) ---
  deleted_at: number | null;     // tombstone: xoá mềm, giữ lại để bản xoá thắng LWW sync

  created_at: number;
  updated_at: number;
}
```

**Override vòng đời (`domain/lifecycle.ts`).** `deleted_at` *không* đụng tới thẻ
SM-2. `softDelete` là hàm thuần trả patch (cùng idiom `gradeCard`). Lọc:
`isVisibleOnCloud` và `isReviewable` loại từ đã xoá; `store` thả tombstone khỏi
danh sách hiển thị nhưng vẫn `putEntry` để bản xoá đồng bộ lên cloud. **Tra lại
một từ đã xoá** ⇒ `registerLookup` coi như chưa từng thấy → tạo entry mới (hồi
sinh, `updated_at = now` thắng tombstone). "Đã nhớ" (`srs.markKnown`) tốt nghiệp
thẳng lên `LEARNED` để hiện trên trang **Đã thuộc** và ẩn khỏi cloud chính.

**Ghi chú đơn vị (quan trọng):** `srs_interval` luôn lưu bằng **phút** để learning
steps (1, 10 phút) và review intervals (ngày × 1440) dùng chung một đơn vị. UI mới
quy đổi sang đơn vị thân thiện. `is_relearning` không có trong bảng SPEC nhưng cần
để chọn `relearningSteps` vs `learningSteps` cho trung thực.

## 3. Orchestration tra cứu — `registerLookup`

`src/features/review/domain/lookup.ts`. Pure: nhận entry hiện có (hoặc
`undefined`), input và `now`; trả entry kế + tập **sự kiện** để UI hiện toast.
Không bao giờ mutate input.

**Ai gọi (quan trọng):** chỉ hai đường trong `app/useLookup.ts` gọi
`recordLookup` → `registerLookup`: nút **`＋`** trên một kết quả
(`addResult`) và **lưu định nghĩa tự tạo** (`onSaveCustom`). Tra cứu thường
(`onResult` khi Enter/chọn gợi ý, và `lookup()` cho link nội bộ `?query=`)
**không** ghi nhận gì. Xem lại từ trên cloud (`onSelectTag`) cũng không.

```
registerLookup(existing, input, now):

 ┌─ existing == undefined? (lần đầu thấy term) ────────────────────┐
 │   tạo entry mới KÈM THẺ NGAY: lookup_count = 1, status = LEARNING│
 │   + newCardState(now)  ("no gating" — không chờ lượt thứ 2)      │
 │   → events: { created:✓, counted:✓, cardCreated:✓, relapsed:✗ } │
 └──────────────────────────────────────────────────────────────────┘
 ┌─ debounce: now - last_lookup_at < 2000ms  và KHÔNG manualAdd? ──┐
 │   → no-op, KHÔNG đếm (kể cả cập nhật meaning)                    │
 │   → events: tất cả false                                        │
 └──────────────────────────────────────────────────────────────────┘
 ┌─ ngược lại (đếm lượt) ───────────────────────────────────────────┐
 │   lookup_count += 1; last_lookup_at = now; updated_at = now      │
 │   cập nhật meaning/is_custom nếu input có                        │
 │                                                                  │
 │   • nếu status == LEARNED  → relapse(entry, now)  (relapsed=✓)   │
 │   • else nếu chưa có thẻ (entry legacy) và                       │
 │     (lookup_count ≥ SRS_GATING_THRESHOLD hoặc manualAdd)         │
 │            → newCardState(now)  (cardCreated=✓)  ["legacy heal"] │
 └──────────────────────────────────────────────────────────────────┘
```

`manualAdd` (người dùng bấm `＋`) khẳng định ý định học và **không** bị
debounce. Vì entry mới nào cũng có thẻ ngay, nhánh gating ≥ 2 chỉ còn tác
dụng "heal" entry cũ tồn tại từ trước khi bỏ gating.

Sự kiện trả về (`LookupResult.events`):

| Cờ | Ý nghĩa |
|---|---|
| `created` | Lần đầu thấy term này |
| `counted` | `lookup_count` thực sự được tăng (không bị debounce) |
| `cardCreated` | Thẻ SRS được tạo ở lượt này (đạt ngưỡng gating) |
| `relapsed` | Một từ `LEARNED` bị relapse bởi lượt tra này |

Hằng số (`review/domain/constants.ts`): `LOOKUP_DEBOUNCE_MS = 2000`,
`SRS_GATING_THRESHOLD = 2`.

## 4. Engine SM-2 — `srs.ts`

`src/features/review/domain/srs.ts`. Pure, không `Date.now()`. Tất cả khoảng
thời gian tính bằng **phút**.

### 4.1 Tham số mặc định (`DEFAULT_SRS_CONFIG`)

```
learningSteps          = [1, 10]      phút
relearningSteps        = [10]         phút
graduatingInterval     = 1 ngày  (1440 phút)   ← "Good" từ step cuối
easyInterval           = 4 ngày  (5760 phút)   ← "Easy" khi đang learning
matureThreshold        = 21 ngày (30240 phút)  ← ngưỡng → LEARNED
maxInterval            = 365 ngày (525600 phút) ← trần cứng interval REVIEW (= knownInterval)
initialEaseFactor      = 2.5
minEaseFactor          = 1.3          ← sàn cứng (ràng buộc 8)
hardIntervalMultiplier = 1.2          ← "Hard" trong REVIEW
easyBonus              = 1.3          ← nhân thêm khi "Easy" trong REVIEW
lapseIntervalMultiplier= 0.5          ← khôi phục % interval trước lapse khi tốt nghiệp khỏi relearning
lapseMinInterval       = 1 ngày (1440 phút)    ← sàn interval khôi phục sau lapse
againEaseDelta         = -0.20
hardEaseDelta          = -0.15
easyEaseDelta          = +0.15
fuzzRatio              = 0.05         ← biên ±5% xê dịch interval REVIEW (rải ngày đến hạn)
minFuzzInterval        = 1 ngày (1440 phút)    ← sàn để fuzz; step nhỏ hơn không xê dịch
```

### 4.2 Thẻ mới — `newCardState(now)`

```
status = LEARNING, card_state = NEW, learning_step = 0,
ease_factor = 2.5, reps = 0, lapses = 0, is_relearning = false,
srs_interval = 0, next_review = now   (xếp lịch ngay)
```

### 4.3 Chấm thẻ — `gradeCard(entry, grade, now, rng?)`

Ném lỗi nếu `card_state == null` (chưa có thẻ). Trình tự:

**Bước A — bộ đếm `reps` (áp dụng mọi pha):**

`good`/`easy` → `reps += 1`. `reps` chỉ là bộ đếm số lần nhớ được, không phải
nguồn gốc "ease hell" nên độc lập với pha. **Ease KHÔNG đổi ở đây** — chỉ đổi
trong pha REVIEW (Bước B), giống Anki: learning/relearning steps không bao giờ
đụng ease, tránh trừ ease từ trước khi thẻ được ôn thật.

**Bước B — chuyển trạng thái theo pha.**

Pha *Learning* (`card_state ∈ {NEW, LEARNING}`), chọn `steps = is_relearning ?
relearningSteps : learningSteps`, `curStep = NEW ? 0 : learning_step`. **Ease
không đổi trong pha này.**

| Grade | Kết quả |
|---|---|
| `again` | `LEARNING`, step 0, `interval = steps[0]` |
| `hard` | `LEARNING`, lặp lại step hiện tại, `interval = steps[min(curStep, len-1)]` |
| `good` | nếu `curStep+1 >= len` → **tốt nghiệp** `REVIEW`, `interval = graduationInterval(...)`; ngược lại `LEARNING` step `curStep+1` |
| `easy` | **tốt nghiệp ngay** `REVIEW`, `interval = graduationInterval(...)` |

`graduationInterval` (interval khi RỜI phase learning/relearning): learning lần
đầu → `easyInterval` cho `easy`, `graduatingInterval` cho `good`. Relearning (thẻ
đã lapse) → **khôi phục** `max(lapseMinInterval, lapsed_from_interval ×
lapseIntervalMultiplier)`; thẻ relearning cũ chưa có `lapsed_from_interval` rơi
về `graduatingInterval` (đúng hành vi cũ). `lapsed_from_interval` được tiêu thụ
(xoá) khi tốt nghiệp.

Pha *Review* (`card_state == REVIEW`), `prev = srs_interval`. **Chỉ pha này đổi
ease**, sau đó `ef = max(ef, 1.3)` (kẹp sàn):

| Grade | Kết quả |
|---|---|
| `again` | `ef += -0.20`, `lapses += 1`, về `LEARNING`, `is_relearning = true`, step 0, `interval = relearningSteps[0]`, **`lapsed_from_interval = prev`** |
| `hard` | `ef += -0.15`, `REVIEW`, `interval = prev × 1.2` |
| `good` | `REVIEW`, `interval = prev × ef` |
| `easy` | `ef += +0.15`, `REVIEW`, `interval = prev × ef × 1.3` |

**Bước C — chuẩn hoá & trạng thái vòng đời:**

```
// Fuzz (chỉ khi caller truyền rng và thẻ vào REVIEW): interval tất định khiến
// thẻ tạo/ôn cùng ngày cứ due cùng ngày → xê dịch ±fuzzRatio quanh giá trị gốc
// để tản phiên ôn. rng()∈[0,1), map 0.5→giữ nguyên. Chỉ interval ≥ minFuzzInterval
// mới fuzz (bỏ qua learning/relearning step). KHÔNG rng → tất định như cũ.
if (rng && card_state == REVIEW && interval ≥ minFuzzInterval)
    interval *= 1 + (rng() - 0.5) × 2 × fuzzRatio

interval = min(interval, maxInterval)        // trần cứng (fuzz xong vẫn ≤ trần)
interval = max(1, round(interval))           // tối thiểu 1 phút khi đã có thẻ
next_review = now + interval × 60000          // ms

if (card_state == REVIEW && interval ≥ matureThreshold)  status = LEARNED   // ràng buộc 7
else if (status == LEARNED)                              status = RELAPSED  // mature rớt ngưỡng
else if (status != RELAPSED)                             status = LEARNING
// (RELAPSED còn non → giữ RELAPSED, huy hiệu còn nguyên)
```

### 4.4 Relapse — `relapse(entry, now)`

Khi một từ `LEARNED` bị "chạm" lại qua tra cứu (SPEC 4.2). Một từ `LEARNED` là
thẻ REVIEW đã chín, nên hành xử như "Again" trong REVIEW (kể cả trừ ease):

```
ease_factor = max(ease_factor - 0.20, 1.3)
status = RELAPSED, card_state = LEARNING, is_relearning = true,
learning_step = 0, reps = 0, lapses += 1,
srs_interval = relearningSteps[0] (= 10 phút),
next_review = now + 10×60000,
lapsed_from_interval = srs_interval  (nhớ để khôi phục khi tốt nghiệp lại)
```

### 4.5 Đến hạn — `isDue(entry, now)`

`card_state != null && next_review != null && next_review ≤ now`.

### 4.6 Nhật ký ôn tập — `review_log` (append-only)

Mỗi lượt chấm thẻ trong phiên ôn (`store.gradeReview`) ghi đúng **một dòng**
`ReviewLogEntry` vào IndexedDB, **không bao giờ sửa/xoá** — điều kiện tiên quyết
cho thống kê (retention/forecast) và FSRS về sau. Tách trách nhiệm đúng lớp:

- **domain** (`review/domain/reviewLog.ts`): `buildReviewLogEntry(before, after,
  grade, ts)` thuần — chỉ dựng bản ghi, lấy `interval_before` từ thẻ cũ và
  `interval_after` từ thẻ đã `gradeCard`. Test được không cần IndexedDB.
- **data** (`review/data/reviewLog.ts`): `appendReviewLog` (dùng `add`, không
  `put`, đúng nghĩa append-only) và `getReviewLog(user_id)` (đọc qua index
  `by_user_ts`, sắp theo `ts`).
- **state** (`store.gradeReview`): sau khi `putEntry(next)`, ghi log **best-
  effort** — lỗi ghi log bị `console.error` và bỏ qua, KHÔNG làm hỏng luồng chấm.

`undoReview` **không** đụng `review_log`: lượt chấm đã thực sự xảy ra và nhật ký
là append-only, nên để nguyên dòng đã ghi (undo hiếm; append dòng "đảo" sẽ đếm
trùng, xoá thì phá vỡ append-only). Phạm vi hiện tại: chỉ log lượt chấm trong
phiên ôn (chưa log relapse-do-tra-cứu/markKnown), **cục bộ, chưa đồng bộ cloud**.

### 4.7 Phiên ôn — thứ tự & phân lô (`session.ts`)

`src/features/review/domain/session.ts`. Pure — UI giữ phần async (chấm/ghi) rồi
đưa entry đã chấm trở lại. Hàng đợi đến hạn của store (`dueEntries`) là danh sách
dẫn xuất **sống** (chấm một thẻ đẩy `next_review` ra tương lai nên thẻ rơi khỏi
danh sách), nên phiên ôn **chụp một lần** lúc mở rồi tự quản con trỏ.

- **Thứ tự phục vụ** — `orderSession(due, rng)`: xáo trộn (Fisher–Yates) để phá
  đơn điệu, rồi **stable-sort tăng dần theo `next_review`** ⇒ thẻ **quá hạn lâu
  nhất lên trước** (thẻ hoà, vd cùng đến hạn "ngay bây giờ", đổi thứ tự mỗi phiên).
- **Phân lô** — `startSession(due, rng, batchSize = REVIEW_BATCH_SIZE)`: xếp thứ
  tự **cả** danh sách RỒI mới cắt lô, nên lô đầu (`queue`) luôn gồm
  `REVIEW_BATCH_SIZE` (=20) thẻ cấp thiết nhất; phần còn lại nằm ở `pending`.
  `batchSize ≤ 0` = không chia lô (một lô chứa tất cả). Danh sách ≤ 20 ⇒ `pending`
  rỗng, không có bước hỏi thừa.
- **Hết lô** — `hasNextBatch(s)` (còn `pending`?), `nextBatchSize(s)` (số thẻ lô
  kế, lô cuối có thể < 20), `loadNextBatch(s)` (kéo lô kế vào `queue`). `reviewed`
  **cộng dồn** cả phiên; `loadNextBatch` **xoá `history`** ⇒ hoàn tác không vượt
  ranh giới lô. UI hiện lời mời "Ôn tiếp N thẻ nữa?" giữa hai lô.
- **Con trỏ & re-queue** — `currentCard(s)` = `queue[0]`; `applyGrade(s, graded)`
  bỏ thẻ vừa chấm, `shouldRequeue` (thẻ còn `card_state === "LEARNING"`) thì chèn
  lại **cuối `queue`** (trong cùng lô, không đẩy sang `pending`) để ôn nốt bước
  ngắn mà không gặp lại ngay; `undoGrade` khôi phục ảnh chụp trước lượt chấm.

Hằng số (`review/domain/constants.ts`): `REVIEW_BATCH_SIZE = 20`.

## 5. Word Cloud — `wordcloud.ts`

`src/features/review/domain/wordcloud.ts`. Màu **chỉ** phụ thuộc `lookup_count`
(độc lập SRS); khả kiến phụ thuộc `status`.

- **Khả kiến** — `isVisibleOnCloud(entry)`: `true` khi `status ∈ {LEARNING,
  RELAPSED}`. `LEARNED` (mature) bị **ẩn** để nhường chỗ (ràng buộc 4).
- **Trọng số** — `effectiveCount(entry, opts)`: mặc định trả `lookup_count`. Bật
  `timeDecay` thì `lookup_count × e^(-λ·days)` với `λ` mặc định `0.05` (time-decay
  của SPEC 4.3, **tắt mặc định** ở v1).
- **Sắc độ** — `computeShade(count, maxCount)` (ràng buộc 3):
  ```
  shade = log(1 + count) / log(1 + maxCount)   ∈ [0,1]
  ```
  `maxCount` là max trong các từ **đang hiển thị**, tính lại mỗi lần render.
- **Dựng đám mây** — `buildCloud(entries, opts)`:
  1. lọc còn từ khả kiến,
  2. sắp xếp (`recent` mặc định = tra gần nhất trước; hoặc `frequency` =
     `lookup_count` cao trước, tie-break theo gần đây),
  3. tính `maxCount` rồi suy ra mỗi tag `{ shade, hasBadge, due }`.
  `hasBadge = status === RELAPSED` (ràng buộc 5); `due = isDue(entry, now)`.

Ánh xạ `shade → màu` nằm ở feature `theme` (`heatBackground`/`heatTextColor`) nên
heatmap bám theo bảng màu người dùng.

## 6. Deinflection — `deinflect.ts`

`src/features/dictionary/domain/deinflect.ts`. Port thuật toán deinflection cổ
điển của Yomichan: **tìm kiếm theo bề rộng trên các luật viết-lại hậu tố**, ràng
buộc bằng cờ bit *word-type*, vừa đi vừa ghi lại chuỗi lý do ngữ pháp.

### 6.1 Cấu trúc dữ liệu

```ts
RULE = { v1, v5, vs, vk, adji, te }   // cờ bit word-type (te là pseudo: て/で)

interface Rule {
  reason: string;     // "polite" | "passive" | "causative" | …
  kanaIn: string;     // hậu tố cần bỏ
  kanaOut: string;    // hậu tố thêm vào
  rulesIn: number;    // bit: word-type ĐƯỢC PHÉP áp luật này
  rulesOut: number;   // bit: word-type SAU khi áp
}

interface Deinflection {
  term: string;       // dạng ứng viên
  reasons: string[];  // chuỗi lý do, ngoài-vào-trong
  rules: number;      // bit word-type ứng viên phải thoả
}
```

### 6.2 Thuật toán

```
deinflect(source):
  results = [{ term: source, reasons: [], rules: 0 }]   // luôn có identity đầu tiên
  với mỗi result đang có, thử mọi Rule:
     áp dụng khi  (rules == 0  hoặc  rules & rulesIn != 0)  và  term.endsWith(kanaIn)
     → newTerm   = term[..-kanaIn] + kanaOut
       newReasons = [...reasons, rule.reason]
       newRules   = rulesOut
  mở rộng tới khi không thêm được, hoặc đạt MAX_RESULTS = 256
```

Ví dụ `食べさせられました → 食べる`: polite (ました→) → passive (られ→) →
causative (させ→), reasons = `["polite","passive","causative"]`.

Các họ luật: polite (ます…), past (た/だ), て-connective (pseudo `te`),
progressive (ている/てる), negative (ない), potential/passive (られる/れる),
causative (させる/せる), -tara/-tari, -chau, -nakya, và **bảng godan** theo cột
(i/a/e/o/dict) để sinh luật cho mọi cột động từ nhóm 5.

### 6.3 Gating theo word-type

- `parseEntryRules(rules)` đọc trường `rules` của Yomitan term bank ("v5k vt",
  "adj-i"…) → OR các cờ `RULE`.
- `rulesMatchEntry(candidateRules, entryRules)`:
  - `candidateRules == 0` (identity) → **nhận**,
  - entry không có rule (0) → **nhận** (không lọc khi không biết loại),
  - ngược lại cần `candidateRules & entryRules != 0`.

Gating chặn dương tính giả: ứng viên mang `v5` (godan) không khớp entry `v1`
(ichidan), nên `食べ` không bị nhận nhầm là động từ nhóm 5.

### 6.4 Tiếng Anh & API hợp nhất

`deinflectEnglish(source)` áp luật nhẹ: số nhiều (-ies→y, -es, -s), quá khứ (-ed,
-ied), -ing, so sánh (-er, -est), nhân đôi phụ âm ("stopped"→"stop"). `candidates(
text, lang)` định tuyến: `ja → deinflect`, `en → deinflectEnglish`, còn lại trả
identity.

## 7. Tra cứu giàu — `findTerms` (IndexedDB)

`src/features/dictionary/data/yomitan.ts` (đường client):

1. `candidates(text, term_lang)` → các dạng đã deinflect.
2. Với mỗi candidate, lấy mọi entry `entriesForTerm(term, term_lang,
   native_lang)` (gồm cả đồng âm khác cách đọc).
3. Lọc theo `rulesMatchEntry` (gating word-type).
4. Khử trùng theo `[term, reading]`, giữ candidate có **ít lý do nhất**.
5. Xếp hạng: độ dài chuỗi biến cách tăng dần, rồi `score` giảm dần.
6. Đính kèm IPA từ `term_meta` (xem §10).

Từ được theo dõi trong SRS là **lemma** (`primaryTerm`), không phải bề mặt gõ.

## 8. Import Yomitan — pipeline

`src/features/dictionary/data/yomitan.ts`. Parse Yomitan v3 `.zip` (qua JSZip),
**giữ nguyên structured content** thay vì flatten:

| File trong zip | Vai trò |
|---|---|
| `index.json` | `{ title, revision, sourceLanguage, targetLanguage }` — suy ra cặp ngôn ngữ (mặc định `en→vi`) |
| `term_bank_*.json` | Mảng entry: `[term, reading, definitionTags, rules, score, glossary[], sequence, termTags]` |
| `tag_bank_*.json` | `[name, category, order, notes, score]` — phân giải tag code → tên/nhóm |
| `term_meta_bank_*.json` | `[term, mode, data]`, `mode ∈ {ipa, pitch, freq}` |

Logic gộp:
- Entry keyed `JSON.stringify([term, reading])`. Cùng `(term, reading)` → **gộp
  sense** (thêm vào `senses[]` và `definitions[]`, hợp `termTags`, giữ `rules`
  đầu, lấy `score` lớn nhất). Cách đọc khác → **entry riêng** (đồng âm không đè
  nhau).
- Sau khi parse hết, phân giải mọi tag code (sense + term) qua `tag_bank` →
  `tagMeta: Record<code, ResolvedTag>`.
- Mỗi lần import sinh `dictId` (UUID) và ghi 3 store trong một transaction:
  `terms`, `term_meta`, và `dictionaries` (registry: title, đếm term/meta,
  `importedAt`, `revision`).

Backend cũng import được URL (`POST /api/dict/import-url`) và zip (`POST
/api/dict/import`), nhưng đường server lưu **plain-text** (xem [DB_SCHEMA.md](./DB_SCHEMA.md)).

## 9. Structured content — `structured-content.ts`

`src/shared/structured-content.ts`. Mô hình glossary của Yomitan và bộ flatten.

```ts
type SCNode = string | number | null | undefined | SCNode[] | SCElement;
interface SCElement { tag: string; content?: SCNode; href?; path?; alt?; style?; … }

type GlossaryNode =
  | string
  | { type: "text"; text: string }
  | { type: "image"; path?; alt?; … }
  | { type: "structured-content"; content: SCNode }
  | { type: string; … };

interface Sense { tags: string[]; glossary: GlossaryNode[]; dictionary?: string; }
interface ResolvedTag { code; name; category; notes?; }
```

Bộ flatten (dùng khi cần text thuần, ví dụ lưu `meaning`):

- `glossToText(node)` — flatten một item; với từ điển kiểu Wiktionary, tìm section
  `content === "glosses"` và chỉ lấy định nghĩa, bỏ nhiễu (`backlink`,
  `attribution`, `tag`); ảnh → `[alt]`.
- `glossaryToLines(glossary)` — flatten mảng thành các dòng (mỗi sense một dòng);
  với Wiktionary, mỗi mục trong section `glosses` thành một dòng riêng.
- `sensesToLines(senses)` — gọi `glossaryToLines` cho từng sense.
- `normalizeText` gom whitespace, gộp dòng trống, khử trùng dòng.
- `isStructured(node)` — UI dùng để chọn render giàu vs text thuần.

`useLookup` lưu `meaning` = `JSON.stringify(sensesToLines(...) || glossaryToLines(...))`.

## 10. Term-meta (IPA/pitch/freq) — `term-meta.ts`

`src/shared/term-meta.ts`.

```ts
type TermMetaMode = "ipa" | "pitch" | "freq";
interface IpaTranscription { ipa: string; tags?: string[]; }   // tags vd ["Hanoi"]
interface IpaMetaData { reading: string; transcriptions: IpaTranscription[]; }
interface TermMetaEntry { term; reading; mode; data; term_lang; native_lang; dictId?; dictionary?; }
interface Pronunciation { dictionary?: string; transcriptions: IpaTranscription[]; }
```

`ipaPronunciations(meta, reading?)`: lọc `mode === "ipa"`; nếu entry có `reading`,
ưu tiên dòng cùng reading (không có thì lấy mọi dòng IPA của term); trả mảng
`Pronunciation` (một mục/từ điển). Nhờ tách store riêng, một từ điển **chỉ meta**
(vd `wty-ja-vi-ipa`, `termCount = 0`) vẫn làm giàu IPA cho entry headword lúc tra.

## 11. Furigana — `japanese.ts`

`src/shared/japanese.ts`. `distributeFurigana(term, reading)` phân bổ ruby chính
xác cả khi okurigana nằm giữa (`食べ物` → `食(た)べ物(もの)`, không phải
`食べ物(たべもの)`):

1. Tách `term` thành **run** kana / kanji liền nhau (chuẩn hoá katakana→hiragana).
2. Đệ quy `segmentize`: run kana phải khớp đầu reading (kana trần giữ trần); run
   kanji thử mọi điểm cắt reading (dài→ngắn) rồi đệ quy phần đuôi; nếu **>1 cách
   cắt hợp lệ** → trả `null` (mơ hồ).
3. Mơ hồ/thất bại → fallback một ruby cho cả từ `[{ text: term, reading }]`.

Trả `FuriganaSegment[]` (`{ text, reading? }`, không có `reading` nghĩa là
okurigana trần). `DetailPanel`/`StructuredContent` render thành ruby.

## 12. Merge đồng bộ (Last-Write-Wins)

`src/features/review/data/repository.ts`. Pure & test được:

```
mergeByUpdatedAt(a, b):
  với mỗi entry trong [...a, ...b] keyed (user_id, term, term_lang):
     giữ bản có updated_at LỚN HƠN (>= → bản sau thắng khi bằng)
```

`syncUserData(user_id)`: pull remote → merge LWW với local → ghi merged xuống
IndexedDB → push merged lên (server cũng LWW). Offline/guest → `pullUserData`
trả `null` → trả local, no-op.

`reassignEntries(from, to)`: di trú entry guest sang tài khoản mới khi đăng nhập
lần đầu, LWW theo từng term, xoá bản guest sau khi chuyển.

Server-side LWW: `INSERT … ON CONFLICT … DO UPDATE … WHERE EXCLUDED.updated_at
>= user_data.updated_at` (chi tiết [DB_SCHEMA.md §sync](./DB_SCHEMA.md)).

## 13. Theme — heatmap math

`src/features/theme/domain/theme.ts`:

- `heatBackground(shade)` → `color-mix(in oklab, var(--heat-to) {pct}%,
  var(--heat-from))` với `pct = round(shade×100)`. Đọc live CSS custom properties
  nên đổi endpoint là tô lại cả cloud, không cần re-render plumbing.
- `heatTextColor(shade, theme)` → nội suy tuyến tính hai endpoint, tính WCAG
  relative luminance, chọn `#f5f5f5` (nền tối, luminance < 0.4) hoặc `#1a1a1a`
  (nền sáng) để giữ tương phản trên mọi bảng màu.

## 14. Kiểm thử

Vitest, môi trường `node` (không DOM), `fake-indexeddb/auto` cho test IndexedDB.
Logic mới ở `domain/` đi kèm test. Bộ test phủ: bộ luật deinflection, phân bổ
furigana, flatten structured-content, import giàu (zip + URL mock) + tra cứu có
deinflect, và các ràng buộc §6 (gating, relapse, graduation, sàn ease, LWW).
Chạy `npm test` và `npm run typecheck` trước khi coi một việc là "xong".
</content>
