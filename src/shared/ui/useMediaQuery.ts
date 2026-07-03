// Theo dõi một media query từ React (đổi kích thước / xoay máy cập nhật ngay).

import { useEffect, useState } from "react";

/** Breakpoint duy nhất của app — khớp các @media 760px trong styles.css. */
export const MOBILE_MEDIA_QUERY = "(max-width: 759px)";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange(); // query đổi giữa hai lần render thì đồng bộ lại ngay
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}
