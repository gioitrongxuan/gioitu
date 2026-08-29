// Chọn / nhập một **bộ từ** để sàng. Hai việc trong một màn vì chúng luôn đi
// cùng nhau: lần đầu vào thì danh sách rỗng nên phải nhập ngay, lần sau thì chọn
// bộ cũ là chính còn khung nhập thu lại thành một nút.
//
// Không làm overlay: khung nhập nằm thẳng trong luồng trang nên không cần bẫy
// focus, còn người dùng vẫn thấy danh sách bộ đã có trong lúc dán từ mới.

import { useEffect, useRef, useState } from "react";
import { LangPair } from "@/shared/languages";
import { Skeleton } from "@/shared/ui/Skeleton";
import { pushToast } from "@/shared/ui/Toasts";
import { DownloadIcon, TrashIcon } from "@/shared/ui/icons";
import { downloadBlob } from "@/shared/downloadBlob";
import {
  MAX_WORDSET_WORDS,
  ParsedWordset,
  parseWordset,
  sampleWordsetCsv,
  titleFromFilename,
} from "../domain/wordset";
import { createWordset, deleteWordset, listWordsets, Wordset } from "../data/wordsets";

/** Trần kích thước tệp nhận vào (2 MB) — một bộ 20k từ dạng TSV chưa tới 1 MB,
 *  quá mức này gần như chắc chắn là chọn nhầm tệp. */
const MAX_FILE_BYTES = 2 * 1024 * 1024;

export function WordsetPicker({
  pair,
  onPick,
}: {
  pair: LangPair;
  onPick: (set: Wordset) => void;
}) {
  const [sets, setSets] = useState<Wordset[] | null>(null);
  const [adding, setAdding] = useState(false);

  const reload = () => listWordsets(pair).then(setSets).catch(() => setSets([]));
  useEffect(() => {
    let alive = true;
    listWordsets(pair)
      .then((s) => alive && setSets(s))
      .catch(() => alive && setSets([]));
    return () => {
      alive = false;
    };
  }, [pair]);

  const remove = async (set: Wordset) => {
    if (!confirm(`Xoá bộ “${set.title}”? Tiến độ học của bạn không bị ảnh hưởng.`)) return;
    await deleteWordset(set.id);
    pushToast(`Đã xoá bộ “${set.title}”`, "info");
    await reload();
  };

  if (sets === null) return <Skeleton lines={2} />;

  return (
    <div className="wordset-picker">
      {sets.length > 0 && (
        <ul className="vocab-list-pick">
          {sets.map((s) => (
            <li key={s.id} className="wordset-row">
              <button className="link vocab-list-item" onClick={() => onPick(s)}>
                <span className="vocab-list-name">{s.title}</span>
                <span className="muted"> ({s.count} từ)</span>
              </button>
              <button
                className="link danger icon-label"
                aria-label={`Xoá bộ “${s.title}”`}
                title={`Xoá bộ “${s.title}”`}
                onClick={() => void remove(s)}
              >
                <TrashIcon size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding || sets.length === 0 ? (
        <WordsetForm
          pair={pair}
          onCancel={sets.length > 0 ? () => setAdding(false) : undefined}
          onCreated={async (set) => {
            setAdding(false);
            await reload();
            onPick(set);
          }}
        />
      ) : (
        <button className="export-btn" onClick={() => setAdding(true)}>
          Nhập bộ từ mới
        </button>
      )}
    </div>
  );
}

/** Khung dán/thả danh sách + xem trước trước khi ghi. */
function WordsetForm({
  pair,
  onCancel,
  onCreated,
}: {
  pair: LangPair;
  onCancel?: () => void;
  onCreated: (set: Wordset) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [source, setSource] = useState<"paste" | "file">("paste");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Xem trước tính lại theo từng phím gõ. Chỉ là tách chuỗi trên vài nghìn dòng
  // nên rẻ; đổi lại người dùng thấy ngay "3.240 từ" thay vì phải bấm mới biết.
  const parsed: ParsedWordset = parseWordset(text);

  const readFile = async (file: File) => {
    if (file.size > MAX_FILE_BYTES) {
      pushToast("Tệp quá lớn (tối đa 2 MB)", "warn");
      return;
    }
    setText(await file.text());
    setSource("file");
    if (!title.trim()) setTitle(titleFromFilename(file.name));
  };

  /** Tải tệp mẫu đúng cặp ngôn ngữ đang chọn. BOM ở đầu để Excel mở ra không vỡ
   *  chữ Việt/Nhật — cùng lý do với bản xuất CSV lịch sử ôn. */
  const downloadSample = () => {
    const csv = sampleWordsetCsv(pair.source, pair.target);
    downloadBlob(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }), `gioitu-bo-tu-mau-${pair.id}.csv`);
  };

  const save = async () => {
    const name = title.trim() || "Bộ từ chưa đặt tên";
    if (parsed.words.length === 0) return;
    setSaving(true);
    try {
      const id = await createWordset(
        { title: name, term_lang: pair.source, native_lang: pair.target, source },
        parsed.words,
      );
      pushToast(`Đã nhập ${parsed.words.length} từ vào bộ “${name}”`, "success");
      await onCreated({
        id,
        title: name,
        term_lang: pair.source,
        native_lang: pair.target,
        source,
        count: parsed.words.length,
        importedAt: Date.now(),
      });
    } catch (e) {
      console.error("create wordset failed", e);
      pushToast("Không lưu được bộ từ", "warn");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="wordset-form">
      <label className="wordset-field">
        Tên bộ
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ví dụ: JLPT N1"
          enterKeyHint="done"
        />
      </label>

      <label className="wordset-field">
        Danh sách từ
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSource("paste");
          }}
          rows={8}
          spellCheck={false}
          lang={pair.source === "ja" ? "ja" : undefined}
          placeholder={"Mỗi dòng một từ. Có thể kèm cột, ngăn bằng Tab hoặc dấu phẩy:\nmặt chữ, cách đọc, nghĩa, bài"}
        />
      </label>

      <p className="muted wordset-hint">
        Nhận cả dạng 食べる【たべる】 và dòng có đánh số. Dán tối đa {MAX_WORDSET_WORDS.toLocaleString("vi-VN")} từ.
        Chưa rõ điền thế nào thì tải tệp mẫu bên dưới, sửa lại rồi nhập vào.
      </p>

      <div className="wordset-actions">
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.csv,.tsv,text/plain,text/csv"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void readFile(f);
            e.target.value = "";
          }}
        />
        <button className="export-btn" onClick={() => fileRef.current?.click()}>
          Chọn tệp .txt / .csv
        </button>
        <button className="export-btn" onClick={downloadSample}>
          <DownloadIcon size={16} />
          Tải tệp mẫu
        </button>
        <button className="primary" disabled={parsed.words.length === 0 || saving} onClick={() => void save()}>
          {saving ? "Đang lưu…" : `Tạo bộ (${parsed.words.length} từ)`}
        </button>
        {onCancel && (
          <button className="link" onClick={onCancel}>
            Huỷ
          </button>
        )}
      </div>

      {text.trim() !== "" && (
        <p className="muted">
          Đọc được <b>{parsed.words.length}</b> từ
          {parsed.duplicates > 0 && <> · bỏ {parsed.duplicates} dòng trùng</>}
          {parsed.skipped > 0 && <> · bỏ {parsed.skipped} dòng không có mặt chữ</>}
          {parsed.truncated > 0 && <> · cắt {parsed.truncated} dòng vượt trần</>}
        </p>
      )}
    </div>
  );
}
