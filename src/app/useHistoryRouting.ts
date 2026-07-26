// Gắn Route/BackStack (routes.ts — thuần) vào window.history thật. Hai hook:
//   • useAppRoute    — trang hiện tại ↔ URL: gotoPage đẩy entry mới, popstate
//                      (Back/Forward) parse URL ngược lại state; deep-link
//                      /word/... lúc mở app được trả về qua onWordRoute.
//   • useBackEntry   — một overlay đang mở chiếm một entry History để Back đóng
//                      overlay thay vì thoát app (mobile hay thoát oan).

import { useEffect, useRef, useState } from "react";
import { Page, Route, createBackStack, parsePath, routeToPath } from "./routes";

// Module-level: History của trình duyệt là tài nguyên toàn cục duy nhất, còn
// MainApp có thể remount (đổi user) mà không được quên các entry đã đẩy.
const backStack = createBackStack(() => window.history.back());

export type WordRoute = Extract<Route, { kind: "word" }>;

export function useAppRoute(onWordRoute: (route: WordRoute) => void) {
  const [page, setPage] = useState<Page>(() => {
    const route = parsePath(window.location.pathname);
    return route.kind === "page" ? route.page : "home";
  });

  // Ref mới nhất cho listener gắn một lần — không re-subscribe mỗi render.
  const onWordRouteRef = useRef(onWordRoute);
  onWordRouteRef.current = onWordRoute;
  const pageRef = useRef(page);
  pageRef.current = page;

  // Deep-link /word/... lúc mở app: đưa URL về trang chủ TRƯỚC rồi mới mở panel
  // — panel sẽ tự chiếm một entry (useBackEntry) nên Back đóng panel về trang
  // chủ, thay vì kẹt trên một URL từ đã đóng panel.
  const openedDeepLink = useRef(false);
  useEffect(() => {
    // Chạy đúng một lần kể cả StrictMode dev (effect mount chạy đôi): tra một
    // từ hai lần chỉ phí, nhưng cẩn thận vẫn hơn.
    if (openedDeepLink.current) return;
    openedDeepLink.current = true;
    const route = parsePath(window.location.pathname);
    if (route.kind !== "word") return;
    window.history.replaceState(null, "", routeToPath({ kind: "page", page: "home" }));
    onWordRouteRef.current(route);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onPop = () => {
      if (backStack.handlePop()) {
        // Back vừa đóng một overlay. URL sau khi pop có thể đang là path của từ
        // (entry do panel chiếm) — kéo về path trang hiện tại cho khớp màn hình.
        window.history.replaceState(null, "", routeToPath({ kind: "page", page: pageRef.current }));
        return;
      }
      const route = parsePath(window.location.pathname);
      if (route.kind === "page") setPage(route.page);
      else onWordRouteRef.current(route); // Forward quay lại một từ đã xem
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const gotoPage = (next: Page) => {
    if (next === page) return;
    window.history.pushState(null, "", routeToPath({ kind: "page", page: next }));
    setPage(next);
  };

  return { page, gotoPage };
}

/**
 * Overlay/panel đang mở chiếm một entry History: Back đóng nó (close) thay vì
 * rời app; đóng bằng nút X thì entry được rút lại để Back sau không bị nuốt.
 * URL giữ nguyên — overlay không có path riêng (trừ panel từ, xem useWordUrl).
 */
export function useBackEntry(isOpen: boolean, close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;

  useEffect(() => {
    if (!isOpen) return;
    window.history.pushState(null, "", window.location.href);
    const entry = backStack.push(() => closeRef.current());
    return () => backStack.remove(entry);
  }, [isOpen]);
}

/**
 * Phản chiếu từ đang xem trong panel chi tiết lên URL (deep-link chia sẻ được).
 * Entry History đã do useBackEntry của panel chiếm; ở đây chỉ replaceState nên
 * đi tiếp giữa các từ trong panel không phình lịch sử — Back luôn đóng panel.
 * Gọi SAU useBackEntry của panel để replace đè lên entry vừa đẩy.
 */
export function useWordUrl(word: WordRoute | null) {
  useEffect(() => {
    if (!word) return;
    window.history.replaceState(null, "", routeToPath(word));
  }, [word?.term, word?.term_lang, word?.native_lang]); // eslint-disable-line react-hooks/exhaustive-deps
}
