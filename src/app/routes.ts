// Routing bằng History API (không thư viện) — phần THUẦN, không đụng DOM.
// URL ↔ Route hai chiều: các trang chính có path riêng (F5/refresh giữ chỗ),
// từ đang xem có deep-link /word/:pair/:term chia sẻ được. Phần gắn vào
// window.history nằm ở useHistoryRouting.ts; tách ra đây để test không cần DOM.

import { pairId } from "@/shared/languages";

export type Page = "home" | "learned" | "kanji" | "vocabstudy";

export type Route =
  | { kind: "page"; page: Page }
  | { kind: "word"; term_lang: string; native_lang: string; term: string };

const PAGE_PATHS: Record<Page, string> = {
  home: "/",
  learned: "/learned",
  kanji: "/kanji",
  vocabstudy: "/vocabstudy",
};

export function routeToPath(route: Route): string {
  if (route.kind === "word")
    return `/word/${pairId(route.term_lang, route.native_lang)}/${encodeURIComponent(route.term)}`;
  return PAGE_PATHS[route.page];
}

// Path lạ (gõ tay, link cũ) đưa về trang chủ thay vì màn 404 — app một trang,
// mọi nội dung đều với tới được từ đó.
export function parsePath(pathname: string): Route {
  const page = (Object.keys(PAGE_PATHS) as Page[]).find((p) => PAGE_PATHS[p] === pathname);
  if (page) return { kind: "page", page };

  const word = pathname.match(/^\/word\/([a-z]{2})-([a-z]{2})\/(.+)$/);
  if (word) {
    try {
      return { kind: "word", term_lang: word[1], native_lang: word[2], term: decodeURIComponent(word[3]) };
    } catch {
      // %-escape hỏng trong term → coi như path lạ
    }
  }
  return { kind: "page", page: "home" };
}

// --- "Back đóng overlay" -----------------------------------------------------
// Mỗi overlay/panel đang mở chiếm một entry trong History; nút Back đóng cái
// trên cùng thay vì thoát app. Stack này thuần để test được: goBack (thực tế là
// history.back()) do caller inject.
//
// Hai đường đóng một overlay:
//   • Back của trình duyệt → popstate → handlePop() gọi close() của entry trên cùng.
//   • Nút X trong UI → remove(entry) phải RÚT LẠI entry đã đẩy (goBack) kẻo lần
//     Back sau bị "nuốt" một nhịp; popstate do chính goBack này gây ra được đếm
//     vào `suppress` để handlePop bỏ qua.

export interface BackEntry {
  close: () => void;
  /** Entry còn nằm trong History (chưa bị Back rút đi). */
  inHistory: boolean;
}

export function createBackStack(goBack: () => void) {
  const stack: BackEntry[] = [];
  let suppress = 0;

  return {
    push(close: () => void): BackEntry {
      const entry: BackEntry = { close, inHistory: true };
      stack.push(entry);
      return entry;
    },

    /** Một popstate vừa tới. Trả true nếu đã xử lý (đóng overlay / pop tự gây). */
    handlePop(): boolean {
      if (suppress > 0) {
        suppress--;
        return true;
      }
      const top = stack.pop();
      if (!top) return false; // không có overlay nào — điều hướng trang thật
      top.inHistory = false;
      top.close();
      return true;
    },

    /** Overlay đóng bằng UI (không qua Back): gỡ khỏi stack và rút entry History. */
    remove(entry: BackEntry): void {
      const i = stack.indexOf(entry);
      if (i < 0) return;
      stack.splice(i, 1);
      // Chỉ rút được entry trên cùng (Back lùi đúng một nhịp). Entry ở giữa
      // (hiếm — các overlay ở app này đóng theo LIFO) đành để kẹt lại: một nhịp
      // Back sau đó sẽ pop nó thành no-op vô hại vì URL không đổi.
      if (entry.inHistory && i === stack.length) {
        suppress++;
        goBack();
      }
    },

    depth(): number {
      return stack.length;
    },
  };
}
