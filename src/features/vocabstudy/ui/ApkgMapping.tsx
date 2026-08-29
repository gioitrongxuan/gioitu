// Bước ghép trường khi nhập một gói Anki (.apkg).
//
// Đường nhập bằng văn bản có ô dán để người dùng nhìn thấy dữ liệu; ở đây không
// có ô ấy, vì một gói hai nghìn thẻ nhồi vào `<textarea>` thì vừa vô dụng vừa
// treo tab. Thứ thay thế nó là bảng ghép trường, cộng khung xem trước dùng chung
// của màn nhập: người dùng vẫn thấy ngay cột nào rơi vào đâu trước khi ghi.
//
// Thành phần này KHÔNG giữ trạng thái nào: lựa chọn nằm ở khung nhập bên ngoài,
// chỗ đã cầm sẵn kết quả phân tích để bày xem trước và để ghi. Một nguồn sự thật
// thì không có cảnh bảng ghép nói một đằng, khung xem trước bày một nẻo.

import { AnkiCollection, ApkgSelection, FieldMapping, FieldRole, guessMapping } from "../domain/ankiDeck";
import { SqliteFile } from "../domain/sqlite";
import { ApkgArchive } from "../data/apkgFile";

/** Một gói đã mở và đọc xong phần cấu trúc, sẵn sàng để ghép trường. */
export interface ApkgSource {
  fileName: string;
  /** Giữ lại để lúc lưu còn bóc media — mở gói chỉ đọc mục lục, chưa đụng thân tệp. */
  archive: ApkgArchive;
  db: SqliteFile;
  collection: AnkiCollection;
  /** Tên tệp thật → tên entry trong gói. Rỗng khi gói không kèm media. */
  mediaEntries: Map<string, string>;
}

/**
 * Nhãn tiếng Việt của từng vai trò, chia hai nhóm đúng như người dùng nghĩ về
 * chúng: cột chữ đi vào lưới từ vựng, media chỉ hiện khi mở thẻ.
 */
const ROLE_GROUPS: { title: string; roles: { role: FieldRole; label: string }[] }[] = [
  {
    title: "Cột chữ",
    roles: [
      { role: "term", label: "Mặt chữ" },
      { role: "reading", label: "Cách đọc" },
      { role: "gloss", label: "Nghĩa" },
      { role: "example", label: "Ví dụ" },
      { role: "exampleTranslation", label: "Dịch ví dụ" },
      { role: "exampleFurigana", label: "Ruby của ví dụ" },
    ],
  },
  {
    title: "Media",
    roles: [
      { role: "image", label: "Ảnh minh hoạ" },
      { role: "audio", label: "Phát âm từ" },
      { role: "exampleAudio", label: "Phát âm câu" },
    ],
  },
];

/** Mọi vai trò, phẳng ra — dùng khi phải quét để gỡ vai trò cũ của một trường. */
const ALL_ROLES = ROLE_GROUPS.flatMap((g) => g.roles);

/** Giá trị của mục "không dùng trường nào" — chuỗi rỗng vì `<option>` chỉ mang chuỗi. */
const NO_FIELD = "";

export function ApkgMapping({
  source,
  selection,
  onChange,
}: {
  source: ApkgSource;
  selection: ApkgSelection;
  onChange: (next: ApkgSelection) => void;
}) {
  const { noteTypes, decks } = source.collection;
  const noteType = noteTypes.find((t) => t.id === selection.noteTypeId);

  if (!noteType) return <p className="empty">Gói này không có thẻ nào để nhập.</p>;

  const pickNoteType = (id: number) => {
    const next = noteTypes.find((t) => t.id === id);
    // Loại thẻ khác thì danh sách trường cũng khác, nên bảng ghép cũ không còn
    // nghĩa gì: đoán lại từ đầu và bỏ luôn bộ lọc deck của loại cũ.
    onChange({ noteTypeId: id, deckId: null, mapping: guessMapping(next?.fields ?? []) });
  };

  const setRole = (role: FieldRole, value: string) => {
    const mapping: FieldMapping = { ...selection.mapping };
    if (value === NO_FIELD) {
      delete mapping[role];
    } else {
      const index = Number(value);
      // Một trường chỉ giữ một vai trò: gán cho vai trò mới thì gỡ khỏi vai trò
      // cũ, nếu không cùng một cột lặng lẽ đổ vào hai chỗ.
      for (const other of ALL_ROLES) if (mapping[other.role] === index) delete mapping[other.role];
      mapping[role] = index;
    }
    onChange({ ...selection, mapping });
  };

  return (
    <div className="apkg-mapping">
      {noteTypes.length > 1 && (
        <label className="wordset-field">
          Loại thẻ
          <select value={selection.noteTypeId} onChange={(e) => pickNoteType(Number(e.target.value))}>
            {noteTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.noteCount.toLocaleString("vi-VN")} thẻ)
              </option>
            ))}
          </select>
        </label>
      )}

      {decks.length > 1 && (
        <label className="wordset-field">
          Deck
          <select
            value={selection.deckId ?? NO_FIELD}
            onChange={(e) =>
              onChange({ ...selection, deckId: e.target.value === NO_FIELD ? null : Number(e.target.value) })
            }
          >
            <option value={NO_FIELD}>Tất cả deck</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.noteCount.toLocaleString("vi-VN")} thẻ)
              </option>
            ))}
          </select>
        </label>
      )}

      {ROLE_GROUPS.map((group) => (
        <fieldset key={group.title} className="apkg-group">
          <legend className="muted">{group.title}</legend>
          <div className="apkg-roles">
            {group.roles.map(({ role, label }) => (
              <label key={role} className="wordset-field">
                {label}
                <select value={selection.mapping[role] ?? NO_FIELD} onChange={(e) => setRole(role, e.target.value)}>
                  <option value={NO_FIELD}>— bỏ trống —</option>
                  {noteType.fields.map((field, i) => (
                    <option key={`${field}:${i}`} value={i}>
                      {field}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      <p className="muted">
        Đã đoán sẵn theo tên trường trong gói. Thấy cột nào lệch thì đổi lại — khung xem trước bên dưới đổi theo ngay.
        Ảnh và phát âm chỉ hiện khi mở thẻ của một từ.
      </p>
    </div>
  );
}
