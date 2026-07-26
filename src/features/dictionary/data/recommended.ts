// Danh sách "Từ điển đề xuất" cho onboarding (#152): các .zip Yomitan host
// trên chính server (cùng origin — không vướng CORS), tải một chạm bằng
// importYomitanUrl. Xem server/src/features/dictionary/recommendedRoutes.ts.

import { LangPair } from "@/shared/languages";

export interface RecommendedDict {
  file: string;
  name: string;
  description?: string;
  source: string;
  target: string;
  /** Đường dẫn cùng origin để importYomitanUrl tải thẳng. */
  url: string;
}

export async function fetchRecommendedDicts(pair: LangPair): Promise<RecommendedDict[]> {
  try {
    const res = await fetch(`/api/dict/recommended?source=${pair.source}&target=${pair.target}`);
    if (!res.ok) return [];
    const list = (await res.json()) as RecommendedDict[];
    return Array.isArray(list) ? list : [];
  } catch {
    // Offline / server chưa cấu hình gói đề xuất: onboarding vẫn chạy, chỉ ẩn
    // nút tải — đề xuất là tiện ích thêm, không phải điều kiện dùng app.
    return [];
  }
}
