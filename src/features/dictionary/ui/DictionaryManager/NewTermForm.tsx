// Khối "thêm từ mới" thu gọn cho cặp ngôn ngữ hiện tại. Chỉ là vỏ <details> bọc
// TermForm (mode="new") — toàn bộ trường phong phú dùng chung với lúc sửa.

import { useState } from "react";
import { LangPair } from "@/shared/languages";
import { TermForm } from "./TermForm";

export function NewTermForm({
  pair,
  onSaved,
  onError,
}: {
  pair: LangPair;
  onSaved: () => void;
  onError: (s: string | null) => void;
}) {
  // `key` ép TermForm dựng lại (xoá trắng) sau mỗi lần lưu hoặc đổi cặp ngôn ngữ.
  const [seq, setSeq] = useState(0);

  return (
    <details className="new-term">
      <summary>+ Thêm từ mới ({pair.label})</summary>
      <TermForm
        key={`${pair.id}-${seq}`}
        pair={pair}
        mode="new"
        onError={onError}
        onDone={() => {
          setSeq((n) => n + 1);
          onSaved();
        }}
      />
    </details>
  );
}
