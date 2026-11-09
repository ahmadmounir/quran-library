/**
 * Keeping files on the device (Cache Storage, the same caches the service worker reads). Used by the whole-mushaf
 * download the reader starts (and its update on the schedule they chose).
 */
import { APP_CACHE, type OfflineFile } from "./offlinePlan";
import { parseUpdateEvery, type MushafUpdateEvery } from "./offlineRules";

/** This browser can keep files (Cache Storage + service worker, on https). */
export const offlineSupported =
  typeof window !== "undefined" && window.isSecureContext && "caches" in window && "serviceWorker" in navigator;

export const absoluteUrl = (url: string): string => new URL(url, window.location.origin).href;

export async function storedUrls(cacheNames: string[]): Promise<Set<string>> {
  const urls = new Set<string>();
  for (const name of cacheNames) {
    if (!(await caches.has(name))) continue;
    const cache = await caches.open(name);
    for (const request of await cache.keys()) urls.add(request.url);
  }
  return urls;
}

export interface KeptFile {
  bytes: number;
}

/**
 * Fetches one file and keeps it. `force-cache`: the browser's own copy is used if it has one (one request less on the
 * files Worker), and it tells the service worker that this request keeps its file itself.
 */
export async function keepFile(file: OfflineFile, signal: AbortSignal): Promise<KeptFile> {
  const response = await fetch(file.url, { cache: "force-cache", signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const cache = await caches.open(file.cache);
  await cache.put(file.url, response.clone());
  return { bytes: (await response.arrayBuffer()).byteLength };
}

// What this device remembers about the whole-mushaf download
const WANTED_KEY = "quran-library:mushaf-wanted";
const UPDATE_EVERY_KEY = "quran-library:mushaf-update-every";
const CHECKED_AT_KEY = "quran-library:mushaf-checked-at";

const readKey = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeKey = (key: string, value: string | null): void => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // without storage the scheduled update simply does not happen
  }
};

/**
 * The reader downloaded the whole mushaf themselves (pressed download, and neither stopped nor removed it): only then
 * may the update they chose run by itself.
 */
export const mushafWanted = (): boolean => readKey(WANTED_KEY) === "1";
export const setMushafWanted = (wanted: boolean): void => writeKey(WANTED_KEY, wanted ? "1" : null);

/** How often the downloaded mushaf is checked and completed: once (never again), every two weeks, every month. */
export const mushafUpdateEvery = (): MushafUpdateEvery => parseUpdateEvery(readKey(UPDATE_EVERY_KEY));
export const setMushafUpdateEvery = (every: MushafUpdateEvery): void =>
  writeKey(UPDATE_EVERY_KEY, every === "once" ? null : every);

/** When the downloaded mushaf was last found complete (null: never). */
export function mushafCheckedAt(): number | null {
  const at = Number(readKey(CHECKED_AT_KEY));
  return Number.isFinite(at) && at > 0 ? at : null;
}
export const setMushafCheckedAt = (at: number): void => writeKey(CHECKED_AT_KEY, String(at));

/** The app itself (its page and the files this visit loaded), so it opens offline to read what was downloaded. */
export async function keepApp(signal: AbortSignal): Promise<void> {
  const base = import.meta.env.BASE_URL;
  const cache = await caches.open(APP_CACHE);
  const page = await fetch(base, { cache: "no-store", signal });
  if (page.ok) await cache.put(base, page);

  const assets = new Set(
    performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((name) => {
        const url = new URL(name);
        return url.origin === window.location.origin && url.pathname.startsWith(`${base}assets/`);
      }),
  );
  for (const asset of assets) {
    if (!(await cache.match(asset))) await keepFile({ url: asset, cache: APP_CACHE, bytes: 0 }, signal).catch(() => null);
  }
}

export const isQuotaError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "QuotaExceededError";

/** Asks the browser not to clear the kept files when space runs low (Chrome decides by itself, without a question). */
export async function askPersistentStorage(): Promise<void> {
  await navigator.storage?.persist?.().catch(() => false);
}

/** Free space left for this site, when the browser tells. */
export async function freeBytes(): Promise<number | null> {
  const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
  return estimate?.quota !== undefined && estimate.usage !== undefined ? estimate.quota - estimate.usage : null;
}
