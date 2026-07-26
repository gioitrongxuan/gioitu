// Routing bằng History API (không thư viện) — phần THUẦN, không đụng DOM.
// URL ↔ Route hai chiều: các trang chính có path riêng (F5/refresh giữ chỗ),
// từ đang xem có deep-link /word/:pair/:term chia sẻ được. Phần gắn vào
// window.history nằm ở useHistoryRouting.ts; tách ra đây để test không cần DOM.

import { pairId } from "@/shared/languages";

// IA 4 khu (#149, DESIGN.md §4): Hôm nay / Tra cứu / Kho từ / Tôi. Khu "Kho
// từ" có các trang con (bản đồ từ, đã thuộc, kanji, học từ vựng) — mỗi trang
// vẫn là một Page phẳng để App switch đơn giản; khuOf() gom về khu cho tab bar.
export type Page = "today" | "search" | "cloud" | "learned" | "kanji" | "vocabstudy" | "me";

export type Khu = "today" | "search" | "words" | "me";

export type Route =
  | { kind: "page"; page: Page }
  | { kind: "word"; term_lang: string; native_lang: string; term: string };

// "/" là Bản đồ từ chứ không phải Hôm nay: mở app phải thấy ngay bản đồ trí
// nhớ và tra được liền — vòng lặp gốc của app (tra → "+" → thấy từ trên bản
// đồ). Hôm nay vẫn là một khu, ở /today.
const PAGE_PATHS: Record<Page, string> = {
  today: "/today",
  search: "/search",
  cloud: "/",
  learned: "/words/learned",
  kanji: "/words/kanji",
  vocabstudy: "/words/study",
  me: "/me",
};

/** Trang chủ — đích của path lạ và của deep-link /word sau khi mở panel. */
export const HOME_PAGE: Page = "cloud";

// Path thời chưa có 4 khu (bookmark/link cũ còn sống) → trang mới tương ứng.
const LEGACY_PATHS: Record<string, Page> = {
  "/learned": "learned",
  "/kanji": "kanji",
  "/vocabstudy": "vocabstudy",
  "/words": "cloud", // thời bản đồ từ chưa là trang chủ
};

export function khuOf(page: Page): Khu {
  if (page === "today" || page === "search" || page === "me") return page;
  return "words";
}

/** Trang mở ra khi bấm một khu trên tab bar (khu "Kho từ" mở bản đồ từ). */
export const KHU_HOME: Record<Khu, Page> = {
  today: "today",
  search: "search",
  words: "cloud",
  me: "me",
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
  if (pathname in LEGACY_PATHS) return { kind: "page", page: LEGACY_PATHS[pathname] };

  const word = pathname.match(/^\/word\/([a-z]{2})-([a-z]{2})\/(.+)$/);
  if (word) {
    try {
      return { kind: "word", term_lang: word[1], native_lang: word[2], term: decodeURIComponent(word[3]) };
    } catch {
      // %-escape hỏng trong term → coi như path lạ
    }
  }
  return { kind: "page", page: HOME_PAGE };
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
