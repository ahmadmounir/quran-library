import { useSyncExternalStore } from "react";

/**
 * "Install the app" (a PWA on the home screen). Chrome and Edge announce that they can install the page with
 * `beforeinstallprompt` once, early: it is kept from the moment the app loads (main.tsx imports this file first) and
 * offered in the settings. iPhones have no such event: the settings explain "Share → Add to Home Screen" there.
 */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

/** The app already runs from the home screen */
export const isInstalled = (): boolean =>
  typeof window !== "undefined" &&
  ((navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches);

/** An iPhone or iPad in Safari: installing is "Share → Add to Home Screen" */
export const isAppleMobile = (): boolean =>
  typeof navigator !== "undefined" &&
  (/\b(iPhone|iPad|iPod)\b/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

export async function startInstall(): Promise<boolean> {
  if (!deferred) return false;
  const event = deferred;
  deferred = null;
  notify();
  await event.prompt();
  return (await event.userChoice).outcome === "accepted";
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const canInstall = () => deferred !== null;

/** True while the browser offers to install the app */
export const useCanInstall = (): boolean => useSyncExternalStore(subscribe, canInstall, canInstall);
