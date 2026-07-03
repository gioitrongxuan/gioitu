import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "@/features/theme/ThemeProvider";
import { applyTheme, loadTheme } from "@/features/theme/domain/theme";
import "../styles/styles.css";

// Apply the saved palette before the first render so there is no flash of the
// default colours; the provider keeps it in sync afterwards.
applyTheme(loadTheme());

// App-shell offline (public/sw.js) — chỉ bản build: dev server không có asset
// hash và HMR sẽ đánh nhau với cache. Đăng ký hỏng thì thôi, offline là phụ.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
