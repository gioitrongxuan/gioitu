// Ảnh minh hoạ và nút phát âm gắn thêm vào mặt sau thẻ ôn, cho thẻ sinh ra từ
// một bộ nhập từ gói Anki.
//
// App bơm component này vào `ReviewSession` qua prop `renderBackExtras` — nhờ
// vậy `review/` không phải biết `vocabstudy/` tồn tại, chiều phụ thuộc vẫn một
// chiều. Thẻ đến từ tra cứu không có `from_wordset` nên không dựng gì.
//
// Media chỉ nằm trên máy đã nhập gói `.apkg` (151 MB một bộ, không đồng bộ). Máy
// khác vẫn ôn được vì nghĩa và câu ví dụ đã chép sang chính thẻ; ở đó khối này
// đơn giản là rỗng.

import { useEffect, useState } from "react";
import { VocabEntry } from "@/shared/types";
import { WordsetWord } from "@/shared/db";
import { SpeakerIcon } from "@/shared/ui/icons";
import { getWordsetMedia } from "../data/wordsetMedia";
import { findWordsetWord } from "../data/wordsets";

export function WordsetBackExtras({ entry }: { entry: VocabEntry }) {
  const row = useWordsetRow(entry);
  const image = useMediaUrl(entry.from_wordset, row?.imageName);
  const audio = useMediaUrl(entry.from_wordset, row?.audioName);
  const exampleAudio = useMediaUrl(entry.from_wordset, row?.exampleAudioName);

  if (!image && !audio && !exampleAudio) return null;

  return (
    <div className="wordset-extras">
      {(audio || exampleAudio) && (
        <div className="wordset-extras-audio">
          {audio && <PlayButton src={audio} label={`Nghe phát âm của ${entry.term}`} text="Phát âm từ" />}
          {exampleAudio && <PlayButton src={exampleAudio} label="Nghe câu ví dụ" text="Phát âm câu" />}
        </div>
      )}
      {image && (
        <img className="wordset-extras-image" src={image} alt={`Ảnh minh hoạ cho ${entry.term}`} loading="lazy" />
      )}
    </div>
  );
}

function PlayButton({ src, label, text }: { src: string; label: string; text: string }) {
  return (
    <button
      type="button"
      className="export-btn"
      aria-label={label}
      onClick={() => void new Audio(src).play().catch((e) => console.warn("phát âm thất bại", e))}
    >
      <SpeakerIcon size={16} />
      {text}
    </button>
  );
}

/** Dòng gốc trong bộ từ — chỗ giữ tên tệp media của thẻ này. */
function useWordsetRow(entry: VocabEntry): WordsetWord | undefined {
  const [row, setRow] = useState<WordsetWord | undefined>(undefined);
  const setId = entry.from_wordset;
  const { term, reading } = entry;

  useEffect(() => {
    if (!setId) {
      setRow(undefined);
      return;
    }
    let alive = true;
    void findWordsetWord(setId, term, reading ?? "")
      .then((r) => alive && setRow(r))
      // Bộ từ đã bị xoá, hoặc thẻ đồng bộ từ máy khác nên máy này không có bộ:
      // thẻ vẫn ôn bình thường, chỉ là không có ảnh và phát âm.
      .catch(() => alive && setRow(undefined));
    return () => {
      alive = false;
    };
  }, [setId, term, reading]);

  return row;
}

/**
 * URL tạm của một tệp media. Thu hồi ở bước dọn dẹp là bắt buộc: mỗi
 * `createObjectURL` ghim cả blob trong bộ nhớ tới khi tab đóng, mà một phiên ôn
 * đi qua hàng trăm thẻ.
 */
function useMediaUrl(setId: string | undefined, name: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!setId || !name) {
      setUrl(null);
      return;
    }
    let revoked = false;
    let current: string | null = null;
    void getWordsetMedia(setId, name)
      .then((blob) => {
        if (!blob || revoked) return;
        current = URL.createObjectURL(blob);
        setUrl(current);
      })
      .catch((e) => console.warn("không đọc được media của bộ từ", e));

    return () => {
      revoked = true;
      if (current) URL.revokeObjectURL(current);
      setUrl(null);
    };
  }, [setId, name]);

  return url;
}
