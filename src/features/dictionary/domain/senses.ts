// Nhóm sense theo từ loại kiểu jisho: các sense liên tiếp cùng bộ tag chỉ in
// hàng tag ở sense đầu — mắt bám theo số thứ tự nghĩa, không bị cùng một chuỗi
// "n, danh từ" lặp lại từng dòng.

/**
 * Với mỗi sense, có nên hiện hàng tag không: true khi bộ tag khác sense liền
 * trước (so theo thứ tự — tag đảo chỗ coi như bộ mới; sense đầu luôn true).
 */
export function tagRowVisibility(senses: readonly { tags: string[] }[]): boolean[] {
  return senses.map((sense, i) => {
    if (i === 0) return true;
    const prev = senses[i - 1].tags;
    return sense.tags.length !== prev.length || sense.tags.some((tag, j) => tag !== prev[j]);
  });
}
