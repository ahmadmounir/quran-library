import { useSyncExternalStore } from "react";

/**
 * The reader's settings, kept on this device only (localStorage). Nothing is sent anywhere.
 * `applySettings` puts them on <html>: the `dark` class, the page colour, the language and its direction.
 * index.html runs the same few lines before the app loads, so a dark page never flashes white.
 */
export type ThemeChoice = "light" | "dark" | "auto";
/** The page colour by day */
export type DayPaper = "cream" | "white" | "sepia";
/** The page colour at night */
export type NightPaper = "black" | "green";
export type Language = "ar" | "en" | "tr";
/** How a phone (upright) moves between pages: swiping one page, or one long scroll */
export type ViewMode = "swipe" | "scroll";

export interface ReaderSettings {
  theme: ThemeChoice;
  dayPaper: DayPaper;
  nightPaper: NightPaper;
  language: Language;
  viewMode: ViewMode;
  /** The open book's 3D page turn and the phone's page slide (off: the page changes at once) */
  pageTurn: boolean;
  /** Keep the screen on while the mushaf is open */
  keepAwake: boolean;
  /** Turn to the page the reciter is reading */
  followReciter: boolean;
  /** On a phone, hide the bars once a recitation starts (a tap brings them back) */
  immersiveListening: boolean;
}

export const SETTINGS_KEY = "quran-libary:settings";
export const LANGUAGES: Language[] = ["ar", "en", "tr"];
export const DAY_PAPERS: DayPaper[] = ["cream", "white", "sepia"];
export const NIGHT_PAPERS: NightPaper[] = ["black", "green"];

/** The page colours, also the installed app's status bar (index.html has the same table) */
export const PAPER_COLORS: Record<DayPaper | NightPaper, string> = {
  cream: "#fbf6ea",
  white: "#ffffff",
  sepia: "#f3e6c8",
  black: "#080808",
  green: "#0b1713",
};

const browserLanguage = (): Language => {
  const preferred = typeof navigator === "undefined" ? [] : (navigator.languages ?? [navigator.language]);
  for (const tag of preferred) {
    const base = tag?.slice(0, 2).toLowerCase();
    if (base === "ar" || base === "en" || base === "tr") return base;
  }
  return "ar";
};

export const DEFAULT_SETTINGS: ReaderSettings = {
  theme: "auto",
  dayPaper: "cream",
  nightPaper: "black",
  language: "ar",
  viewMode: "swipe",
  pageTurn: true,
  keepAwake: true,
  followReciter: true,
  immersiveListening: true,
};

const read = (): ReaderSettings => {
  let saved: Partial<ReaderSettings> = {};
  try {
    saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") as Partial<ReaderSettings>;
  } catch {
    saved = {};
  }
  const settings = { ...DEFAULT_SETTINGS, language: browserLanguage(), ...saved };
  if (!LANGUAGES.includes(settings.language)) settings.language = DEFAULT_SETTINGS.language;
  if (!DAY_PAPERS.includes(settings.dayPaper)) settings.dayPaper = DEFAULT_SETTINGS.dayPaper;
  if (!NIGHT_PAPERS.includes(settings.nightPaper)) settings.nightPaper = DEFAULT_SETTINGS.nightPaper;
  return settings;
};

let current = read();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

const systemDark = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;

/** Light or dark right now ("auto" follows the system) */
export const resolvedDark = (settings: ReaderSettings = current): boolean =>
  settings.theme === "dark" || (settings.theme === "auto" && systemDark());

export function applySettings(settings: ReaderSettings = current): void {
  const root = document.documentElement;
  const dark = resolvedDark(settings);
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
  const paper = dark ? settings.nightPaper : settings.dayPaper;
  root.dataset.paper = paper;
  root.lang = settings.language;
  root.dir = settings.language === "ar" ? "rtl" : "ltr";
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((meta) => meta.setAttribute("content", PAPER_COLORS[paper]));
}

export const getSettings = (): ReaderSettings => current;

export function updateSettings(patch: Partial<ReaderSettings>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(current));
  } catch {
    // A private window may refuse: the choice still holds until the page closes
  }
  applySettings(current);
  notify();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

// "Auto" follows the system as it changes (a phone set to switch at sunset), and another tab's change shows here too
let darkSnapshot = typeof window === "undefined" ? false : resolvedDark(current);
if (typeof window !== "undefined") {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (current.theme !== "auto") return;
    applySettings(current);
    darkSnapshot = resolvedDark(current);
    notify();
  });
  window.addEventListener("storage", (event) => {
    if (event.key !== SETTINGS_KEY) return;
    current = read();
    applySettings(current);
    notify();
  });
}

/** The settings, re-rendering on every change */
export const useSettings = (): ReaderSettings => useSyncExternalStore(subscribe, getSettings, getSettings);

const getDark = () => {
  darkSnapshot = resolvedDark(current);
  return darkSnapshot;
};

/** True while the page is dark (the theme, or "auto" at night) */
export const useIsDark = (): boolean => useSyncExternalStore(subscribe, getDark, getDark);
