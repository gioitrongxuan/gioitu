import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ThemeProvider } from "@/features/theme/ThemeProvider";
import { applyTheme, loadTheme } from "@/features/theme/domain/theme";
import "../styles/styles.css";

// Apply the saved palette before the first render so there is no flash of the
// default colours; the provider keeps it in sync afterwards.
applyTheme(loadTheme());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
