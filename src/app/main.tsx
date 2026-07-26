import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// Base css phải đứng TRƯỚC App: các component tự import css của feature mình
// (#168), thứ tự import quyết định thứ tự cascade trong bundle.
import "../styles/styles.css";
import App from "./App";
import { ThemeProvider } from "@/features/theme/ThemeProvider";
import { applyTheme, loadTheme } from "@/features/theme/domain/theme";

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
