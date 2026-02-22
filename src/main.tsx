import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import App from "./App.tsx";
import "./index.css";
import { initTelegramMiniApp } from "@/lib/telegramWebApp";

initTelegramMiniApp();

// GitHub Pages SPA fallback: restore the original path saved by 404.html
const saved = sessionStorage.getItem("__spa_path__");
if (saved && /^\/[^/]/.test(saved)) {
  sessionStorage.removeItem("__spa_path__");
  history.replaceState(null, "", saved);
}

createRoot(document.getElementById("root")!).render(
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
    <App />
  </ThemeProvider>
);
