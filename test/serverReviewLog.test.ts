// Biên nhận nhật ký ôn đẩy lên server (/api/sync/log) — logic thuần, không DB.

import { describe, it, expect } from "vitest";
import { pushableLogRows } from "@server/features/sync/reviewLogRows";

const good = {
  term: "犬",
  term_lang: "ja",
  grade: "good",
  ts: 1000,
  interval_before: 1440,
  interval_after: 3600,
};

describe("pushableLogRows", () => {
  it("giữ dòng đủ trường, bỏ dòng hỏng thay vì để cả mẻ ROLLBACK", () => {
    const rows = pushableLogRows([
      good,
      { ...good, term: "" }, // mặt chữ rỗng
      { ...good, term_lang: undefined }, // thiếu ngôn ngữ
      { ...good, ts: "hôm qua" }, // ts không phải số
      { ...good, interval_after: Number.NaN },
      null,
      "rác",
      { ...good, term: "猫" },
    ]);
    expect(rows.map((r) => r.term)).toEqual(["犬", "猫"]);
  });

  it("bỏ điểm lạ: grade là một phần khoá duy nhất nên không được nhận tự do", () => {
    expect(pushableLogRows([{ ...good, grade: "GOOD" }])).toEqual([]);
    expect(pushableLogRows([{ ...good, grade: "perfect" }])).toEqual([]);
    for (const grade of ["again", "hard", "good", "easy"]) {
      expect(pushableLogRows([{ ...good, grade }])).toHaveLength(1);
    }
  });

  it("interval âm/0 vẫn hợp lệ (thẻ mới có interval 0)", () => {
    expect(pushableLogRows([{ ...good, interval_before: 0, interval_after: 0 }])).toHaveLength(1);
  });
});
