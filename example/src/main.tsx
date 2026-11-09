// First: Chrome announces "this page can be installed" only once, early
import "./lib/installApp";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { applySettings } from "./settings/store";
import { App } from "./App";
import "./styles/index.css";

applySettings();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// The service worker keeps every page that is read (and the whole mushaf when the reader downloads it), so the
// mushaf opens offline. Not during development: files change there without a new version.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
  });
}
